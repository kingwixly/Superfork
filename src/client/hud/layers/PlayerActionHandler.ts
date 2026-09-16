import { EventBus } from "../../../core/EventBus";
import { TileRef } from "../../../core/game/GameMap";
import {
  SendAllianceExtensionIntentEvent,
  SendAllianceRequestIntentEvent,
  SendAttackIntentEvent,
  SendBoatAttackIntentEvent,
  SendBreakAllianceIntentEvent,
  SendCeasefireIntentEvent,
  SendCeasefireResponseIntentEvent,
  SendCedeLandIntentEvent,
  SendDeleteUnitIntentEvent,
  SendDemoteCapitalIntentEvent,
  SendDonateGoldIntentEvent,
  SendDonateTroopsIntentEvent,
  SendEmbargoIntentEvent,
  SendEmbassyRequestIntentEvent,
  SendEmojiIntentEvent,
  SendLaunchCorvetteIntentEvent,
  SendLoadCorvetteIntentEvent,
  SendPromoteCapitalIntentEvent,
  SendPuppetLiberateIntentEvent,
  SendRequestAssistanceIntentEvent,
  SendSanctionIntentEvent,
  SendSpawnIntentEvent,
  SendTargetPlayerIntentEvent,
  SendTreatyCreateIntentEvent,
  SendWithdrawBankIntentEvent,
} from "../../Transport";
import { UIState } from "../../UIState";
import { PlayerView } from "../../view";

export class PlayerActionHandler {
  constructor(
    private eventBus: EventBus,
    private uiState: UIState,
  ) {}

  handleAttack(player: PlayerView, targetId: string | null) {
    this.eventBus.emit(
      new SendAttackIntentEvent(
        targetId,
        this.uiState.attackRatio * player.troops(),
      ),
    );
  }

  handleBoatAttack(player: PlayerView, targetTile: TileRef) {
    this.eventBus.emit(
      new SendBoatAttackIntentEvent(
        targetTile,
        this.uiState.attackRatio * player.troops(),
      ),
    );
  }

  async findBestTransportShipSpawn(
    player: PlayerView,
    tile: TileRef,
  ): Promise<TileRef | false> {
    return await player.bestTransportShipSpawn(tile);
  }

  handleSpawn(tile: TileRef) {
    this.eventBus.emit(new SendSpawnIntentEvent(tile));
  }

  handleAllianceRequest(player: PlayerView, recipient: PlayerView) {
    this.eventBus.emit(new SendAllianceRequestIntentEvent(player, recipient));
  }

  handleExtendAlliance(recipient: PlayerView) {
    this.eventBus.emit(new SendAllianceExtensionIntentEvent(recipient));
  }

  handleBreakAlliance(player: PlayerView, recipient: PlayerView) {
    this.eventBus.emit(new SendBreakAllianceIntentEvent(player, recipient));
  }

  handleTargetPlayer(targetId: string | null) {
    if (!targetId) return;

    this.eventBus.emit(new SendTargetPlayerIntentEvent(targetId));
  }

  handleDonateGold(recipient: PlayerView) {
    this.eventBus.emit(new SendDonateGoldIntentEvent(recipient, null));
  }

  handleDonateTroops(recipient: PlayerView, troops?: number) {
    const amount = troops ?? null;
    if (amount !== null && amount <= 0) {
      return;
    }
    this.eventBus.emit(new SendDonateTroopsIntentEvent(recipient, amount));
  }

  handleEmbargo(recipient: PlayerView, action: "start" | "stop") {
    this.eventBus.emit(new SendEmbargoIntentEvent(recipient, action));
  }

  handleEmoji(targetPlayer: PlayerView | "AllPlayers", emojiIndex: number) {
    this.eventBus.emit(new SendEmojiIntentEvent(targetPlayer, emojiIndex));
  }

  handleDeleteUnit(unitId: number) {
    this.eventBus.emit(new SendDeleteUnitIntentEvent(unitId));
  }

  handlePromoteCapital(unitId: number) {
    this.eventBus.emit(new SendPromoteCapitalIntentEvent(unitId));
  }

  // ---------------------------- Diplomacy ----------------------------
  // Each verb had a working, tested execution and no way to reach it.

  /** Give `tiles` of your own territory to another nation. */
  handleCedeLand(recipientID: string, tiles: TileRef[]) {
    this.eventBus.emit(new SendCedeLandIntentEvent(recipientID, tiles));
  }

  /**
   * Liberate: cede back everything you took from this nation.
   *
   * Sends a single placeholder tile because the schema requires a non-empty
   * list; the server discards it and fills from the ledger.
   */
  handleLiberate(recipient: PlayerView) {
    this.eventBus.emit(new SendCedeLandIntentEvent(recipient.id(), [0], true));
  }

  /** Ask a nation for permission to open an embassy on `tile` of their land. */
  handleEmbassyRequest(hostID: string, tile: TileRef) {
    this.eventBus.emit(new SendEmbassyRequestIntentEvent(hostID, tile));
  }

  handleLoadCorvette(unitId: number, troops: number) {
    this.eventBus.emit(new SendLoadCorvetteIntentEvent(unitId, troops));
  }

  handleLaunchCorvette(unitId: number, tile: TileRef) {
    this.eventBus.emit(new SendLaunchCorvetteIntentEvent(unitId, tile));
  }

  handleWithdrawBank(unitId: number) {
    this.eventBus.emit(new SendWithdrawBankIntentEvent(unitId));
  }

  handleCeasefire(recipient: PlayerView) {
    this.eventBus.emit(new SendCeasefireIntentEvent(recipient.id(), undefined));
  }

  /** Propose a ceasefire conditioned on freeing `victim` — liberation. */
  handleCeasefireWithLiberation(recipient: PlayerView, victim: PlayerView) {
    this.eventBus.emit(
      new SendCeasefireIntentEvent(recipient.id(), victim.id()),
    );
  }

  handleCeasefireResponse(requestor: PlayerView, accept: boolean) {
    this.eventBus.emit(
      new SendCeasefireResponseIntentEvent(requestor.id(), accept),
    );
  }

  handleSanction(target: PlayerView, action: "start" | "stop") {
    this.eventBus.emit(new SendSanctionIntentEvent(target.id(), action));
  }

  handleTreatyCreate(member: PlayerView) {
    this.eventBus.emit(new SendTreatyCreateIntentEvent([member.id()]));
  }

  handlePuppetLiberate(puppet: PlayerView) {
    this.eventBus.emit(new SendPuppetLiberateIntentEvent(puppet.id()));
  }

  handleRequestAssistance(
    ally: PlayerView,
    against: PlayerView,
    mode: "attack" | "troops",
  ) {
    this.eventBus.emit(
      new SendRequestAssistanceIntentEvent(ally.id(), against.id(), mode),
    );
  }

  handleDemoteCapital(unitId: number) {
    this.eventBus.emit(new SendDemoteCapitalIntentEvent(unitId));
  }
}
