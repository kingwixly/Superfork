import {
  MessageType,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import {
  AttackUpdate,
  GameUpdateType,
  UnitIncomingUpdate,
} from "@openfront/engine-api/game/GameUpdates";
import { renderTroops } from "@openfront/engine-lib/Format";
import { assetUrl } from "@openfront/shared/AssetUrls";
import { EventBus } from "@openfront/shared/EventBus";
import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { Controller } from "../../Controller";
import { themeProvider } from "../../theme/ThemeProvider";
import {
  GoToPlayerEvent,
  GoToPositionEvent,
  GoToUnitEvent,
} from "../../TransformHandler";
import {
  CancelAttackIntentEvent,
  CancelBoatIntentEvent,
  counterAttackTroops,
  RecallAircraftIntentEvent,
  SendAttackIntentEvent,
} from "../../Transport";
import { UIState } from "../../UIState";
import { translateText } from "../../Utils";
import { GameView, PlayerView, UnitView } from "../../view";
import { getColoredSprite } from "../SpriteLoader";
const soldierIcon = assetUrl("images/SoldierIcon.svg");
const swordIcon = assetUrl("images/SwordIcon.svg");

/** Superfork: aircraft on the attacks bar. */
const AIRCRAFT_ICONS: Partial<Record<UnitType, string>> = {
  [UnitType.FighterJet]: assetUrl("images/FighterIconWhite.svg"),
  [UnitType.Interceptor]: assetUrl("images/InterceptorIconWhite.svg"),
  [UnitType.TransportJet]: assetUrl("images/TransportJetIconWhite.svg"),
  [UnitType.Bomber]: assetUrl("images/BomberIconWhite.svg"),
  [UnitType.StealthBomber]: assetUrl("images/StealthBomberIconWhite.svg"),
  [UnitType.LargeBomber]: assetUrl("images/LargeBomberIconWhite.svg"),
};
/** Aircraft that fly one mission at a time: one row each. */
const MISSION_AIRCRAFT = [
  UnitType.TransportJet,
  UnitType.Bomber,
  UnitType.StealthBomber,
  UnitType.LargeBomber,
];
/** Aircraft that patrol: one row per type, only when sent away from base. */
const PATROL_AIRCRAFT = [UnitType.FighterJet, UnitType.Interceptor];
/** Hostile aircraft listed when over your land. Stealth bombers are not. */
const THREAT_AIRCRAFT = [
  UnitType.Bomber,
  UnitType.LargeBomber,
  UnitType.TransportJet,
  UnitType.FighterJet,
];
const AIR_BASES = [
  UnitType.Airstrip,
  UnitType.Airfield,
  UnitType.InternationalAirport,
  UnitType.Carrier,
];
/**
 * A patrol point farther than this from every one of your bases counts as a
 * mission. Fighters circle 12 tiles out and interceptors 16, so a point near
 * a base is home patrol and stays off the bar.
 */
const HOME_PATROL_DISTANCE = 20;

type AirGroup = { type: UnitType; units: UnitView[] };

@customElement("attacks-display")
export class AttacksDisplay extends LitElement implements Controller {
  public eventBus: EventBus;
  public game: GameView;
  public uiState: UIState;

  private active: boolean = false;
  private incomingBoatIDs: Set<number> = new Set();
  private spriteDataURLCache: Map<string, string> = new Map();
  @state() private _isVisible: boolean = false;
  @state() private incomingAttacks: AttackUpdate[] = [];
  @state() private outgoingAttacks: AttackUpdate[] = [];
  @state() private outgoingLandAttacks: AttackUpdate[] = [];
  @state() private outgoingBoats: UnitView[] = [];
  @state() private incomingBoats: UnitView[] = [];
  @state() private outgoingAircraft: UnitView[] = [];
  @state() private outgoingPatrols: AirGroup[] = [];
  @state() private incomingAircraft: AirGroup[] = [];
  private baseTiles: number[] = [];

  createRenderRoot() {
    return this;
  }

  init() {}

  tick() {
    this.active = true;

    if (!this._isVisible && !this.game.inSpawnPhase()) {
      this._isVisible = true;
    }

    const myPlayer = this.game.myPlayer();
    if (!myPlayer || !myPlayer.isAlive()) {
      if (this._isVisible) {
        this._isVisible = false;
      }
      return;
    }

    // Track incoming boat unit IDs from UnitIncoming events
    const updates = this.game.updatesSinceLastTick();
    if (updates) {
      for (const event of updates[
        GameUpdateType.UnitIncoming
      ] as UnitIncomingUpdate[]) {
        if (
          event.playerID === myPlayer.smallID() &&
          event.messageType === MessageType.NAVAL_INVASION_INBOUND
        ) {
          this.incomingBoatIDs.add(event.unitID);
        }
      }
    }

    // Resolve incoming boats from tracked IDs, remove inactive ones
    const resolvedIncomingBoats: UnitView[] = [];
    for (const unitID of this.incomingBoatIDs) {
      const unit = this.game.unit(unitID);
      if (unit && unit.isActive() && unit.type() === UnitType.TransportShip) {
        resolvedIncomingBoats.push(unit);
      } else {
        this.incomingBoatIDs.delete(unitID);
      }
    }
    this.incomingBoats = resolvedIncomingBoats;

    this.incomingAttacks = myPlayer.incomingAttacks().filter((a) => {
      const t = (this.game.playerBySmallID(a.attackerID) as PlayerView).type();
      return t !== PlayerType.Bot;
    });

    this.outgoingAttacks = myPlayer
      .outgoingAttacks()
      .filter((a) => a.targetID !== 0);

    this.outgoingLandAttacks = myPlayer
      .outgoingAttacks()
      .filter((a) => a.targetID === 0);

    this.outgoingBoats = myPlayer
      .units()
      .filter((u) => u.type() === UnitType.TransportShip);

    this.updateAircraft(myPlayer);

    this.requestUpdate();
  }

  /**
   * Superfork. Your aircraft on a mission (the engine publishes the mission
   * as the unit's target tile and clears it on recall or when done), and
   * hostile aircraft over your land.
   */
  private updateAircraft(myPlayer: PlayerView) {
    this.baseTiles = myPlayer
      .units(...AIR_BASES)
      .filter((b) => b.isActive())
      .map((b) => b.tile());

    this.outgoingAircraft = myPlayer
      .units(...MISSION_AIRCRAFT)
      .filter((u) => u.isActive() && u.targetTile() !== undefined);

    this.outgoingPatrols = PATROL_AIRCRAFT.map((type) => ({
      type,
      units: myPlayer.units(type).filter((u) => {
        const t = u.targetTile();
        return u.isActive() && t !== undefined && !this.nearBase(t);
      }),
    })).filter((g) => g.units.length > 0);

    const threats = new Map<string, AirGroup>();
    for (const u of this.game.units(...THREAT_AIRCRAFT)) {
      if (!u.isActive()) continue;
      const owner = u.owner();
      if (owner === myPlayer || owner.isFriendly(myPlayer)) continue;
      const over = this.game.owner(u.tile()) === myPlayer;
      const t = u.targetTile();
      const heading = t !== undefined && this.game.owner(t) === myPlayer;
      if (!over && !heading) continue;
      // Fighters grouped per owner; everything else one row each.
      const key =
        u.type() === UnitType.FighterJet ? `f-${owner.id()}` : `u-${u.id()}`;
      const g = threats.get(key) ?? { type: u.type(), units: [] };
      g.units.push(u);
      threats.set(key, g);
    }
    this.incomingAircraft = [...threats.values()];
  }

  private nearBase(tile: number): boolean {
    return this.baseTiles.some(
      (b) => this.game.manhattanDist(b, tile) <= HOME_PATROL_DISTANCE,
    );
  }

  private aircraftName(type: UnitType): string {
    const key = type.toLowerCase().replace(/ /g, "_");
    return translateText(`unit_type.${key}`);
  }

  private renderAircraftIcon(type: UnitType) {
    const src = AIRCRAFT_ICONS[type];
    if (src === undefined) return html``;
    return html`<img src="${src}" class="h-4 w-4 inline-block" />`;
  }

  private recall(units: UnitView[]) {
    this.eventBus.emit(new RecallAircraftIntentEvent(units.map((u) => u.id())));
  }

  private renderOutgoingAircraft() {
    return this.outgoingAircraft.map((u) => {
      const target = u.targetTile();
      // A recalled transport jet flies to its base: shown as returning.
      const returning =
        u.type() === UnitType.TransportJet &&
        target !== undefined &&
        this.baseTiles.includes(target);
      return html`
        <div
          class="flex items-center gap-0.5 w-full bg-gray-800/92 backdrop-blur-sm sm:rounded-lg px-1.5 py-0.5 overflow-hidden"
        >
          ${this.renderButton({
            content: html`${this.renderAircraftIcon(u.type())}
              ${u.type() === UnitType.TransportJet
                ? html`<span class="inline-block min-w-[3rem] text-right"
                    >${renderTroops(u.troops())}</span
                  >`
                : html`<span class="truncate text-xs ml-1"
                    >${this.aircraftName(u.type())}</span
                  >`}
              <span class="truncate text-xs ml-1"
                >${returning ? "" : this.getTileOwnerName(target)}</span
              >`,
            onClick: () => this.eventBus.emit(new GoToUnitEvent(u)),
            className:
              "text-left text-aquarius inline-flex items-center gap-0.5 lg:gap-1 min-w-0",
            translate: false,
          })}
          ${returning
            ? html`<span class="ml-auto truncate text-aquarius"
                >(${translateText("events_display.aircraft_returning")})</span
              >`
            : this.renderButton({
                content: "\u274C",
                onClick: () => this.recall([u]),
                className: "ml-auto text-left shrink-0",
              })}
        </div>
      `;
    });
  }

  private renderOutgoingPatrols() {
    return this.outgoingPatrols.map(
      (g) => html`
        <div
          class="flex items-center gap-0.5 w-full bg-gray-800/92 backdrop-blur-sm sm:rounded-lg px-1.5 py-0.5 overflow-hidden"
        >
          ${this.renderButton({
            content: html`${this.renderAircraftIcon(g.type)}
              <span class="inline-block min-w-[1.5rem] text-right"
                >${g.units.length}×</span
              >
              <span class="truncate text-xs ml-1"
                >${this.aircraftName(g.type)}</span
              >
              <span class="truncate text-xs ml-1 text-slate-300"
                >${translateText("events_display.aircraft_patrolling")}</span
              >`,
            onClick: () => this.eventBus.emit(new GoToUnitEvent(g.units[0])),
            className:
              "text-left text-aquarius inline-flex items-center gap-0.5 lg:gap-1 min-w-0",
            translate: false,
          })}
          ${this.renderButton({
            content: "\u274C",
            onClick: () => this.recall(g.units),
            className: "ml-auto text-left shrink-0",
          })}
        </div>
      `,
    );
  }

  private renderIncomingAircraft() {
    return this.incomingAircraft.map((g) => {
      const u = g.units[0];
      return html`
        <div
          class="flex items-center gap-0.5 w-full bg-gray-800/92 backdrop-blur-sm sm:rounded-lg px-1.5 py-0.5 overflow-hidden"
        >
          ${this.renderButton({
            content: html`${this.renderAircraftIcon(g.type)}
              ${g.type === UnitType.TransportJet
                ? html`<span class="inline-block min-w-[3rem] text-right"
                    >${renderTroops(u.troops())}</span
                  >`
                : html`<span class="inline-block min-w-[1.5rem] text-right"
                    >${g.units.length > 1 ? `${g.units.length}×` : ""}</span
                  >`}
              <span class="truncate text-xs ml-1"
                >${u.owner()?.displayName()}</span
              >`,
            onClick: () => this.eventBus.emit(new GoToUnitEvent(u)),
            className:
              "text-left text-red-400 inline-flex items-center gap-0.5 lg:gap-1 min-w-0",
            translate: false,
          })}
        </div>
      `;
    });
  }

  private getTileOwnerName(tile: number | undefined): string {
    if (tile === undefined) return "";
    const ownerID = this.game.ownerID(tile);
    if (ownerID === 0) return translateText("help_modal.ui_wilderness");
    const player = this.game.playerBySmallID(ownerID) as PlayerView;
    return player?.displayName() ?? "";
  }

  private renderButton(options: {
    content: any;
    onClick?: () => void;
    className?: string;
    disabled?: boolean;
    translate?: boolean;
    hidden?: boolean;
  }) {
    const {
      content,
      onClick,
      className = "",
      disabled = false,
      translate = true,
      hidden = false,
    } = options;

    if (hidden) {
      return html``;
    }

    return html`
      <button
        class="${className}"
        @click=${onClick}
        ?disabled=${disabled}
        ?translate=${translate}
      >
        ${content}
      </button>
    `;
  }

  private emitCancelAttackIntent(id: string) {
    const myPlayer = this.game.myPlayer();
    if (!myPlayer) return;
    this.eventBus.emit(new CancelAttackIntentEvent(id));
  }

  private emitBoatCancelIntent(id: number) {
    const myPlayer = this.game.myPlayer();
    if (!myPlayer) return;
    this.eventBus.emit(new CancelBoatIntentEvent(id));
  }

  private emitGoToPlayerEvent(attackerID: number) {
    const attacker = this.game.playerBySmallID(attackerID) as PlayerView;
    this.eventBus.emit(new GoToPlayerEvent(attacker));
  }

  private getBoatSpriteDataURL(unit: UnitView): string {
    const owner = unit.owner();
    const key = `boat-${owner.id()}`;
    const cached = this.spriteDataURLCache.get(key);
    if (cached) return cached;
    try {
      const canvas = getColoredSprite(unit, themeProvider.current());
      const dataURL = canvas.toDataURL();
      this.spriteDataURLCache.set(key, dataURL);
      return dataURL;
    } catch {
      return "";
    }
  }

  private async attackWarningOnClick(attack: AttackUpdate) {
    const playerView = this.game.playerBySmallID(attack.attackerID);
    if (playerView !== undefined) {
      if (playerView instanceof PlayerView) {
        const attacks = await playerView.attackClusteredPositions(attack.id);
        const pos = attacks[0]?.positions[0];

        if (!pos) {
          this.emitGoToPlayerEvent(attack.attackerID);
        } else {
          this.eventBus.emit(new GoToPositionEvent(pos.x, pos.y));
        }
      }
    } else {
      this.emitGoToPlayerEvent(attack.attackerID);
    }
  }

  private handleRetaliate(attack: AttackUpdate) {
    const attacker = this.game.playerBySmallID(attack.attackerID) as PlayerView;
    if (!attacker) return;

    const myPlayer = this.game.myPlayer();
    if (!myPlayer) return;

    const counterTroops = counterAttackTroops(
      attack.troops,
      this.uiState.attackRatio * myPlayer.troops(),
    );
    this.eventBus.emit(new SendAttackIntentEvent(attacker.id(), counterTroops));
  }

  private renderIncomingAttacks() {
    if (this.incomingAttacks.length === 0) return html``;

    return this.incomingAttacks.map(
      (attack) => html`
        <div
          class="flex items-center gap-0.5 w-full bg-gray-800/92 backdrop-blur-sm sm:rounded-lg px-1.5 py-0.5 overflow-hidden"
        >
          ${this.renderButton({
            content: html`<span class="inline-flex items-center"
                ><img
                  src="${soldierIcon}"
                  class="h-4 w-4"
                  style="filter: brightness(0) saturate(100%) invert(27%) sepia(91%) saturate(4551%) hue-rotate(348deg) brightness(89%) contrast(97%)"
                />↓</span
              ><span class="ml-1">${renderTroops(attack.troops)}</span>
              <span class="truncate ml-1"
                >${(
                  this.game.playerBySmallID(attack.attackerID) as PlayerView
                )?.displayName()}</span
              >
              ${attack.retreating
                ? `(${translateText("events_display.retreating")}...)`
                : ""} `,
            onClick: () => this.attackWarningOnClick(attack),
            className:
              "text-left text-red-400 inline-flex items-center gap-0.5 lg:gap-1 min-w-0",
            translate: false,
          })}
          ${!attack.retreating
            ? this.renderButton({
                content: html`<img
                  src="${swordIcon}"
                  class="h-4 w-4"
                  style="filter: brightness(0) saturate(100%) invert(27%) sepia(91%) saturate(4551%) hue-rotate(348deg) brightness(89%) contrast(97%)"
                />`,
                onClick: () => this.handleRetaliate(attack),
                className:
                  "ml-auto inline-flex items-center justify-center cursor-pointer bg-red-900/50 hover:bg-red-800/70 sm:rounded-lg px-1.5 py-1 border border-red-700/50",
                translate: false,
              })
            : ""}
        </div>
      `,
    );
  }

  private renderOutgoingAttacks() {
    if (this.outgoingAttacks.length === 0) return html``;

    return this.outgoingAttacks.map(
      (attack) => html`
        <div
          class="flex items-center gap-0.5 w-full bg-gray-800/92 backdrop-blur-sm sm:rounded-lg px-1.5 py-0.5 overflow-hidden"
        >
          ${this.renderButton({
            content: html`<span class="inline-flex items-center"
                ><img
                  src="${soldierIcon}"
                  class="h-4 w-4"
                  style="filter: brightness(0) saturate(100%) invert(62%) sepia(80%) saturate(500%) hue-rotate(175deg) brightness(100%)"
                />↑</span
              ><span class="ml-1">${renderTroops(attack.troops)}</span>
              <span class="truncate ml-1"
                >${(
                  this.game.playerBySmallID(attack.targetID) as PlayerView
                )?.displayName()}</span
              > `,
            onClick: async () => this.attackWarningOnClick(attack),
            className:
              "text-left text-aquarius inline-flex items-center gap-0.5 lg:gap-1 min-w-0",
            translate: false,
          })}
          ${!attack.retreating
            ? this.renderButton({
                content: "❌",
                onClick: () => this.emitCancelAttackIntent(attack.id),
                className: "ml-auto text-left shrink-0",
                disabled: attack.retreating,
              })
            : html`<span class="ml-auto truncate text-aquarius"
                >(${translateText("events_display.retreating")}...)</span
              >`}
        </div>
      `,
    );
  }

  private renderOutgoingLandAttacks() {
    if (this.outgoingLandAttacks.length === 0) return html``;

    return this.outgoingLandAttacks.map(
      (landAttack) => html`
        <div
          class="flex items-center gap-0.5 w-full bg-gray-800/92 backdrop-blur-sm sm:rounded-lg px-1.5 py-0.5 overflow-hidden"
        >
          ${this.renderButton({
            content: html`<span class="inline-flex items-center"
                ><img
                  src="${soldierIcon}"
                  class="h-4 w-4"
                  style="filter: brightness(0) saturate(100%) invert(62%) sepia(80%) saturate(500%) hue-rotate(175deg) brightness(100%)"
                />↑</span
              ><span class="ml-1">${renderTroops(landAttack.troops)}</span>
              ${translateText("help_modal.ui_wilderness")}`,
            className:
              "text-left text-aquarius inline-flex items-center gap-0.5 lg:gap-1 min-w-0",
            translate: false,
          })}
          ${!landAttack.retreating
            ? this.renderButton({
                content: "❌",
                onClick: () => this.emitCancelAttackIntent(landAttack.id),
                className: "ml-auto text-left shrink-0",
                disabled: landAttack.retreating,
              })
            : html`<span class="ml-auto truncate text-aquarius"
                >(${translateText("events_display.retreating")}...)</span
              >`}
        </div>
      `,
    );
  }

  private getBoatTargetName(boat: UnitView): string {
    const target = boat.targetTile();
    if (target === undefined) return "";
    const ownerID = this.game.ownerID(target);
    if (ownerID === 0) return translateText("help_modal.ui_wilderness");
    const player = this.game.playerBySmallID(ownerID) as PlayerView;
    return player?.displayName() ?? "";
  }

  private renderBoatIcon(boat: UnitView) {
    const dataURL = this.getBoatSpriteDataURL(boat);
    if (!dataURL) return html``;
    return html`<img
      src="${dataURL}"
      class="h-5 w-5 inline-block"
      style="image-rendering: pixelated"
    />`;
  }

  private getBoatETA(boat: UnitView): string {
    const plan = this.game.motionPlans().get(boat.id());
    if (!plan) return "";

    const planSteps = plan.path.length;
    const planTicks = planSteps * plan.ticksPerStep;
    const planEndTick = plan.startTick + planTicks;

    const remainingTicks = planEndTick - this.game.ticks();
    if (remainingTicks <= 0) return "0s";
    const remainingMs = remainingTicks * this.game.config().msPerTick();
    const remainingSeconds = Math.ceil(remainingMs / 1000);

    // e.g. return 1s, 35s, 59s, 1m, 1m1s, 1m59s, 2m, etc
    const m = Math.floor(remainingSeconds / 60); // minutes
    const s = remainingSeconds % 60; // seconds
    return (m ? `${m}m` : "") + (s ? `${s}s` : "");
  }

  private renderBoats() {
    if (this.outgoingBoats.length === 0) return html``;

    return this.outgoingBoats.map(
      (boat) => html`
        <div
          class="flex items-center gap-0.5 w-full bg-gray-800/92 backdrop-blur-sm sm:rounded-lg px-1.5 py-0.5 overflow-hidden"
        >
          ${this.renderButton({
            content: html`${this.renderBoatIcon(boat)}
              <span class="inline-block min-w-[3rem] text-right"
                >${renderTroops(boat.troops())}</span
              >
              <span class="truncate text-xs ml-1"
                >${this.getBoatTargetName(boat)}</span
              >
              <span class="text-xs ml-1 text-slate-300"
                >${this.getBoatETA(boat)}</span
              >`,
            onClick: () => this.eventBus.emit(new GoToUnitEvent(boat)),
            className:
              "text-left text-aquarius inline-flex items-center gap-0.5 lg:gap-1 min-w-0",
            translate: false,
          })}
          ${boat.transportShipState().isRetreating
            ? html`<span class="ml-auto truncate text-aquarius"
                >(${translateText("events_display.retreating")}...)</span
              >`
            : this.renderButton({
                content: "\u274C",
                onClick: () => this.emitBoatCancelIntent(boat.id()),
                className: "ml-auto text-left shrink-0",
                disabled: boat.transportShipState().isRetreating,
              })}
        </div>
      `,
    );
  }

  private renderIncomingBoats() {
    if (this.incomingBoats.length === 0) return html``;

    return this.incomingBoats.map(
      (boat) => html`
        <div
          class="flex items-center gap-0.5 w-full bg-gray-800/92 backdrop-blur-sm sm:rounded-lg px-1.5 py-0.5 overflow-hidden"
        >
          ${this.renderButton({
            content: html`${this.renderBoatIcon(boat)}
              <span class="inline-block min-w-[3rem] text-right"
                >${renderTroops(boat.troops())}</span
              >
              <span class="truncate text-xs ml-1"
                >${boat.owner()?.displayName()}</span
              >
              <span class="text-xs ml-1 text-slate-300"
                >${this.getBoatETA(boat)}</span
              >`,
            onClick: () => this.eventBus.emit(new GoToUnitEvent(boat)),
            className:
              "text-left text-red-400 inline-flex items-center gap-0.5 lg:gap-1 min-w-0",
            translate: false,
          })}
        </div>
      `,
    );
  }

  render() {
    if (!this.active || !this._isVisible) {
      return html``;
    }

    const hasAnything =
      this.outgoingAttacks.length > 0 ||
      this.outgoingLandAttacks.length > 0 ||
      this.outgoingBoats.length > 0 ||
      this.incomingAttacks.length > 0 ||
      this.incomingBoats.length > 0 ||
      this.outgoingAircraft.length > 0 ||
      this.outgoingPatrols.length > 0 ||
      this.incomingAircraft.length > 0;

    if (!hasAnything) {
      return html``;
    }

    return html`
      <div
        class="w-full mb-1 mt-1 sm:mt-0 pointer-events-auto grid grid-cols-2 gap-1 text-white text-sm lg:text-base max-h-[7rem] overflow-y-auto"
      >
        ${this.renderOutgoingAttacks()} ${this.renderOutgoingLandAttacks()}
        ${this.renderBoats()} ${this.renderOutgoingAircraft()}
        ${this.renderOutgoingPatrols()} ${this.renderIncomingAttacks()}
        ${this.renderIncomingBoats()} ${this.renderIncomingAircraft()}
      </div>
    `;
  }
}
