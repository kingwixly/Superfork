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

## Level sprites

Any structure can show different art as it levels up. Put 64×64 PNGs in
`levels/` named `<structure>_<tier>.png`, tier 2 to 4. For example
`levels/city_2.png` or `levels/port_3.png`. The file stem is the same as the
base sprite's (`city`, `defense_post`, `international_airport`, …).

- **Which level is which tier:** `structure.sprites.levelTiers` in
  `src/client/render/gl/render-settings.json`. `"default": [3, 6, 10]` means
  levels 1–2 use the base sprite, 3–5 tier 2, 6–9 tier 3 and 10+ tier 4.
  Add an entry keyed by structure type (`"City": [2, 4, 8]`) to give one
  building its own thresholds.
- **Missing tiers** reuse the tier below, so you can add art one building and
  one tier at a time.
- After adding or changing art, run `node scripts/generate-sprite-atlases.mjs`
  to rebuild `resources/atlases/structure-sprite-atlas.png`, then commit both.

Currently shipped: `levels/capital_4.png`, the metropolis capital (was
`capital_metropolis.png`), at level 10+.

## Alternates

`defense_post_alt.png` (fortAlt2) and `sam_launcher_alt.png` (generated) were
the defense post and SAM in this folder before the sprites went live. The live
ones were switched back to the art the old renderer actually showed; the
alternates are kept in case we want them later.
