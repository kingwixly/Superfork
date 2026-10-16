import { zb } from "@openfront/zbin";
import quickChatData from "resources/QuickChat.json";
import { z } from "zod";
import {
  AllPlayers,
  Difficulty,
  Duos,
  GameMapSize,
  GameMapType,
  GameMode,
  GameType,
  HumansVsNations,
  MAX_UPGRADE_AMOUNT,
  Quads,
  RankedType,
  Trios,
  UnitType,
} from "./game/GameTypes";
import { PlayerStatsSchema } from "./StatsSchemas";

export type GameID = string;
export type ClientID = string;

export type Intent =
  | SpawnIntent
  | AttackIntent
  | CancelAttackIntent
  | BoatAttackIntent
  | CancelBoatIntent
  | AllianceRequestIntent
  | AllianceRejectIntent
  | AllianceExtensionIntent
  | BreakAllianceIntent
  | TargetPlayerIntent
  | EmojiIntent
  | DonateGoldIntent
  | DonateTroopsIntent
  | BuildUnitIntent
  | EmbargoIntent
  | QuickChatIntent
  | MoveWarshipIntent
  | MarkDisconnectedIntent
  | EmbargoAllIntent
  | UpgradeStructureIntent
  | DeleteUnitIntent
  | KickPlayerIntent
  | TogglePauseIntent
  | UpdateGameConfigIntent
  | ToggleGameStartTimer
  // Superfork
  | PromoteCapitalIntent
  | DemoteCapitalIntent
  | EmbassyRequestIntent
  | EmbassyResponseIntent
  | CeasefireProposeIntent
  | CeasefireResponseIntent
  | SanctionIntent
  | CedeLandIntent
  | TreatyCreateIntent
  | TreatyInviteIntent
  | TreatyResponseIntent
  | TreatyLeaveIntent
  | RequestAssistanceIntent
  | AssistanceResponseIntent
  | PuppetCommandIntent
  | PuppetLiberateIntent
  | SetBorderPolicyIntent
  | MoveAircraftIntent
  | RenameCapitalIntent
  | WithdrawBankIntent
  | LoadCorvetteIntent
  | LaunchCorvetteIntent
  | UciIntent
  | RecallAircraftIntent;

export type AttackIntent = z.infer<typeof AttackIntentSchema>;

// Superfork intent types.
export type PromoteCapitalIntent = z.infer<typeof PromoteCapitalIntentSchema>;
export type DemoteCapitalIntent = z.infer<typeof DemoteCapitalIntentSchema>;
export type EmbassyRequestIntent = z.infer<typeof EmbassyRequestIntentSchema>;
export type EmbassyResponseIntent = z.infer<typeof EmbassyResponseIntentSchema>;
export type CeasefireProposeIntent = z.infer<
  typeof CeasefireProposeIntentSchema
>;
export type CeasefireResponseIntent = z.infer<
  typeof CeasefireResponseIntentSchema
>;
export type SanctionIntent = z.infer<typeof SanctionIntentSchema>;
export type CedeLandIntent = z.infer<typeof CedeLandIntentSchema>;
export type UciIntent = z.infer<typeof UciIntentSchema>;
export type UciAction = z.infer<typeof UciActionSchema>;
export type TreatyCreateIntent = z.infer<typeof TreatyCreateIntentSchema>;
export type TreatyInviteIntent = z.infer<typeof TreatyInviteIntentSchema>;
export type TreatyResponseIntent = z.infer<typeof TreatyResponseIntentSchema>;
export type TreatyLeaveIntent = z.infer<typeof TreatyLeaveIntentSchema>;
export type RequestAssistanceIntent = z.infer<
  typeof RequestAssistanceIntentSchema
>;
export type AssistanceResponseIntent = z.infer<
  typeof AssistanceResponseIntentSchema
>;
export type PuppetCommandIntent = z.infer<typeof PuppetCommandIntentSchema>;
export type PuppetLiberateIntent = z.infer<typeof PuppetLiberateIntentSchema>;
export type SetBorderPolicyIntent = z.infer<typeof SetBorderPolicyIntentSchema>;
export type MoveAircraftIntent = z.infer<typeof MoveAircraftIntentSchema>;
export type RecallAircraftIntent = z.infer<typeof RecallAircraftIntentSchema>;
export type RenameCapitalIntent = z.infer<typeof RenameCapitalIntentSchema>;
export type WithdrawBankIntent = z.infer<typeof WithdrawBankIntentSchema>;
export type LoadCorvetteIntent = z.infer<typeof LoadCorvetteIntentSchema>;
export type LaunchCorvetteIntent = z.infer<typeof LaunchCorvetteIntentSchema>;
export type CancelAttackIntent = z.infer<typeof CancelAttackIntentSchema>;
export type SpawnIntent = z.infer<typeof SpawnIntentSchema>;
export type BoatAttackIntent = z.infer<typeof BoatAttackIntentSchema>;
export type EmbargoAllIntent = z.infer<typeof EmbargoAllIntentSchema>;
export type CancelBoatIntent = z.infer<typeof CancelBoatIntentSchema>;
export type AllianceRequestIntent = z.infer<typeof AllianceRequestIntentSchema>;
export type AllianceRejectIntent = z.infer<typeof AllianceRejectIntentSchema>;
export type BreakAllianceIntent = z.infer<typeof BreakAllianceIntentSchema>;
export type TargetPlayerIntent = z.infer<typeof TargetPlayerIntentSchema>;
export type EmojiIntent = z.infer<typeof EmojiIntentSchema>;
export type DonateGoldIntent = z.infer<typeof DonateGoldIntentSchema>;
export type DonateTroopsIntent = z.infer<typeof DonateTroopIntentSchema>;
export type EmbargoIntent = z.infer<typeof EmbargoIntentSchema>;
export type BuildUnitIntent = z.infer<typeof BuildUnitIntentSchema>;
export type UpgradeStructureIntent = z.infer<
  typeof UpgradeStructureIntentSchema
>;
export type MoveWarshipIntent = z.infer<typeof MoveWarshipIntentSchema>;
export type QuickChatIntent = z.infer<typeof QuickChatIntentSchema>;
export type MarkDisconnectedIntent = z.infer<
  typeof MarkDisconnectedIntentSchema
>;
export type AllianceExtensionIntent = z.infer<
  typeof AllianceExtensionIntentSchema
>;
export type DeleteUnitIntent = z.infer<typeof DeleteUnitIntentSchema>;
export type KickPlayerIntent = z.infer<typeof KickPlayerIntentSchema>;
export type TogglePauseIntent = z.infer<typeof TogglePauseIntentSchema>;
export type UpdateGameConfigIntent = z.infer<
  typeof UpdateGameConfigIntentSchema
>;
export type ToggleGameStartTimer = z.infer<
  typeof ToggleGameStartTimerIntentSchema
>;

export type Turn = z.infer<typeof TurnSchema>;
export type GameConfig = z.infer<typeof GameConfigSchema>;

export type AllPlayersStats = z.infer<typeof AllPlayersStatsSchema>;
export type Player = z.infer<typeof PlayerSchema>;

export type GameStartInfo = z.infer<typeof GameStartInfoSchema>;

// Deliberately looser than MAX_USERNAME_LENGTH, which caps what the form will
// accept at 20. This schema also reads data at rest: it backs PlayerSchema,
// so every archived GameRecord embeds names written under the rules of its
// era. Lowering the bound doesn't rewrite those records — it makes them
// unparseable, which dead-ends replay links (JoinLobbyModal parses before the
// gitCommit check, so a failure never reaches the versioned-shell fallback)
// and share previews (GamePreviewBuilder). Widen freely; never narrow.
//
// The charset accepts everything AccountUsernameSchema can produce, hyphens
// included, so a verified account name is always representable on the wire —
// verified play skips free-form validation, so an unrepresentable name would
// reach the server and be closed with CloseCode.BadRequest.
//
// Letters and digits the in-game name renderer can actually draw, plus the
// punctuation a name may carry. This is what lets José, Müller, Renée and
// Bjørn keep their names instead of falling back to a generated one.
//
// The bound is U+00FF — the end of Latin-1 Supplement — and it is set by the
// renderer twice over. Do not raise it without changing the renderer first:
//
//  1. The string path is 8-bit end to end. `TextLayout` writes
//     `charCodes[i] = text.charCodeAt(i)` into a `Uint8Array`, `DataTextures`
//     uploads it as `R8UI`/`UNSIGNED_BYTE`, and `name.vert.glsl` uses the
//     byte directly as the glyph index. Anything above 255 silently truncates
//     mod 256: Ł (U+0141) would draw as "A", ā (U+0101) as a code-0 slot the
//     shader drops while still consuming a layout position.
//  2. The atlas has no glyphs up there anyway. Of the 128 Latin Extended-A
//     entries in `resources/atlases/msdf-atlas.json`, exactly three (Œ œ Ÿ)
//     have a real glyph; the other 125 point at .notdef. All 64 Latin-1
//     Supplement entries are real.
//
// `CHAR_RANGE = 384` in the name-pass sizes the metrics and kerning tables, so
// it looks like the limit and is not — it is an upper bound on ids the atlas
// file may contain, not on what the string path can carry.
//
// Deliberately NOT every codepoint below the bound: that would admit control
// characters, the C1 block, and HTML-significant punctuation. The ranges skip
// × (U+00D7) and ÷ (U+00F7), maths symbols sitting inside the Latin-1 letter
// block, and the ordinal/micro signs.
//
// Emoji are excluded on purpose and stay excluded: the renderer draws them as
// a separate icon beside the name, never inline, so an emoji in the name
// itself has no glyph at all.
//
// Regex source for the character class, not a finished pattern: the wire
// schema, the free-form form rule and the persona sanitiser all need the same
// set in different shapes, and a single source is what keeps them from
// drifting apart by hand (which is how the charsets got out of step before).
export const RENDERABLE_NAME_ALNUM =
  "a-zA-Z0-9\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u00FF";
export const RENDERABLE_NAME_CHARS = ` _.\\-${RENDERABLE_NAME_ALNUM}`;

/** One renderable character. Used per-codepoint by the persona sanitiser. */
export const RENDERABLE_NAME_CHAR_RE = new RegExp(
  `^[${RENDERABLE_NAME_CHARS}]$`,
  "u",
);

/** At least one letter or digit — punctuation alone is not a name. */
export const RENDERABLE_NAME_HAS_ALNUM_RE = new RegExp(
  `[${RENDERABLE_NAME_ALNUM}]`,
  "u",
);

// Requires at least one non-space so a name is never all padding.
export const UsernameSchema = z
  .string()
  .regex(new RegExp(`^(?=.*\\S)[${RENDERABLE_NAME_CHARS}]+$`, "u"))
  .min(3)
  .max(27);

export const ClanTagSchema = z
  .string()
  .regex(/^[a-zA-Z0-9]{2,5}$/)
  .nullable();

//
// Utility types
//

// select: encoding an untagged union without one costs a zod safeParse per
// rejected candidate (~10 µs each) — real money on schemas embedded in every
// GameConfig on the wire. The candidate ORDER is the wire layout; only the
// picking got cheaper.
const TEAM_COUNT_PRESETS = [Duos, Trios, Quads, HumansVsNations] as const;
const TeamCountConfigSchema = zb.union(
  [
    zb.uint(),
    z.literal(Duos),
    z.literal(Trios),
    z.literal(Quads),
    z.literal(HumansVsNations),
  ],
  {
    select: (v) =>
      typeof v === "number"
        ? 0
        : TEAM_COUNT_PRESETS.indexOf(v as (typeof TEAM_COUNT_PRESETS)[number]) +
          1,
  },
);
export type TeamCountConfig = z.infer<typeof TeamCountConfigSchema>;

// Doomsday Clock (anti-stall). Below a rising share of the map a player (or, in
// team modes, their whole team) gets skulled and their troops drain to zero. The
// required share rises in discrete waves per the `speed` preset (see
// DoomsdayClock.ts). Only `enabled` and `speed` are wire-configurable; the
// drain/warn tuning lives in DOOMSDAY_CLOCK_DEFAULTS (Config.ts).
export const DoomsdayClockConfigSchema = z.object({
  enabled: z.boolean().optional(),
  speed: z.enum(["slow", "normal", "fast", "veryfast"]).optional(),
});

// Overtime (anti-stalemate). After startMinutes of game time the tile share
// required to win drops steadily from the 80% base at a fixed rate (see
// OVERTIME_DEFAULTS in Config.ts), so the leading side eventually crosses the
// shrinking bar and a stalled game is guaranteed to end. Only `enabled` and
// `startMinutes` are wire-configurable.
export const OvertimeConfigSchema = z.object({
  enabled: z.boolean().optional(),
  startMinutes: zb.uint({ min: 1, max: 120 }).optional(),
});

// A lobby pool: several lobbies that arriving players are spread across, so
// one advertised entry point can absorb more players than a single lobby
// holds. Assignment is a hash of the joiner's identity (server/PoolRouting.ts),
// so members need no shared state. Every member carries this same config and
// recognises itself by its own game id.
//
// The advertised entry point is itself a member rather than an empty router:
// a lobby nobody plays in would start, leave the Lobby phase, drop out of the
// listing and be reaped, taking the entry point with it.
export const PoolConfigSchema = z
  .object({
    id: z.string().min(1).max(64),
    // z.lazy because ID is declared further down this file, and GameConfigSchema
    // — which embeds this — is evaluated before that point.
    siblings: z
      .lazy(() => ID)
      .array()
      .min(1)
      .max(64),
  })
  // Rejected rather than deduped: a repeated id holds more than one slot and
  // draws proportionally more players than the rest.
  .refine((pool) => new Set(pool.siblings).size === pool.siblings.length, {
    error: "pool siblings must be unique",
    path: ["siblings"],
  });
export type PoolConfig = z.infer<typeof PoolConfigSchema>;

export const GameConfigSchema = z.object({
  gameMap: z.enum(GameMapType),
  difficulty: z.enum(Difficulty),
  donateGold: z.boolean(), // Configures donations to humans only
  donateTroops: z.boolean(), // Configures donations to humans only
  gameType: z.enum(GameType),
  gameMode: z.enum(GameMode),
  rankedType: z.enum(RankedType).optional(), // Only set for ranked games.
  gameMapSize: z.enum(GameMapSize),
  doomsdayClock: DoomsdayClockConfigSchema.optional(),
  overtime: OvertimeConfigSchema.optional(),
  publicGameModifiers: z
    .object({
      isCompact: z.boolean().optional(),
      isRandomSpawn: z.boolean().optional(),
      isCrowded: z.boolean().optional(),
      isHardNations: z.boolean().optional(),
      startingGold: zb.uint().optional(),
      goldMultiplier: zb.float({ min: 0.1, max: 1000 }).optional(),
      isAlliancesDisabled: z.boolean().optional(),
      isPortsDisabled: z.boolean().optional(),
      isNukesDisabled: z.boolean().optional(),
      isSAMsDisabled: z.boolean().optional(),
      isPeaceTime: z.boolean().optional(),
      isWaterNukes: z.boolean().optional(),
      isDoomsdayClock: z.boolean().optional(),
    })
    .optional(),
  nations: zb.union(
    [zb.uint({ min: 1, max: 400 }), z.enum(["default", "disabled"])],
    {
      select: (v) => (typeof v === "number" ? 0 : 1),
    },
  ),
  bots: zb.uint({ max: 400 }),
  infiniteGold: z.boolean(),
  infiniteTroops: z.boolean(),
  instantBuild: z.boolean(),
  disableNavMesh: z.boolean().optional(),
  disableAlliances: z.boolean().nullable().optional(),
  disableClanTags: z.boolean().optional(),
  // Opt-in live game stats reporting for the admin bot. Off by default and has
  // no UI — the admin bot sets it when creating tournament games, since it adds
  // per-client traffic. See LiveStatsController / GameServer.handleLiveStats.
  liveStatsEnabled: z.boolean().optional(),
  anonymizeNames: z.boolean().optional(),
  // While anonymizeNames is on, clientIDs the host has granted real-name
  // visibility to (e.g. casters / observers). Everyone else stays anonymized.
  nameReveals: z.string().array().optional(),
  // Like nameReveals but keyed by stable account publicId (for automated hosts
  // that only know publicIds at create_game); resolved to clientID at lookup.
  nameRevealPublicIds: z.string().array().max(200).optional(),
  waterNukes: z.boolean().nullable().optional(),
  randomSpawn: z.boolean(),
  maxPlayers: zb.uint().optional(),
  // OFM: allowlist of publicIds allowed to join (admin-only, see create_game).
  allowedPublicIds: z.array(z.string()).max(200).optional(),
  // Only accounts the API reports as trusted (users/@me `trustTier`) may join.
  // Enforced server-side at join (GameServer.joinClient); advertised in the
  // lobby browser so a card can show a lock. No host UI yet: set through
  // create_game / update_game_config.
  trusted: z.boolean().optional(),
  maxTimerValue: zb.uint({ min: 1, max: 120 }).nullable().optional(), // In minutes
  customAllianceDuration: zb.uint({ max: 15 }).nullable().optional(), // In minutes; 0 disables alliances
  startDelay: zb.uint({ max: 600 }).nullable().optional(), // In seconds
  spawnImmunityDuration: zb.uint().nullable().optional(), // In ticks
  disabledUnits: z.enum(UnitType).array().optional(),
  playerTeams: TeamCountConfigSchema.optional(),
  goldMultiplier: zb.float({ min: 0.1, max: 1000 }).nullable().optional(),
  startingGold: zb.uint({ max: 1000000000 }).nullable().optional(),
  hostCheats: z
    .object({
      infiniteGold: z.boolean().optional(),
      infiniteTroops: z.boolean().optional(),
      goldMultiplier: zb.float({ min: 0.1, max: 1000 }).nullable().optional(),
      startingGold: zb.uint({ max: 1000000000 }).nullable().optional(),
    })
    .optional(),
  // Stripped from gameStartInfo and from the advertised lobby config: sibling
  // ids are private lobby ids, which are join secrets.
  pool: PoolConfigSchema.optional(),
});

// What a host sends in update_game_config. maxPlayers is the private-lobby
// player cap: nullable so the host can lift it (null clears, undefined leaves
// it alone), and at least 2 so a lobby can't be capped down to the host alone.
export const GameConfigPatchSchema = GameConfigSchema.partial().extend({
  maxPlayers: zb.uint({ min: 2, max: 1000 }).nullable().optional(),
});
export type GameConfigPatch = z.infer<typeof GameConfigPatchSchema>;

export const TeamSchema = z.string();

export const SafeString = z
  .string()
  .regex(
    /^([a-zA-Z0-9\s.,!?@#$%&*()\-_+=[\]{}|;:"'/\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff]|[üÜ])*$/u,
  )
  .max(1000);

export const emojiTable = [
  ["😀", "😊", "🥰", "😇", "😎"],
  ["😞", "🥺", "😭", "😱", "😡"],
  ["😈", "🤡", "🥱", "🫡", "🖕"],
  ["👋", "👏", "✋", "🙏", "💪"],
  ["👍", "👎", "🫴", "🤌", "🤦‍♂️"],
  ["🤝", "🆘", "🕊️", "🏳️", "⏳"],
  ["🔥", "💥", "💀", "☢️", "⚠️"],
  ["↖️", "⬆️", "↗️", "👑", "🥇"],
  ["⬅️", "🎯", "➡️", "🥈", "🥉"],
  ["↙️", "⬇️", "↘️", "❤️", "💔"],
  ["💰", "⚓", "⛵", "🏡", "🛡️"],
  ["🏭", "🚂", "❓", "🐔", "🐀"],
] as const;

// 2d to 1d array
export const flattenedEmojiTable = emojiTable.flat();

export type Emoji = (typeof flattenedEmojiTable)[number];

const EmojiSchema = zb.uint({ max: flattenedEmojiTable.length - 1 });

// 8–10: today's ids are 8 chars; multi-server ids (docs/MultiServer.md) will
// be 10 (instance letter + 9 random). The range ships ahead of the new format
// so every deployed client/server validates the longer ids before any are
// minted — old bundles reject unknown id lengths at the Zod layer.
export const GAME_ID_REGEX = /^[A-Za-z0-9]{8,10}$/;

export const isValidGameID = (value: string): boolean =>
  GAME_ID_REGEX.test(value);

export const ID = z.string().regex(GAME_ID_REGEX);

// zbin dictionary for player clientIDs (see ZbinWire.ts): both peers seed it
// from GameStartInfo.players, so an in-game player id costs one byte on the
// binary wire. Validates exactly like ID; ids outside the roster (e.g.
// ADMIN_BOT_CLIENT_ID) encode inline via the escape byte.
export const CLIENT_ID_MAPPING = "clientId";
export const MappedID = zb.mapped(CLIENT_ID_MAPPING, { regex: GAME_ID_REGEX });

export const AllPlayersStatsSchema = z.record(ID, PlayerStatsSchema);

export const QuickChatKeySchema = z.enum(
  Object.entries(quickChatData).flatMap(([category, entries]) =>
    entries.map((entry) => `${category}.${entry.key}`),
  ) as [string, ...string[]],
);

//
// Intents
//

export const AllianceExtensionIntentSchema = z.object({
  type: z.literal("allianceExtension"),
  recipient: MappedID,
});

export const AttackIntentSchema = z.object({
  type: z.literal("attack"),
  targetID: MappedID.nullable(),
  troops: zb.float({ min: 0 }).nullable(),
});

export const SpawnIntentSchema = z.object({
  type: z.literal("spawn"),
  // A TileRef indexes the typed-array terrain buffers, so it must be a
  // non-negative integer. Fractional refs silently corrupt those lookups.
  tile: zb.uint(),
});

export const BoatAttackIntentSchema = z.object({
  type: z.literal("boat"),
  // Not an int: troops are fractional throughout the sim (attackRatio *
  // troops(), combat attrition), and the client sends the raw float.
  troops: zb.float({ min: 0 }),
  dst: zb.uint(),
});

export const AllianceRequestIntentSchema = z.object({
  type: z.literal("allianceRequest"),
  recipient: MappedID,
});

export const AllianceRejectIntentSchema = z.object({
  type: z.literal("allianceReject"),
  requestor: MappedID,
});

export const BreakAllianceIntentSchema = z.object({
  type: z.literal("breakAlliance"),
  recipient: MappedID,
});

export const TargetPlayerIntentSchema = z.object({
  type: z.literal("targetPlayer"),
  target: MappedID,
});

export const EmojiIntentSchema = z.object({
  type: z.literal("emoji"),
  recipient: zb.union([MappedID, z.literal(AllPlayers)], {
    select: (v) => (v === AllPlayers ? 1 : 0),
  }),
  emoji: EmojiSchema,
});

export const EmbargoIntentSchema = z.object({
  type: z.literal("embargo"),
  targetID: MappedID,
  action: z.union([z.literal("start"), z.literal("stop")]),
});

export const EmbargoAllIntentSchema = z.object({
  type: z.literal("embargo_all"),
  action: z.union([z.literal("start"), z.literal("stop")]),
});

export const DonateGoldIntentSchema = z.object({
  type: z.literal("donate_gold"),
  recipient: MappedID,
  gold: zb.float({ min: 0 }).nullable(),
});

export const DonateTroopIntentSchema = z.object({
  type: z.literal("donate_troops"),
  recipient: MappedID,
  troops: zb.float({ min: 0 }).nullable(),
});

export const BuildUnitIntentSchema = z.object({
  type: z.literal("build_unit"),
  unit: z.enum(UnitType),
  tile: zb.uint(),
  rocketDirectionUp: z.boolean().optional(),
  amount: zb.uint({ min: 1, max: MAX_UPGRADE_AMOUNT }).optional(),
});

export const UpgradeStructureIntentSchema = z.object({
  type: z.literal("upgrade_structure"),
  unit: z.enum(UnitType),
  unitId: zb.uint(),
  amount: zb.uint({ min: 1, max: MAX_UPGRADE_AMOUNT }).optional(),
});

export const CancelAttackIntentSchema = z.object({
  type: z.literal("cancel_attack"),
  attackID: z.string(),
});

export const CancelBoatIntentSchema = z.object({
  type: z.literal("cancel_boat"),
  unitID: zb.uint(),
});

export const MoveWarshipIntentSchema = z.object({
  type: z.literal("move_warship"),
  unitIds: z.array(zb.int()).nonempty(),
  tile: zb.uint(),
});

export const DeleteUnitIntentSchema = z.object({
  type: z.literal("delete_unit"),
  unitId: zb.uint(),
});

export const QuickChatIntentSchema = z.object({
  type: z.literal("quick_chat"),
  recipient: MappedID,
  quickChatKey: QuickChatKeySchema,
  target: MappedID.optional(),
});

// Server-internal (rejected from clients). The player being marked is the
// intent's own sender, so the target rides the stamped `clientID` that
// StampedIntentSchema adds to every intent — declaring it here too would
// write the same key twice on the binary wire.
export const MarkDisconnectedIntentSchema = z.object({
  type: z.literal("mark_disconnected"),
  isDisconnected: z.boolean(),
});

export const KickPlayerIntentSchema = z.object({
  type: z.literal("kick_player"),
  // Either a live clientID (lobby / in-game kick) OR an account publicID, for
  // callers that identify a player by account rather than per-session clientID;
  // the server resolves the publicID to the live clientID. Exactly one is set.
  targetClientID: MappedID.optional(),
  targetPublicID: MappedID.optional(),
});

export const TogglePauseIntentSchema = z.object({
  type: z.literal("toggle_pause"),
  paused: z.boolean().default(false),
});

export const UpdateGameConfigIntentSchema = z.object({
  type: z.literal("update_game_config"),
  // zb.json: too rare and too config-shaped to deserve a binary layout —
  // rides the binary wire as length-prefixed JSON.
  config: zb.json(GameConfigPatchSchema),
});

export const ToggleGameStartTimerIntentSchema = z.object({
  type: z.literal("toggle_game_start_timer"),
});

//
// Superfork intents
//
// Buildings and units need no new intent: BuildUnitIntentSchema already keys
// off z.enum(UnitType), so every type added to that enum rides it for free.
// What follows is only the verbs vanilla has no equivalent for.
//
// These are appended to the end of IntentSchema's union deliberately. The
// zbin wire is positional, so union order is the wire contract; appending
// keeps every existing intent's discriminator index stable and confines the
// churn to new code.
//

/** Largest area a single cede may transfer, to bound the intent's wire size. */
export const MAX_CEDE_TILES = 4096;

/** Promote an owned City into this nation's Capital. One per nation. */
export const PromoteCapitalIntentSchema = z.object({
  type: z.literal("promote_capital"),
  unitId: zb.uint(),
});

/**
 * Demote is a separate verb rather than a toggle on promote, because it is
 * the one the demotion rules can legally refuse: a capital stacked with a
 * Port or International Airport is locked in permanently.
 */
export const DemoteCapitalIntentSchema = z.object({
  type: z.literal("demote_capital"),
  unitId: zb.uint(),
});

/**
 * Embassies require mutual consent, so placement is a two-step handshake:
 * the guest nominates a tile in the host's territory, the host accepts.
 */
export const EmbassyRequestIntentSchema = z.object({
  type: z.literal("embassy_request"),
  host: MappedID,
  tile: zb.uint(),
});

export const EmbassyResponseIntentSchema = z.object({
  type: z.literal("embassy_response"),
  requestor: MappedID,
  accept: z.boolean(),
});

/**
 * `liberationFor` carries the mediator's optional liberation condition: if
 * set, accepting also reverts that player's territory to its pre-war state.
 * Folding it into the ceasefire intent rather than giving liberation its own
 * verb keeps the two atomic — you cannot accept one and not the other.
 */
export const CeasefireProposeIntentSchema = z.object({
  type: z.literal("ceasefire_propose"),
  recipient: MappedID,
  liberationFor: MappedID.optional(),
});

export const CeasefireResponseIntentSchema = z.object({
  type: z.literal("ceasefire_response"),
  requestor: MappedID,
  accept: z.boolean(),
});

/**
 * Distinct from embargo: sanctions additionally close land borders to trains
 * and ships and restrict airspace. Embargo stays as-is for trade-only cuts.
 */
export const SanctionIntentSchema = z.object({
  type: z.literal("sanction"),
  targetID: MappedID,
  action: z.union([z.literal("start"), z.literal("stop")]),
});

/** Hand an owned area to another nation. Reviving a dead nation auto-allies. */
export const CedeLandIntentSchema = z.object({
  type: z.literal("cede_land"),
  recipient: MappedID,
  tiles: z.array(zb.uint()).nonempty().max(MAX_CEDE_TILES),
  /**
   * Liberation: when true the server REPLACES `tiles` with every tile the
   * sender still holds that was taken from `recipient`. The conquest ledger is
   * server state, so the client cannot compute this itself. Appended, never
   * inserted - union order is the wire contract.
   */
  liberate: z.boolean().optional(),
});

/** Up to 3 at creation (self plus two), 5 total once others are invited. */
export const TreatyCreateIntentSchema = z.object({
  type: z.literal("treaty_create"),
  members: z.array(MappedID).nonempty().max(2),
});

export const TreatyInviteIntentSchema = z.object({
  type: z.literal("treaty_invite"),
  treatyID: z.string(),
  recipient: MappedID,
});

export const TreatyResponseIntentSchema = z.object({
  type: z.literal("treaty_response"),
  treatyID: z.string(),
  accept: z.boolean(),
});

export const TreatyLeaveIntentSchema = z.object({
  type: z.literal("treaty_leave"),
  treatyID: z.string(),
});

/**
 * Alliance fighting: ask an ally to join a war directly, rather than waiting
 * for their own AI or judgement to bring them in. `mode` picks which form of
 * help is being asked for.
 */
export const RequestAssistanceIntentSchema = z.object({
  type: z.literal("request_assistance"),
  recipient: MappedID,
  against: MappedID,
  mode: z.union([z.literal("attack"), z.literal("troops")]),
});

export const AssistanceResponseIntentSchema = z.object({
  type: z.literal("assistance_response"),
  requestor: MappedID,
  accept: z.boolean(),
});

/** Direct a puppet state at a target. Puppets auto-follow their master's wars. */
export const PuppetCommandIntentSchema = z.object({
  type: z.literal("puppet_command"),
  puppet: MappedID,
  target: MappedID,
});

export const PuppetLiberateIntentSchema = z.object({
  type: z.literal("puppet_liberate"),
  puppet: MappedID,
});

/**
 * The nation control panel. `borderTrade` and `publicAirports` together are
 * what let non-allied nations fly civilian traffic into your airports.
 */
export const SetBorderPolicyIntentSchema = z.object({
  type: z.literal("set_border_policy"),
  borderTrade: z.boolean().optional(),
  publicAirports: z.boolean().optional(),
});

/** Load troops onto a corvette you or an ally owns. */
export const LoadCorvetteIntentSchema = z.object({
  type: z.literal("load_corvette"),
  unitId: zb.uint(),
  troops: zb.uint(),
});

/** Launch a corvette's loaded troops at a tile. */
export const LaunchCorvetteIntentSchema = z.object({
  type: z.literal("launch_corvette"),
  unitId: zb.uint(),
  tile: zb.uint(),
});

/** Withdraw a bank's accrued reserve into your treasury. */
export const WithdrawBankIntentSchema = z.object({
  type: z.literal("withdraw_bank"),
  unitId: zb.uint(),
});

/** Name or rename your capital. Empty string clears it. */
export const RenameCapitalIntentSchema = z.object({
  type: z.literal("rename_capital"),
  unitId: zb.uint(),
  name: z.string(),
});

/** Aircraft repositioning. Mirrors move_warship. */
export const MoveAircraftIntentSchema = z.object({
  type: z.literal("move_aircraft"),
  unitIds: z.array(zb.int()).nonempty(),
  tile: zb.uint(),
});

/**
 * Call aircraft off their mission: the X on the attacks bar. Fighters and
 * interceptors go back to patrolling their base, bombers abort and fly home,
 * transport jets turn round (their troops rejoin at base), and a strategic
 * bomber's strike is aborted with the payload refunded.
 */
export const RecallAircraftIntentSchema = z.object({
  type: z.literal("recall_aircraft"),
  unitIds: z.array(zb.int()).nonempty(),
});

/**
 * UCI developer tools. The server only relays one from a client that has
 * proven the UCI password (see src/server/UciAuth.ts); in singleplayer the
 * client checks the password over HTTP before showing the menu at all.
 */
export const UciActionSchema = z.enum([
  "gold",
  "troops",
  "lock_attack",
  "cede_country",
  "cede_area",
  "switch",
  "disappear",
  "ai_attack",
  "ai_answers",
  "announce",
  "pause",
  "end_game",
  "transfer_host",
]);
export const MAX_UCI_ANNOUNCEMENT = 200;
export const UciIntentSchema = z.object({
  type: z.literal("uci"),
  action: UciActionSchema,
  /** The country acted on. Defaults to the admin's own where that makes sense. */
  targetID: MappedID.optional(),
  /** Who receives ceded land. Defaults to the admin. */
  recipientID: MappedID.optional(),
  tiles: z.array(zb.uint()).max(MAX_CEDE_TILES).optional(),
  enabled: z.boolean().optional(),
  aiAnswer: z.enum(["yes", "no", "normal"]).optional(),
  text: SafeString.max(MAX_UCI_ANNOUNCEMENT).optional(),
  /** transfer_host: the new host's clientID. */
  targetClientID: MappedID.optional(),
});

export const IntentSchema = z.discriminatedUnion("type", [
  AttackIntentSchema,
  CancelAttackIntentSchema,
  SpawnIntentSchema,
  MarkDisconnectedIntentSchema,
  BoatAttackIntentSchema,
  CancelBoatIntentSchema,
  AllianceRequestIntentSchema,
  AllianceRejectIntentSchema,
  BreakAllianceIntentSchema,
  TargetPlayerIntentSchema,
  EmojiIntentSchema,
  DonateGoldIntentSchema,
  DonateTroopIntentSchema,
  BuildUnitIntentSchema,
  UpgradeStructureIntentSchema,
  EmbargoIntentSchema,
  EmbargoAllIntentSchema,
  MoveWarshipIntentSchema,
  QuickChatIntentSchema,
  AllianceExtensionIntentSchema,
  DeleteUnitIntentSchema,
  KickPlayerIntentSchema,
  TogglePauseIntentSchema,
  UpdateGameConfigIntentSchema,
  ToggleGameStartTimerIntentSchema,

  // Superfork. Appended so existing discriminator indexes stay put.
  PromoteCapitalIntentSchema,
  DemoteCapitalIntentSchema,
  EmbassyRequestIntentSchema,
  EmbassyResponseIntentSchema,
  CeasefireProposeIntentSchema,
  CeasefireResponseIntentSchema,
  SanctionIntentSchema,
  CedeLandIntentSchema,
  TreatyCreateIntentSchema,
  TreatyInviteIntentSchema,
  TreatyResponseIntentSchema,
  TreatyLeaveIntentSchema,
  RequestAssistanceIntentSchema,
  AssistanceResponseIntentSchema,
  PuppetCommandIntentSchema,
  PuppetLiberateIntentSchema,
  SetBorderPolicyIntentSchema,
  MoveAircraftIntentSchema,
  RenameCapitalIntentSchema,
  WithdrawBankIntentSchema,
  LoadCorvetteIntentSchema,
  LaunchCorvetteIntentSchema,
  UciIntentSchema,
  RecallAircraftIntentSchema,
]);

// StampedIntent = Intent with server-stamped clientID (used in turns and execution)
export const StampedIntentSchema = zb.stamped(IntentSchema, {
  clientID: MappedID,
});
export type StampedIntent = Intent & { clientID: ClientID };

// Placeholder clientID stamped onto admin-bot intents (HTTP admin API). The bot
// is not a player, but toggle_pause — the one bot intent that reaches the turn
// queue — needs a valid clientID. Chosen so it can never collide with a real id:
// generateID() omits 0/l/I/O, and this contains I and O.
export const ADMIN_BOT_CLIENT_ID: ClientID = "ADMINBOT";

//
// Server utility types
//

export const TurnSchema = z.object({
  turnNumber: zb.uint(),
  intents: StampedIntentSchema.array(),
  // The hash of the game state at the end of the turn.
  hash: zb.float().nullable().optional(),
});

export const PlayerSchema = z.object({
  clientID: ID,
  username: UsernameSchema,
  clanTag: ClanTagSchema,
  isLobbyCreator: z.boolean().optional(),
  friends: z.array(ID).optional(),
  // Server-stamped team slot for matchmade team games (index into the
  // game's team list). Feeds deterministic team assignment, so it must be
  // identical for every client (like clanTag/friends).
  teamIndex: zb.uint().optional(),
});

// A purchased bot tribe name in use this game (active names are globally
// unique, so the name alone identifies the tribe). Loose to mirror infra's
// analytics-ingest schema — a field the API adds later flows through to the
// record without a game-side change, instead of being silently stripped.
export const TribeSchema = z
  .object({
    name: SafeString.min(1).max(64),
  })
  .loose();
export type Tribe = z.infer<typeof TribeSchema>;

export const GameStartInfoSchema = z.object({
  gameID: ID,
  lobbyCreatedAt: zb.uint(),
  visibleAt: zb.uint().optional(),
  listed: z.boolean().optional(),
  config: GameConfigSchema,
  players: PlayerSchema.array(),
  // Purchased bot tribe names in use this game (public games only). Rides
  // the analytics record to infra at game end for owner appearance stats.
  // zb.json: TribeSchema is `.loose()`, and a positional binary layout would
  // silently drop the passthrough keys that looseness exists to preserve.
  tribes: z.array(zb.json(TribeSchema)).max(100).optional(),
});

export const WinnerSchema = z
  .union([
    z.tuple([z.literal("player"), ID]).rest(ID),
    z.tuple([z.literal("team"), SafeString]).rest(ID),
    z.tuple([z.literal("nation"), SafeString]).rest(ID),
  ])
  .optional();
export type Winner = z.infer<typeof WinnerSchema>;
