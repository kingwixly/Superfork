import { html, LitElement, nothing, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { EventBus } from "../../../core/EventBus";
import { GameType, PlayerType } from "../../../core/game/Game";
import { GameUpdateType } from "../../../core/game/GameUpdates";
import { GAME_ROUTE } from "../../../core/GameRoute";
import { MAX_UCI_ANNOUNCEMENT, UciIntent } from "../../../core/Schemas";
import { createNextLobby, verifyUciPassword } from "../../Api";
import { ClientEnv } from "../../ClientEnv";
import { Controller } from "../../Controller";
import { BeginTerritorySelectionEvent } from "../../controllers/TerritorySelectionController";
import { showInGameConfirm } from "../../InGameModal";
import {
  SendKickPlayerIntentEvent,
  SendUciAuthEvent,
  SendUciIntentEvent,
} from "../../Transport";
import { translateText } from "../../Utils";
import { GameView, PlayerView } from "../../view";

/** Keys after Shift that open the menu, in order. */
const SEQUENCE = ["u", "c", "i"];
/** Max gap between keys of the sequence. */
const SEQUENCE_GAP_MS = 2500;
const TOKEN_KEY = "uci-token";

/**
 * UCI developer tools (Universal Combat Initiation).
 *
 * Opened with Shift, then U, C, I. The password is checked by the server
 * (it never ships in the client); a correct one returns a session token that
 * every action carries. Every action is announced to all players in game.
 */
@customElement("uci-menu")
export class UciMenu extends LitElement implements Controller {
  public game: GameView;
  public eventBus: EventBus;

  @state() private open = false;
  @state() private token: string | null = null;
  @state() private error: string | null = null;
  @state() private busy = false;
  @state() private targetID = "";
  @state() private recipientID = "";
  @state() private announcement = "";

  private progress = -1;
  private lastKeyAt = 0;

  createRenderRoot() {
    return this;
  }

  init() {
    try {
      this.token = sessionStorage.getItem(TOKEN_KEY);
    } catch {
      this.token = null;
    }
    window.addEventListener("keydown", this.onKey, true);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("keydown", this.onKey, true);
  }

  /** Big banner for admin announcements, on every client. */
  tick() {
    const events =
      this.game?.updatesSinceLastTick()?.[GameUpdateType.DisplayEvent];
    for (const e of events ?? []) {
      if (e.message !== "uci.announcement") continue;
      window.dispatchEvent(
        new CustomEvent("show-message", {
          detail: {
            message: translateText("uci.announcement", {
              text: String(e.params?.text ?? ""),
            }),
            duration: 8000,
            color: "green",
          },
        }),
      );
    }
  }

  private onKey = (e: KeyboardEvent): void => {
    if (this.open && e.key === "Escape") {
      this.close();
      e.preventDefault();
      return;
    }
    const t = e.target as HTMLElement | null;
    if (t !== null && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) {
      return;
    }
    const now = performance.now();
    if (now - this.lastKeyAt > SEQUENCE_GAP_MS) this.progress = -1;
    if (e.key === "Shift") {
      this.progress = 0;
      this.lastKeyAt = now;
      return;
    }
    if (this.progress < 0) return;
    if (e.key.toLowerCase() === SEQUENCE[this.progress]) {
      this.progress++;
      this.lastKeyAt = now;
      if (this.progress === SEQUENCE.length) {
        this.progress = -1;
        this.show();
        e.preventDefault();
        e.stopPropagation();
      }
    } else {
      this.progress = -1;
    }
  };

  private show() {
    // Tokens are "<expiry ms>.<signature>"; drop one that has run out.
    if (this.token !== null && Number(this.token.split(".")[0]) < Date.now()) {
      this.token = null;
    }
    this.open = true;
    this.error = null;
    const me = this.game?.myPlayer();
    if (this.targetID === "" && me) this.targetID = me.id();
    if (this.recipientID === "" && me) this.recipientID = me.id();
  }

  private close() {
    this.open = false;
  }

  private isSingleplayer(): boolean {
    return this.game?.config().gameConfig().gameType === GameType.Singleplayer;
  }

  private async unlock(e: Event) {
    e.preventDefault();
    const input = this.querySelector<HTMLInputElement>("#uci-password");
    const password = input?.value ?? "";
    if (password === "" || this.busy) return;
    this.busy = true;
    this.error = null;
    try {
      const token = await verifyUciPassword(this.game.gameID(), password);
      if (token === null) {
        this.error = translateText("uci.wrong_password");
      } else {
        this.token = token;
        try {
          sessionStorage.setItem(TOKEN_KEY, token);
        } catch {
          // Private mode: the token lasts until reload.
        }
      }
    } catch (err) {
      this.error =
        err instanceof Error && err.message === "locked"
          ? translateText("uci.locked_out")
          : translateText("uci.unavailable");
    } finally {
      this.busy = false;
      if (input) input.value = "";
    }
  }

  private send(intent: Omit<UciIntent, "type">) {
    if (this.token === null) return;
    this.eventBus.emit(new SendUciIntentEvent(this.token, intent));
  }

  private players(): PlayerView[] {
    return this.game
      .players()
      .filter((p) => p.isAlive())
      .sort((a, b) => a.displayName().localeCompare(b.displayName()));
  }

  private target(): PlayerView | null {
    return this.players().find((p) => p.id() === this.targetID) ?? null;
  }

  private async confirm(key: string, params = {}): Promise<boolean> {
    return showInGameConfirm(translateText(key, params), {
      variant: "warning",
    });
  }

  private async newLobby() {
    if (this.token === null) return;
    if (!(await this.confirm("uci.confirm_new_lobby"))) return;
    try {
      const lobby = await createNextLobby(this.game.gameID(), this.token);
      const id = lobby.gameID;
      window.location.href = `${window.location.origin}/${ClientEnv.workerPath(id)}/${GAME_ROUTE}/${id}?host`;
    } catch {
      this.error = translateText("uci.failed");
    }
  }

  private kick() {
    const target = this.target();
    const clientID = target?.clientID();
    if (this.token === null || !clientID) return;
    this.eventBus.emit(new SendUciAuthEvent(this.token));
    this.eventBus.emit(new SendKickPlayerIntentEvent(clientID));
  }

  private paint() {
    if (this.token === null || this.recipientID === "") return;
    this.close();
    this.eventBus.emit(
      new BeginTerritorySelectionEvent({
        purpose: "uci_paint",
        targetID: this.recipientID,
        uciToken: this.token,
      }),
    );
  }

  // ------------------------------------------------------------- render --

  private btn(
    label: string,
    onClick: () => void,
    tone: "plain" | "danger" | "good" = "plain",
    disabled = false,
  ): TemplateResult {
    const color =
      tone === "danger"
        ? "bg-red-700 hover:bg-red-600"
        : tone === "good"
          ? "bg-emerald-700 hover:bg-emerald-600"
          : "bg-slate-700 hover:bg-slate-600";
    // type="button": inside a form, a plain <button> is a submit button, so
    // pressing Enter in the password box "clicked" Close.
    return html`<button
      type="button"
      class="${color} text-white text-sm font-semibold rounded-md px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
      ?disabled=${disabled}
      @click=${(e: Event) => {
        e.stopPropagation();
        onClick();
      }}
    >
      ${label}
    </button>`;
  }

  private section(title: string, body: TemplateResult): TemplateResult {
    return html`<section class="flex flex-col gap-2">
      <h3 class="text-xs uppercase tracking-widest text-slate-400 font-bold">
        ${title}
      </h3>
      ${body}
    </section>`;
  }

  private row(label: string, ...buttons: TemplateResult[]): TemplateResult {
    return html`<div class="flex items-center justify-between gap-3">
      <span class="text-sm text-slate-200">${label}</span>
      <div class="flex gap-2 flex-wrap justify-end">${buttons}</div>
    </div>`;
  }

  private select(
    value: string,
    onChange: (v: string) => void,
    label: string,
  ): TemplateResult {
    const me = this.game.myPlayer();
    return html`<label class="flex flex-col gap-1 text-xs text-slate-400">
      ${label}
      <select
        class="bg-slate-800 text-white text-sm rounded-md px-2 py-1.5 border border-slate-600"
        .value=${value}
        @change=${(e: Event) => onChange((e.target as HTMLSelectElement).value)}
      >
        ${this.players().map(
          (p) =>
            html`<option value=${p.id()} ?selected=${p.id() === value}>
              ${p.displayName()}${p === me
                ? ` (${translateText("uci.you")})`
                : ""}
            </option>`,
        )}
      </select>
    </label>`;
  }

  private renderLogin(): TemplateResult {
    return html`<form
      class="flex flex-col gap-3"
      @submit=${(e: Event) => this.unlock(e)}
    >
      <p class="text-sm text-slate-300">
        ${translateText("uci.password_prompt")}
      </p>
      <input
        id="uci-password"
        type="password"
        autocomplete="off"
        class="bg-slate-800 text-white rounded-md px-3 py-2 border border-slate-600"
        @keydown=${(e: KeyboardEvent) => e.stopPropagation()}
      />
      <div class="flex justify-end gap-2">
        ${this.btn(translateText("uci.close"), () => this.close())}
        <button
          type="submit"
          class="bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold rounded-md px-3 py-1.5 disabled:opacity-40"
          ?disabled=${this.busy}
        >
          ${translateText("uci.unlock")}
        </button>
      </div>
    </form>`;
  }

  private renderTools(): TemplateResult {
    const me = this.game.myPlayer();
    const target = this.target();
    const notMe = target !== null && target !== me;
    const human = target?.type() === PlayerType.Human && notMe;
    const t = (k: string) => translateText(k);

    return html`<div class="flex flex-col gap-4">
      <div class="grid grid-cols-2 gap-3">
        ${this.select(
          this.targetID,
          (v) => (this.targetID = v),
          t("uci.country"),
        )}
        ${this.select(
          this.recipientID,
          (v) => (this.recipientID = v),
          t("uci.recipient"),
        )}
      </div>

      ${this.section(
        t("uci.universal"),
        html`
          ${this.row(
            t("uci.infinite_gold"),
            this.btn(
              t("uci.on"),
              () => this.send({ action: "gold", enabled: true }),
              "good",
            ),
            this.btn(t("uci.off"), () =>
              this.send({ action: "gold", enabled: false }),
            ),
          )}
          ${this.row(
            t("uci.infinite_troops"),
            this.btn(
              t("uci.on"),
              () => this.send({ action: "troops", enabled: true }),
              "good",
            ),
            this.btn(t("uci.off"), () =>
              this.send({ action: "troops", enabled: false }),
            ),
          )}
          ${this.row(
            t("uci.lock_attack"),
            this.btn(
              t("uci.lock"),
              () =>
                this.send({
                  action: "lock_attack",
                  targetID: this.targetID,
                  enabled: true,
                }),
              "danger",
              target === null,
            ),
            this.btn(
              t("uci.unlock_attack"),
              () =>
                this.send({
                  action: "lock_attack",
                  targetID: this.targetID,
                  enabled: false,
                }),
              "plain",
              target === null,
            ),
          )}
          ${this.row(
            t("uci.cede"),
            this.btn(
              t("uci.cede_country"),
              async () => {
                if (await this.confirm("uci.confirm_cede")) {
                  this.send({
                    action: "cede_country",
                    targetID: this.targetID,
                    recipientID: this.recipientID,
                  });
                }
              },
              "danger",
              target === null || this.targetID === this.recipientID,
            ),
            this.btn(t("uci.paint_area"), () => this.paint()),
          )}
          ${this.row(
            t("uci.switch"),
            this.btn(
              t("uci.switch_button"),
              async () => {
                if (await this.confirm("uci.confirm_switch")) {
                  this.send({ action: "switch", targetID: this.targetID });
                }
              },
              "plain",
              !notMe,
            ),
          )}
          ${this.row(
            t("uci.disappear"),
            this.btn(
              t("uci.disappear_button"),
              async () => {
                if (await this.confirm("uci.confirm_disappear")) {
                  this.send({ action: "disappear", targetID: this.targetID });
                }
              },
              "danger",
              target === null,
            ),
          )}
          ${this.row(
            t("uci.ai_attack"),
            this.btn(
              t("uci.ai_attack_button"),
              () => this.send({ action: "ai_attack", targetID: this.targetID }),
              "danger",
              target === null,
            ),
          )}
        `,
      )}
      ${this.isSingleplayer()
        ? this.section(
            t("uci.singleplayer"),
            this.row(
              t("uci.ai_answers"),
              this.btn(
                t("uci.ai_yes"),
                () => this.send({ action: "ai_answers", aiAnswer: "yes" }),
                "good",
              ),
              this.btn(
                t("uci.ai_no"),
                () => this.send({ action: "ai_answers", aiAnswer: "no" }),
                "danger",
              ),
              this.btn(t("uci.ai_normal"), () =>
                this.send({ action: "ai_answers", aiAnswer: "normal" }),
              ),
            ),
          )
        : this.section(
            t("uci.multiplayer"),
            html`
              ${this.row(
                t("uci.game_controls"),
                this.btn(t("uci.pause"), () =>
                  this.send({ action: "pause", enabled: true }),
                ),
                this.btn(t("uci.unpause"), () =>
                  this.send({ action: "pause", enabled: false }),
                ),
              )}
              ${this.row(
                "",
                this.btn(
                  t("uci.end_game"),
                  async () => {
                    if (await this.confirm("uci.confirm_end_game")) {
                      this.send({ action: "end_game" });
                    }
                  },
                  "danger",
                ),
                this.btn(t("uci.new_lobby"), () => this.newLobby()),
              )}
              ${this.row(
                t("uci.selected_player"),
                this.btn(
                  t("uci.transfer_host"),
                  () => {
                    const clientID = target?.clientID();
                    if (clientID) {
                      this.send({
                        action: "transfer_host",
                        targetClientID: clientID,
                      });
                    }
                  },
                  "plain",
                  !human,
                ),
                this.btn(
                  t("uci.remove_player"),
                  async () => {
                    if (await this.confirm("uci.confirm_remove")) this.kick();
                  },
                  "danger",
                  !human,
                ),
              )}
              <form
                class="flex gap-2"
                @submit=${(e: Event) => {
                  e.preventDefault();
                  const text = this.announcement.trim();
                  if (text === "") return;
                  this.send({ action: "announce", text });
                  this.announcement = "";
                }}
              >
                <input
                  class="flex-1 bg-slate-800 text-white text-sm rounded-md px-3 py-1.5 border border-slate-600"
                  maxlength=${MAX_UCI_ANNOUNCEMENT}
                  placeholder=${t("uci.announcement_placeholder")}
                  .value=${this.announcement}
                  @input=${(e: Event) =>
                    (this.announcement = (e.target as HTMLInputElement).value)}
                  @keydown=${(e: KeyboardEvent) => e.stopPropagation()}
                />
                <button
                  type="submit"
                  class="bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold rounded-md px-3 py-1.5"
                >
                  ${t("uci.announce")}
                </button>
              </form>
            `,
          )}
      <p class="text-xs text-slate-400">${t("uci.notice")}</p>
    </div>`;
  }

  render() {
    if (!this.open || this.game === undefined) return nothing;
    return html`<div
      class="fixed inset-0 z-[10001] flex items-center justify-center bg-black/40 p-4"
      @click=${() => this.close()}
      @contextmenu=${(e: Event) => e.stopPropagation()}
    >
      <div
        class="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-slate-900/95 text-white border border-slate-600 rounded-xl shadow-2xl p-5 flex flex-col gap-4"
        @click=${(e: Event) => e.stopPropagation()}
      >
        <header class="flex items-center justify-between">
          <h2 class="text-lg font-bold tracking-wide">
            ${translateText("uci.name")}
            <span class="text-slate-400 font-normal text-sm">
              ${translateText("uci.title")}
            </span>
          </h2>
          ${this.btn("✕", () => this.close())}
        </header>
        ${this.error
          ? html`<p class="text-sm text-red-400">${this.error}</p>`
          : nothing}
        ${this.token === null ? this.renderLogin() : this.renderTools()}
      </div>
    </div>`;
  }
}
