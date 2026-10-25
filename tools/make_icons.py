"""Generate the app icons (a white dumbbell on blue) without any dependencies.

Run from the project root:  python3 tools/make_icons.py
"""
import os
import struct
import zlib

BG = (0, 122, 255)
FG = (255, 255, 255)

# Dumbbell as rectangles in 0..1 coordinates: (x0, y0, x1, y1)
SHAPES = [
    (0.30, 0.465, 0.70, 0.535),  # bar
    (0.24, 0.30, 0.32, 0.70),    # inner plates
    (0.68, 0.30, 0.76, 0.70),
    (0.17, 0.37, 0.24, 0.63),    # outer plates
    (0.76, 0.37, 0.83, 0.63),
]


def pixel(x, y, n):
    u, v = (x + 0.5) / n, (y + 0.5) / n
    for x0, y0, x1, y1 in SHAPES:
        if x0 <= u <= x1 and y0 <= v <= y1:
            return FG
    return BG


def write_png(path, n):
    rows = b"".join(
        b"\x00" + bytes(c for x in range(n) for c in pixel(x, y, n)) for y in range(n)
    )

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", n, n, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(rows, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


out = os.path.join(os.path.dirname(__file__), "..", "app", "icons")
for name, size in [("apple-touch-icon.png", 180), ("icon-192.png", 192), ("icon-512.png", 512)]:
    write_png(os.path.join(out, name), size)
    print("wrote", name)
