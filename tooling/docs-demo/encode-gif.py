"""Encode actual UI checkpoints without blending text between scenes."""
import json
import sys
from pathlib import Path
from PIL import Image

directory = Path(sys.argv[1])
manifest = json.loads((directory / "frames.json").read_text())
frames = []
for item in manifest:
    with Image.open(directory / item["file"]) as frame:
        frames.append(frame.convert("RGB").quantize(colors=128))
frames[0].save(
    directory / "demo.gif",
    save_all=True,
    append_images=frames[1:],
    duration=[item["duration"] for item in manifest],
    loop=0,
    disposal=2,
    optimize=False,
)
