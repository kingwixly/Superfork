import { canUseSuperforkSystems } from "../configuration/SuperforkUnits";
import { Execution, Game, MessageType, Player } from "../game/Game";
import { AttackExecution } from "./AttackExecution";

/** Share of a puppet's army committed when its master points it at a target. */
export const PUPPET_COMMITMENT = 0.5;

/**
 * Puppet states.
 *
 * A puppet is a nation that answers to a master: it joins the master's wars on
 * command, and its loss costs the master nothing directly. That last part is
 * the point — a puppet is a buffer you spend, not territory you hold.
 *
 * Three rules:
 *
 *  - **A puppet cannot be turned on its own master.** Otherwise a master could
 *    order a puppet to suicide into them for free territory, or a third party
 *    could cause it by liberating at the wrong moment.
 *  - **A master cannot itself be a puppet's puppet.** Cycles would make
 *    `master()` chains infinite, and there is no sensible meaning for mutual
 *    vassalage.
 *  - **Liberation is unconditional.** Anyone can free a puppet; it is not
 *    gated on defeating the master. Freeing someone else's vassal is a
 *    diplomatic act, and making it hard would make the mechanic a dead end for
 *    the puppet.
 */

/** Whether `master` may take `candidate` as a puppet. */
export function canPuppet(master: Player, candidate: Player): boolean {
  if (master.id() === candidate.id()) return false;
  if (!candidate.isAlive()) return false;
  // No cycles: a nation cannot vassalise the one it already answers to.
  for (let m = master.master(); m !== null; m = m.master()) {
    if (m.id() === candidate.id()) return false;
  }
  return true;
}

/**
 * Pull a master's puppets into a war it just started.
 *
 * Called from AttackExecution so it fires for every attack a master makes,
 * however it began. Puppets that cannot reach the target are simply skipped:
 * a vassal across the map has nothing to contribute, and forcing a doomed
 * attack would just feed the target free troops.
 */
export function followMasterIntoWar(
  mg: Game,
  master: Player,
  targetID: string,
): void {
  if (!mg.hasPlayer(targetID)) return;
  const target = mg.player(targetID);
  for (const puppet of master.puppets()) {
    if (puppet.id() === target.id()) continue;
    if (!puppet.isAlive() || !puppet.sharesBorderWith(target)) continue;
    const committed = Math.floor(puppet.troops() * PUPPET_COMMITMENT);
    if (committed <= 0) continue;
    mg.addExecution(
      new AttackExecution(committed, puppet, target.id(), null, false),
    );
  }
}

/** Point a puppet at a target. The puppet attacks; the master spends nothing. */
export class PuppetCommandExecution implements Execution {
  private active = true;

  constructor(
    private master: Player,
    private puppetID: string,
    private targetID: string,
  ) {}

  init(mg: Game, ticks: number): void {
    this.active = false;
    // Tribes do not participate in superfork diplomacy - see
    // canUseSuperforkSystems.
    if (!canUseSuperforkSystems(this.master.type())) return;
    if (!mg.hasPlayer(this.puppetID) || !mg.hasPlayer(this.targetID)) return;

    const puppet = mg.player(this.puppetID);
    const target = mg.player(this.targetID);

    // Only its own master may command it.
    if (puppet.master()?.id() !== this.master.id()) return;
    // A puppet is never turned on its master.
    if (target.id() === this.master.id()) return;
    if (target.id() === puppet.id()) return;
    if (!puppet.sharesBorderWith(target)) return;

    const committed = Math.floor(puppet.troops() * PUPPET_COMMITMENT);
    if (committed <= 0) return;

    mg.addExecution(
      new AttackExecution(committed, puppet, target.id(), null, false),
    );
  }

  tick(ticks: number): void {}
  isActive(): boolean {
    return this.active;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }
}

/**
 * Free a puppet.
 *
 * The liberator allies the freed nation — the same reasoning as liberation and
 * cede-land: you just restored someone's sovereignty, and leaving them
 * friendless next to their former master would make freeing them pointless.
 */
export class PuppetLiberateExecution implements Execution {
  private active = true;

  constructor(
    private liberator: Player,
    private puppetID: string,
  ) {}

  init(mg: Game, ticks: number): void {
    this.active = false;
    if (!mg.hasPlayer(this.puppetID)) return;

    const puppet = mg.player(this.puppetID);
    const master = puppet.master();
    if (master === null) return;
    // A master cannot "liberate" its own puppet; releasing one is a different
    // act and would otherwise auto-ally them back to the master.
    if (master.id() === this.liberator.id()) return;

    puppet.setMaster(null);
    if (puppet.id() !== this.liberator.id()) {
      const req = this.liberator.createAllianceRequest(puppet);
      req?.accept();
    }

    for (const [who, other] of [
      [this.liberator, puppet],
      [puppet, this.liberator],
    ] as const) {
      mg.displayMessage(
        "events_display.puppet_freed",
        MessageType.ALLIANCE_ACCEPTED,
        who.id(),
        undefined,
        { player: other.displayName() },
      );
    }
  }

  tick(ticks: number): void {}
  isActive(): boolean {
    return this.active;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
