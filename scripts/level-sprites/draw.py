"""
Superfork: draws the level-tier building sprites (tiers 2-4) for City, Port,
Missile Silo and SAM Launcher.

Each tier is a different, more advanced building rather than more copies of
the old one: modern glass city -> high-tech skyline -> neon arcology spire;
jib crane -> container gantry -> tractor-beam gantry; open-hatch silo ->
hardened site with radar and comms -> modern site with phased-array radar
and point defence (the original's star pad, a shaft, the lid swung open,
the warhead rising out); tube battery -> phased-array battery ->
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
import city, port, mil, silo, lab

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
OUT = os.path.join(ROOT, "resources/icons/structures_hd/levels")

TIERS = {
    "city": (city.base, city.t2, city.t3, city.t4),
    "port": (port.base, port.t2, port.t3, port.t4),
    "missile_silo": (silo.base, silo.t2, silo.t3, silo.t4),
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

# The Lab is new art throughout: its base sprite, white map icon and build
# menu icon are drawn here too.
import base64, io
HD = os.path.join(ROOT, "resources/icons/structures_hd")
epx(lab.base()).save(os.path.join(HD, "lab.png"))
icon = lab.icon64()
icon.save(os.path.join(ROOT, "resources/icons/structures/lab.png"))
buf = io.BytesIO(); icon.save(buf, "PNG")
with open(os.path.join(ROOT, "resources/images/LabIconWhite.svg"), "w") as f:
    f.write('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">'
            f'<image width="64" height="64" href="data:image/png;base64,{base64.b64encode(buf.getvalue()).decode()}"/></svg>\n')
for tier, fn in zip((2, 3, 4), (lab.t2, lab.t3, lab.t4)):
    im = fn()
    if not edge_clear(im):
        raise SystemExit(f"lab tier {tier} touches the sprite edge")
    epx(im).save(os.path.join(OUT, f"lab_{tier}.png"))
rows.append([lab.base(), lab.t2(), lab.t3(), lab.t4()])
print("wrote lab sprites and icons")

if "--preview" in sys.argv:
    sheet(rows, sys.argv[sys.argv.index("--preview") + 1])
