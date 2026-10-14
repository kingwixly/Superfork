import type { ExecRecord } from "./SnapshotContext";

/**
 * Superfork executions do not serialize into game snapshots yet.
 *
 * Upstream's snapshot system (README.md in this folder) asks every Execution
 * for a versioned record so a game can be paused, forked or seeked. Nothing
 * in a live match takes a snapshot, so the superfork types stub it out and
 * fail loudly if one ever does, rather than writing a record that restores
 * into a half-built execution. Port a type properly by giving it a schema,
 * snapshot()/restoreSnapshot() and an ExecutionRegistry entry.
 */
export function unsnapshottable(execution: string): ExecRecord {
  throw new Error(
    `${execution} does not support game snapshots yet (superfork)`,
  );
}
