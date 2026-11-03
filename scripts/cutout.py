"""Remove the background from employee photos for the TV lounge screen.

Usage: python cutout.py <in.jpg> <out.png> [<in.jpg> <out.png> ...]

Writes a transparent PNG per input. Run in a venv with `pip install "rembg[cpu]"`; the model
(u2net_human_seg, ~170 MB) downloads to ~/.u2net on first use. Called by PhotoCutoutService.
"""
import sys

from PIL import Image, ImageFilter
from rembg import new_session, remove


def clean_edges(cut: Image.Image, erode: int = 2, band: int = 3, feather: float = 1.0) -> Image.Image:
    """Removes the light halo of wall colour the model leaves around hair and shoulders.

    The mask is hardened and pulled in by `erode` px, the rim pixels take the darkest colour
    near them (so a pale fringe next to dark hair turns dark), then the edge is feathered.
    """
    cut = cut.convert("RGBA")
    alpha = cut.getchannel("A").point(lambda v: 255 if v > 127 else 0).filter(ImageFilter.MinFilter(erode * 2 + 1))
    inner = alpha.filter(ImageFilter.MinFilter(band * 2 + 1))
    rgb = cut.convert("RGB")
    rgb = Image.composite(rgb, rgb.filter(ImageFilter.MinFilter(3)), inner)
    out = rgb.convert("RGBA")
    out.putalpha(alpha.filter(ImageFilter.GaussianBlur(feather)))
    return out


def main(args: list[str]) -> int:
    if not args or len(args) % 2:
        print("usage: cutout.py <in> <out> [<in> <out> ...]", file=sys.stderr)
        return 2
    session = new_session("u2net_human_seg")
    failed = 0
    for src, dst in zip(args[::2], args[1::2]):
        try:
            clean_edges(remove(Image.open(src), session=session, post_process_mask=True)).save(dst)
        except Exception as e:  # one bad photo must not stop the rest
            print(f"{src}: {e}", file=sys.stderr)
            failed += 1
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
