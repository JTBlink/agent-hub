"""Regenerate checked-in terminal faces; no Python dependency at app build/runtime.

Run in a venv with fonttools[woff]==4.60.1 and brotli==1.2.1:
    python scripts/fonts/build-terminal-fonts.py
Sources and licenses: public/fonts/README.md.
"""
import argparse
import hashlib
import re
from pathlib import Path

from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent.parent
SOURCE = ROOT / "public/fonts"
OUTPUT = ROOT / "src/fonts/terminal-icons/assets"
STYLES = ("Medium", "Bold", "MediumItalic", "BoldItalic")


def private_use(codepoint):
    return (0xE000 <= codepoint <= 0xF8FF or
            0xF0000 <= codepoint <= 0xFFFFD or
            0x100000 <= codepoint <= 0x10FFFD)


def build(style):
    text = TTFont(SOURCE / f"JetBrainsMono-{style}.woff2", recalcTimestamp=False)
    symbols = TTFont(SOURCE / "SymbolsNerdFontMono-Regular.ttf")
    symbol_glyphs = symbols.getGlyphSet()
    source_cmap = symbols.getBestCmap()
    cmap = {cp: f"terminalIcon{cp:X}" for cp in source_cmap if private_use(cp)}
    cell_width = text["hmtx"][text.getBestCmap()[ord("M")]][0]
    cap_height = text["OS/2"].sCapHeight
    original_order = list(text.getGlyphOrder())
    for cp, name in cmap.items():
        source_name = source_cmap[cp]
        source_glyph = symbols["glyf"][source_name]
        x_min, x_max = getattr(source_glyph, "xMin", 0), getattr(source_glyph, "xMax", 0)
        y_min, y_max = getattr(source_glyph, "yMin", 0), getattr(source_glyph, "yMax", 0)
        source_width = x_max - x_min
        source_height = y_max - y_min
        # Preserve the source outline's aspect ratio. Fit and center its actual
        # ink inside one text cell and the text cap-height, never stretch axes.
        scale = min(cell_width / max(source_width, 1), cap_height / max(source_height, 1))
        offset_x = (cell_width - (x_min + x_max) * scale) / 2
        offset_y = (cap_height - (y_min + y_max) * scale) / 2
        recording = DecomposingRecordingPen(symbol_glyphs)
        symbol_glyphs[source_name].draw(recording)
        pen = TTGlyphPen(None)
        recording.replay(TransformPen(pen, (scale, 0, 0, scale, offset_x, offset_y)))
        glyph = pen.glyph()
        glyph.recalcBounds(text["glyf"])
        text["glyf"][name] = glyph
        text["hmtx"][name] = (cell_width, getattr(glyph, "xMin", 0))
    text.setGlyphOrder(original_order + list(cmap.values()))
    for table in text["cmap"].tables:
        if table.isUnicode():
            table.cmap.update({cp: name for cp, name in cmap.items()
                               if table.format == 12 or cp <= 0xFFFF})
    for name_id, value in {
        1: "AgentHub Terminal", 2: style, 3: f"AgentHubTerminal-{style}",
        4: f"AgentHub Terminal {style}", 6: f"AgentHubTerminal-{style}",
        16: "AgentHub Terminal", 17: style,
    }.items():
        text["name"].setName(value, name_id, 3, 1, 0x409)
    text.flavor = "woff2"
    text.save(OUTPUT / f"AgentHubTerminal-{style}.woff2")


def check(style):
    """Verify all bundled icon mappings and preserve the text's original grid."""
    source = TTFont(SOURCE / f"JetBrainsMono-{style}.woff2")
    symbols = TTFont(SOURCE / "SymbolsNerdFontMono-Regular.ttf")
    output = TTFont(OUTPUT / f"AgentHubTerminal-{style}.woff2")
    cmap = output.getBestCmap()
    width = source["hmtx"][source.getBestCmap()[ord("M")]][0]
    for cp, glyph in source.getBestCmap().items():
        if not private_use(cp):
            assert cmap[cp] == glyph, f"Lost text glyph: {style} U+{cp:X}"
            assert output["hmtx"][glyph] == source["hmtx"][glyph]
            assert output["glyf"][glyph].compile(output["glyf"]) == source["glyf"][glyph].compile(source["glyf"])
    source_icons = symbols.getBestCmap()
    for cp, source_icon in source_icons.items():
        if private_use(cp):
            assert cmap.get(cp) == f"terminalIcon{cp:X}", f"Lost icon: {style} U+{cp:X}"
            assert output["hmtx"][cmap[cp]][0] == width
            original = symbols["glyf"][source_icon]
            icon = output["glyf"][cmap[cp]]
            if original.numberOfContours:
                source_width = original.xMax - original.xMin
                source_height = original.yMax - original.yMin
                icon_width = icon.xMax - icon.xMin
                icon_height = icon.yMax - icon.yMin
                # Account for integer rounding and source control-point bounds.
                assert abs(icon_width * source_height - icon_height * source_width) <= 4 * max(source_width, source_height), f"Distorted icon: {style} U+{cp:X}"
                assert icon_width <= width + 1
                assert icon_height <= output["OS/2"].sCapHeight + 1
    assert output["head"].unitsPerEm == source["head"].unitsPerEm
    assert output["hhea"].ascent == source["hhea"].ascent
    assert output["hhea"].descent == source["hhea"].descent


def version_stylesheet(update=False):
    """Invalidate Vite's inline-asset cache when regenerated font bytes change."""
    digest = hashlib.sha256(b"".join(
        (OUTPUT / f"AgentHubTerminal-{style}.woff2").read_bytes() for style in STYLES
    )).hexdigest()[:16]
    path = OUTPUT.parent / "fonts.css"
    css = path.read_text()
    if update:
        css = re.sub(r"\?inline(?:&revision=[a-f0-9]+)?", f"?inline&revision={digest}", css)
        path.write_text(css)
    assert css.count(f"?inline&revision={digest}") == len(STYLES), "Regenerate terminal stylesheet revision"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Validate checked-in faces without regenerating")
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    if not args.check:
        for style in STYLES:
            build(style)
    for style in STYLES:
        check(style)
    version_stylesheet(update=not args.check)
    print("PASS: all terminal faces preserve text outlines/metrics and every private-use icon")
