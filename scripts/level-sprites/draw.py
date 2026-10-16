"""
Superfork: draws the level-tier building sprites (tiers 2-4) for City, Port,
Missile Silo and SAM Launcher.

Each tier is a different, more advanced building rather than more copies of
the old one: modern glass city -> high-tech skyline -> neon arcology spire;
jib crane -> container gantry -> tractor-beam gantry; hardened silo ->
launch complex -> energy launch pad; tube battery -> phased-array battery ->
rail turret.

Drawn at 32x32 with a small isometric pixel kit (kit.py), then doubled to
64x64 with EPX exactly like the base sprites, into
resources/icons/structures_hd/levels/<name>_<tier>.png.

    python3 scripts/level-sprites/draw.py [--preview out.png]
    node scripts/generate-sprite-atlases.mjs
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import epx, edge_clear, sheet
import city, port, mil

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
OUT = os.path.join(ROOT, "resources/icons/structures_hd/levels")

TIERS = {
    "city": (city.base, city.t2, city.t3, city.t4),
    "port": (port.base, port.t2, port.t3, port.t4),
    "missile_silo": (mil.silo_base, mil.silo_t2, mil.silo_t3, mil.silo_t4),
    "sam_launcher": (mil.sam_base, mil.sam_t2, mil.sam_t3, mil.sam_t4),
}

rows = []
for name, (base, *fns) in TIERS.items():
    row = [base]
    for tier, fn in zip((2, 3, 4), fns):
        im = fn()
        # Art must not touch the cell edge, or it reads as sliced off in game.
        if not edge_clear(im):
            raise SystemExit(f"{name} tier {tier} touches the sprite edge")
        epx(im).save(os.path.join(OUT, f"{name}_{tier}.png"))
        row.append(im)
    rows.append(row)
print("wrote", 3 * len(TIERS), "level sprites to", OUT)

if "--preview" in sys.argv:
    sheet(rows, sys.argv[sys.argv.index("--preview") + 1])
