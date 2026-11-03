# Bundled terminal fonts

These unmodified fonts ship with the application for offline terminal rendering.
No system font installation or runtime network request is required.

- JetBrains Mono 2.304: regular, medium, bold and their italic WOFF2 files from
  https://github.com/JetBrains/JetBrainsMono/tree/v2.304/fonts/webfonts
  (SIL Open Font License, see `OFL-JetBrainsMono.txt`).
- Nerd Fonts 3.4.0 Symbols Only Mono: `SymbolsNerdFontMono-Regular.ttf` from
  https://github.com/ryanoasis/nerd-fonts/tree/v3.4.0/patched-fonts/NerdFontsSymbolsOnly
  (MIT, see `LICENSE-NerdFontsSymbols`).

The original text and symbols families remain available to code surfaces through
`src/fonts/fonts.css`. Typography tokens live there; the terminal consumes its
own complete font family through `src/fonts/index.ts`.

## Self-contained terminal faces

`src/fonts/terminal-icons/` owns the terminal family, readiness promise and
checked-in WOFF2 faces. Each face combines the real JetBrains Mono text style
with **all** private-use Nerd Fonts symbols. Icons scale uniformly into one text cell, retain their original aspect ratio,
and center against the text cap-height; text outlines, advance widths, ascent and descent remain unchanged.
The editor keeps the separate original fonts above. The terminal does not rely
on private-use fallback between families. CSS embeds the four faces as data
URLs, including in production builds; no additional font URL is fetched. Regeneration writes a content revision into
each CSS asset URL to invalidate development inline-asset caches.
This trades roughly 4 MiB of bundled faces for self-contained ANSI styles.
The original licenses in this directory also cover the generated derivatives;
the derived family is named `AgentHub Terminal`.

To regenerate after changing either upstream source:

```sh
python3 -m venv /tmp/terminal-font-tools
/tmp/terminal-font-tools/bin/pip install 'fonttools[woff]==4.60.1' 'brotli==1.2.1'
/tmp/terminal-font-tools/bin/python scripts/fonts/build-terminal-fonts.py
/tmp/terminal-font-tools/bin/python scripts/fonts/build-terminal-fonts.py --check
```

Generated files are checked in; app builds need no Python or network access.
The check verifies every source private-use mapping, one-cell icon advances,
original icon aspect ratios, and unchanged text outlines/metrics in every style. Browser regressions verify
non-missing icon pixels, Medium/Italic text and actual terminal cell widths:
`node tests/browser/terminal-rendering.mjs` (CDP proxy) and, on macOS,
`swift tests/browser/terminal-rendering-webkit.swift`. Both require Vite on
`:1420`. The native test also covers fonts arriving after xterm has measured
fallback text. Font readiness is shared by document and retried after failure;
xterm explicitly remeasures through public font options when fonts arrive.
