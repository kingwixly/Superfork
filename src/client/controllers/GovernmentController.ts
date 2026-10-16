/**
 * GovernmentController — the in-game Government button and panel.
 *
 * Shows your government and this match's research points; the panel lists
 * the governments you have unlocked with what each one does, and switches
 * (an intent; the engine enforces the cooldown and the transition).
 */

import {
  Effects,
  GOVERNMENT_SWITCH_COOLDOWN,
  GovernmentId,
  GOVERNMENTS,
} from "@openfront/engine-api/game/Progression";
import { EventBus } from "@openfront/shared/EventBus";
import { Controller } from "../Controller";
import { SendSetGovernmentIntentEvent } from "../Transport";
import { translateText } from "../Utils";
import { GameView } from "../view";

const EFFECT_ORDER: (keyof Effects)[] = [
  "gold",
  "troopGrowth",
  "maxTroops",
  "attackSpeed",
  "buildSpeed",
  "defense",
  "research",
];

/** "+20% gold, -20% attack speed" for a government. */
export function describeEffects(e: Effects): string {
  const parts = EFFECT_ORDER.filter((k) => Math.abs(e[k] - 1) > 1e-6).map(
    (k) => {
      const pct = Math.round((e[k] - 1) * 100);
      return translateText(`progress.effect.${k}`, {
        pct: `${pct > 0 ? "+" : ""}${pct}%`,
      });
    },
  );
  return parts.length === 0
    ? translateText("progress.effect.none")
    : parts.join(", ");
}

export const governmentName = (id: GovernmentId) =>
  translateText(`progress.government.${id}`);

export class GovernmentController implements Controller {
  private button: HTMLButtonElement | null = null;
  private panel: HTMLDivElement | null = null;
  private signature = "";

  constructor(
    private eventBus: EventBus,
    private game: GameView,
  ) {}

  init() {
    if (typeof document === "undefined") return;
    const b = document.createElement("button");
    b.setAttribute("data-government-button", "");
    b.style.cssText =
      "position:fixed;left:12px;bottom:160px;z-index:50;background:rgba(15,23,42,.9);color:#fff;" +
      "border:1px solid rgba(255,255,255,.25);border-radius:8px;padding:6px 10px;" +
      "font:600 12px system-ui,sans-serif;cursor:pointer;display:none;";
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggle();
    });
    document.body.appendChild(b);
    this.button = b;
  }

  tick() {
    const me = this.game.myPlayer();
    const b = this.button;
    if (b === null) return;
    if (me === null || !me.isAlive() || this.game.inSpawnPhase()) {
      b.style.display = "none";
      return;
    }
    b.style.display = "block";
    const text = translateText("progress.government_button", {
      government: governmentName(me.government()),
      rp: me.researchPoints(),
    });
    if (b.textContent !== text) b.textContent = text;
    if (this.panel !== null) this.render();
  }

  private toggle() {
    if (this.panel !== null) {
      this.panel.remove();
      this.panel = null;
      return;
    }
    const p = document.createElement("div");
    p.setAttribute("data-government-panel", "");
    p.style.cssText =
      "position:fixed;left:min(150px,12px + 25vw);bottom:160px;z-index:60;width:min(360px,calc(100vw - 24px));" +
      "max-height:55vh;overflow:auto;background:rgba(15,23,42,.94);color:#fff;" +
      "border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:10px;font:13px system-ui,sans-serif;";
    p.addEventListener("pointerdown", (e) => e.stopPropagation());
    document.body.appendChild(p);
    this.panel = p;
    this.signature = "";
    this.render();
  }

  private render() {
    const panel = this.panel;
    const me = this.game.myPlayer();
    if (panel === null || me === null) return;
    const now = this.game.ticks();
    const current = me.government();
    const cooldown = Math.max(
      0,
      Math.ceil(
        (me.governmentChangedAt() + GOVERNMENT_SWITCH_COOLDOWN - now) / 10,
      ),
    );
    const transition = Math.max(
      0,
      Math.ceil((me.governmentEffectiveAt() - now) / 10),
    );
    const available = me.availableGovernments();
    const sig = JSON.stringify([current, cooldown, transition, available]);
    if (sig === this.signature) return;
    this.signature = sig;

    panel.textContent = "";
    const title = document.createElement("div");
    title.style.cssText = "font-weight:700;margin-bottom:4px;";
    title.textContent = translateText("progress.government_title");
    panel.appendChild(title);
    const status = document.createElement("div");
    status.style.cssText = "opacity:.8;font-size:12px;margin-bottom:6px;";
    status.textContent =
      transition > 0
        ? translateText("progress.government_transition", { s: transition })
        : cooldown > 0
          ? translateText("progress.government_cooldown", { s: cooldown })
          : translateText("progress.government_ready");
    panel.appendChild(status);

    for (const id of available) {
      const row = document.createElement("div");
      row.style.cssText =
        "border-top:1px solid rgba(255,255,255,.12);padding:6px 0;display:flex;gap:8px;align-items:center;";
      const text = document.createElement("div");
      text.style.flex = "1";
      const name = document.createElement("b");
      name.textContent = governmentName(id);
      const desc = document.createElement("div");
      desc.style.cssText = "opacity:.75;font-size:12px;";
      desc.textContent = describeEffects(GOVERNMENTS[id].effects);
      text.append(name, desc);
      row.appendChild(text);
      if (id === current) {
        const tag = document.createElement("span");
        tag.style.cssText = "font-size:12px;color:#86efac;";
        tag.textContent = translateText("progress.current");
        row.appendChild(tag);
      } else {
        const btn = document.createElement("button");
        btn.textContent = translateText("progress.switch");
        btn.disabled = cooldown > 0;
        btn.style.cssText = `background:rgba(255,255,255,.12);color:#fff;border:0;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:12px;${btn.disabled ? "opacity:.4;" : ""}`;
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.eventBus.emit(new SendSetGovernmentIntentEvent(id));
        });
        row.appendChild(btn);
      }
      panel.appendChild(row);
    }
    if (available.length <= 1) {
      const hint = document.createElement("div");
      hint.style.cssText = "opacity:.7;font-size:12px;margin-top:6px;";
      hint.textContent = translateText("progress.government_unlock_hint");
      panel.appendChild(hint);
    }
  }
}
