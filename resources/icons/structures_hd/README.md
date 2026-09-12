# High-detail structure art (superfork)

Full-colour 64×64 sprites, one per structure. **Not yet rendered in game** —
`StructurePass` samples alpha only and tints a single-colour glyph, so these
need the sprite render path before they appear.

## Contents

- **Generated set** (sam_launcher, capital, bank, embassy, airstrip, airfield,
  international_airport, capital_metropolis) — authored at high resolution,
  reduced to 64px.
- **Vanilla set** (city, port, factory, defense_post, missile_silo) — the
  original 32×32 art from `resources/images/buildings/`, doubled to 64 with
  EPX/Scale2x. EPX rounds diagonals instead of blocking them and only ever
  picks among existing neighbours, so it introduces no new colours.

Everything shares the 64px cell. **Physical size on the map is a render-time
decision** — scale down when drawing rather than reducing the stored art,
which is what destroyed legibility in earlier attempts.

## capital_metropolis

Second-tier capital sprite. Intended to replace `capital` once the capital has
a Port stacked on it and has reached a high level (~10). The engine already
exposes both facts — `stackedStructures()` in `CapitalExecution.ts` and
`unit.level()` — so this is a render-time swap, no new state needed. The
missile silo's `silo1` / `silo1-reloading` pair is the existing precedent for
state-dependent structure sprites.
