import { z } from "zod";
import { zb } from "@openfront/zbin";
import { Difficulty, UnitType } from "./GameTypes";

/**
 * Superfork progression: the research tree, governments and permanent buffs
 * a player carries from game to game, and the coin / research point (RP)
 * economy that pays for them.
 *
 * Shared by the engine (what a player may build, government effects), the
 * server (accounts, prices, payouts) and the client (menus). Pure data and
 * pure functions only.
 *
 * Everything a tree node unlocks is locked until then for human players in
 * games with progression on; nations and tribes always have everything.
 * Units the tree does not mention are never locked.
 */

// ------------------------------------------------------------- governments --

export const GOVERNMENT_IDS = [
  "standard",
  "democracy",
  "monarchy",
  "communism",
  "theocracy",
  "technocracy",
  "junta",
] as const;
export type GovernmentId = (typeof GOVERNMENT_IDS)[number];
export const GovernmentIdSchema = z.enum(GOVERNMENT_IDS);

/** Multipliers a government (or a buff) applies; 1 = no change. */
export interface Effects {
  /** Gold income. */
  gold: number;
  /** Troop growth. */
  troopGrowth: number;
  /** Troop ceiling. */
  maxTroops: number;
  /** How fast attacks advance (troop movement). */
  attackSpeed: number;
  /** Construction speed (higher is faster). */
  buildSpeed: number;
  /** Attackers lose this much more against you (higher is tougher). */
  defense: number;
  /** Research point output of labs. */
  research: number;
}

export const NO_EFFECTS: Effects = {
  gold: 1,
  troopGrowth: 1,
  maxTroops: 1,
  attackSpeed: 1,
  buildSpeed: 1,
  defense: 1,
  research: 1,
};

export interface Government {
  id: GovernmentId;
  effects: Effects;
}

const gov = (id: GovernmentId, e: Partial<Effects>): Government => ({
  id,
  effects: { ...NO_EFFECTS, ...e },
});

/**
 * Every government trades something for something. "standard" is the game
 * as it always played: no upsides, no downsides, always available.
 */
export const GOVERNMENTS: Record<GovernmentId, Government> = {
  standard: gov("standard", {}),
  // Rise of Nations' democracy: a richer, faster-building economy, but the
  // army moves slowly.
  democracy: gov("democracy", { gold: 1.2, buildSpeed: 1.25, attackSpeed: 0.8 }),
  monarchy: gov("monarchy", { maxTroops: 1.1, defense: 1.1, gold: 0.9 }),
  communism: gov("communism", {
    troopGrowth: 1.25,
    buildSpeed: 1.1,
    gold: 0.8,
  }),
  theocracy: gov("theocracy", { defense: 1.25, research: 0.85, attackSpeed: 0.9 }),
  technocracy: gov("technocracy", {
    research: 1.5,
    buildSpeed: 1.1,
    maxTroops: 0.85,
  }),
  junta: gov("junta", { attackSpeed: 1.2, troopGrowth: 1.1, gold: 0.75 }),
};

/** Ticks between government changes. */
export const GOVERNMENT_SWITCH_COOLDOWN = 120 * 10;
/** After a change, the new government takes this long to take effect. */
export const GOVERNMENT_TRANSITION_TICKS = 30 * 10;

// ------------------------------------------------------------------- tree --

/** Gear every player starts with. */
export const BASE_UNITS: readonly UnitType[] = [
  UnitType.City,
  UnitType.Port,
  UnitType.Factory,
  UnitType.DefensePost,
  UnitType.MissileSilo,
  UnitType.SAMLauncher,
  UnitType.Airstrip,
  UnitType.Destroyer,
  UnitType.TransportShip,
  UnitType.AtomBomb,
  UnitType.HydrogenBomb,
  UnitType.MIRV,
  UnitType.Lab,
];

export const TREE_BRANCHES = [
  "economy",
  "naval",
  "air",
  "strategic",
  "governments",
] as const;
export type TreeBranch = (typeof TREE_BRANCHES)[number];

export interface TreeNode {
  id: string;
  branch: TreeBranch;
  /** Research points to unlock. */
  cost: number;
  /** Nodes that must be unlocked first. */
  requires: readonly string[];
  units?: readonly UnitType[];
  government?: GovernmentId;
}

const node = (
  id: string,
  branch: TreeBranch,
  cost: number,
  requires: string[],
  extra: Pick<TreeNode, "units" | "government">,
): TreeNode => ({ id, branch, cost, requires, ...extra });

export const TREE: readonly TreeNode[] = [
  // Economy
  node("bank", "economy", 100, [], { units: [UnitType.Bank] }),
  node("embassy", "economy", 150, [], { units: [UnitType.Embassy] }),
  node("capital", "economy", 250, ["bank"], { units: [UnitType.Capital] }),
  node("airfield", "air", 150, [], { units: [UnitType.Airfield] }),
  node("international_airport", "economy", 400, ["airfield", "bank"], {
    units: [UnitType.InternationalAirport],
  }),
  // Naval
  node("warship", "naval", 150, [], { units: [UnitType.Warship] }),
  node("corvette", "naval", 200, ["warship"], { units: [UnitType.Corvette] }),
  node("carrier", "naval", 500, ["corvette"], { units: [UnitType.Carrier] }),
  node("asbm", "naval", 600, ["carrier"], { units: [UnitType.ASBM] }),
  // Air
  node("fighter", "air", 200, ["airfield"], { units: [UnitType.FighterJet] }),
  node("interceptor", "air", 300, ["fighter"], {
    units: [UnitType.Interceptor],
  }),
  node("bomber", "air", 300, ["airfield"], { units: [UnitType.Bomber] }),
  node("transport_jet", "air", 250, ["airfield"], {
    units: [UnitType.TransportJet],
  }),
  node("stealth_bomber", "air", 700, ["bomber"], {
    units: [
      UnitType.StealthBomber,
      UnitType.BlindingBomb,
      UnitType.BunkerBuster,
    ],
  }),
  node("large_bomber", "air", 900, ["bomber"], {
    units: [
      UnitType.LargeBomber,
      UnitType.BomberAtomDrop,
      UnitType.BomberHydrogenDrop,
    ],
  }),
  // Strategic
  node("emp", "strategic", 500, [], { units: [UnitType.EMPBomb] }),
  node("neutron", "strategic", 600, ["emp"], {
    units: [UnitType.NeutronBomb],
  }),
  // Governments
  node("gov_democracy", "governments", 200, [], { government: "democracy" }),
  node("gov_monarchy", "governments", 200, [], { government: "monarchy" }),
  node("gov_communism", "governments", 300, [], { government: "communism" }),
  node("gov_theocracy", "governments", 300, [], { government: "theocracy" }),
  node("gov_technocracy", "governments", 400, ["gov_democracy"], {
    government: "technocracy",
  }),
  node("gov_junta", "governments", 400, ["gov_monarchy"], {
    government: "junta",
  }),
];

export const TREE_BY_ID: ReadonlyMap<string, TreeNode> = new Map(
  TREE.map((n) => [n.id, n]),
);

/** Units some tree node unlocks: locked until it is. */
export const TREE_LOCKED_UNITS: ReadonlySet<UnitType> = new Set(
  TREE.flatMap((n) => n.units ?? []),
);

/** Whether `nodes` meet a node's prerequisites. */
export function canUnlockNode(
  id: string,
  unlocked: readonly string[],
): boolean {
  const n = TREE_BY_ID.get(id);
  if (n === undefined || unlocked.includes(id)) return false;
  return n.requires.every((r) => unlocked.includes(r));
}

// ------------------------------------------------------------------ buffs --

export const BUFF_IDS = [
  "gold",
  "troop_growth",
  "max_troops",
  "build_speed",
  "defense",
  "research",
] as const;
export type BuffId = (typeof BUFF_IDS)[number];

export interface Buff {
  id: BuffId;
  effect: keyof Effects;
  /** Bonus per level (0.03 = +3%). */
  perLevel: number;
  maxLevel: number;
}

export const BUFFS: Record<BuffId, Buff> = {
  gold: { id: "gold", effect: "gold", perLevel: 0.03, maxLevel: 5 },
  troop_growth: {
    id: "troop_growth",
    effect: "troopGrowth",
    perLevel: 0.03,
    maxLevel: 5,
  },
  max_troops: {
    id: "max_troops",
    effect: "maxTroops",
    perLevel: 0.02,
    maxLevel: 5,
  },
  build_speed: {
    id: "build_speed",
    effect: "buildSpeed",
    perLevel: 0.05,
    maxLevel: 5,
  },
  defense: { id: "defense", effect: "defense", perLevel: 0.03, maxLevel: 5 },
  research: {
    id: "research",
    effect: "research",
    perLevel: 0.1,
    maxLevel: 5,
  },
};

/** RP for the next level of a buff (level is the current level). */
export function buffCost(level: number): number {
  return 150 * (level + 1);
}

// ------------------------------------------------- what a player brings in --

/**
 * A player's progression as sent in the game start info, so every client
 * applies the same rules to them.
 */
export const ProgressionSchema = z.object({
  /** Admins and developers skip the tree entirely. */
  bypass: z.boolean().optional(),
  /** Unlocked tree node ids. */
  nodes: z.array(z.string().max(32)).max(64),
  /** Buff levels, parallel to BUFF_IDS. */
  buffs: z.array(zb.uint({ max: 10 })).max(BUFF_IDS.length),
  /** Government at the start of the match. */
  government: GovernmentIdSchema.optional(),
});
export type Progression = z.infer<typeof ProgressionSchema>;

export const EMPTY_PROGRESSION: Progression = { nodes: [], buffs: [] };

/** Governments a progression may run. */
export function unlockedGovernments(p: Progression | null): GovernmentId[] {
  if (p === null || p.bypass) return [...GOVERNMENT_IDS];
  const out: GovernmentId[] = ["standard"];
  for (const id of p.nodes) {
    const g = TREE_BY_ID.get(id)?.government;
    if (g !== undefined) out.push(g);
  }
  return out;
}

/** Whether a progression may build a unit type. */
export function unitUnlocked(p: Progression | null, type: UnitType): boolean {
  if (p === null || p.bypass) return true;
  if (!TREE_LOCKED_UNITS.has(type)) return true;
  return p.nodes.some((id) => TREE_BY_ID.get(id)?.units?.includes(type));
}

/** The combined multipliers of a progression's buffs. */
export function buffEffects(p: Progression | null): Effects {
  const out = { ...NO_EFFECTS };
  if (p === null) return out;
  BUFF_IDS.forEach((id, i) => {
    const level = Math.min(p.buffs[i] ?? 0, BUFFS[id].maxLevel);
    out[BUFFS[id].effect] += BUFFS[id].perLevel * level;
  });
  return out;
}

export function combineEffects(a: Effects, b: Effects): Effects {
  const out = { ...a };
  for (const k of Object.keys(out) as (keyof Effects)[]) out[k] *= b[k];
  return out;
}

// ---------------------------------------------------------------- economy --

/** Coins for winning, by difficulty. Multiplayer wins pay half again. */
export function coinsForWin(
  difficulty: Difficulty,
  multiplayer: boolean,
): number {
  const base: Record<Difficulty, number> = {
    [Difficulty.Easy]: 50,
    [Difficulty.Medium]: 100,
    [Difficulty.Hard]: 200,
    [Difficulty.Impossible]: 400,
  };
  return Math.floor(base[difficulty] * (multiplayer ? 1.5 : 1));
}

/** Coins per research point when buying RP. */
export const COINS_PER_RP = 2;

/** Research points a lab of this level makes per RP_INTERVAL ticks. */
export const LAB_RP_PER_LEVEL = 1;
/** Ticks between lab payouts (30 seconds). */
export const RP_INTERVAL = 30 * 10;
/** Most RP one match can bank (stops a runaway lab farm). */
export const MAX_RP_PER_MATCH = 2000;

/** Cosmetic prices in coins, by rarity. Flags are always free. */
export const COSMETIC_PRICES: Record<string, number> = {
  common: 100,
  uncommon: 250,
  rare: 500,
  epic: 1000,
  legendary: 2500,
};

export function cosmeticPrice(rarity: string): number {
  return COSMETIC_PRICES[rarity] ?? 500;
}
