# High-detail structure art (superfork)

Full-colour 64×64 sprites, one per structure. Packed into
`resources/atlases/structure-sprite-atlas.png` by
`scripts/generate-sprite-atlases.mjs` and drawn by `StructureSpritePass` once
the camera is zoomed in (the old StructureLayer look: a sprite on a
player-coloured diamond footprint). Zoomed out, the polygon icons in
`resources/icons/structures/` are used instead. Players can turn the sprites
off under Graphics settings → "Building sprites".

## Contents

- **Generated set** (capital, bank, embassy, airstrip, airfield,
  international_airport, capital_metropolis) — authored at high resolution,
  reduced to 64px.
- **Vanilla set** (city, port, factory, defense_post, sam_launcher,
  missile_silo) — the original 32×32 art from `resources/images/buildings/`
  that the pre-WebGL StructureLayer drew (cityAlt1, port1, factoryAlt1,
  fortAlt3, silo4, silo1), doubled to 64 with EPX/Scale2x. EPX rounds diagonals instead of blocking them and only ever
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

## Alternates

`defense_post_alt.png` (fortAlt2) and `sam_launcher_alt.png` (generated) were
the defense post and SAM in this folder before the sprites went live. The live
ones were switched back to the art the old renderer actually showed; the
alternates are kept in case we want them later.
