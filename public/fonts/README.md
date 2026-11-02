# Bundled terminal fonts

These unmodified fonts ship with the application for offline terminal rendering.
No system font installation or runtime network request is required.

- JetBrains Mono 2.304: regular, medium, bold and their italic WOFF2 files from
  https://github.com/JetBrains/JetBrainsMono/tree/v2.304/fonts/webfonts
  (SIL Open Font License, see `OFL-JetBrainsMono.txt`).
- Nerd Fonts 3.4.0 Symbols Only Mono: `SymbolsNerdFontMono-Regular.ttf` from
  https://github.com/ryanoasis/nerd-fonts/tree/v3.4.0/patched-fonts/NerdFontsSymbolsOnly
  (MIT, see `LICENSE-NerdFontsSymbols`).

The text font preserves a monospaced terminal grid. Symbols Only supplies Git,
file, folder, Powerline and other private-use icons without replacing CJK text.

The CSS stack explicitly names `AgentHub Mono` followed by `AgentHub Symbols`.
The symbol family is restricted to private-use Unicode ranges, including bold
and italic ANSI text, while JetBrains Mono excludes those ranges and supplies
text metrics. Keeping the families separate avoids depending on same-family
font-face fallback for terminal icons.
Terminal startup loads both families before measuring or rendering cells,
including the search, source-control, review and settings sidebar glyphs.

The terminal uses the real Medium (500) and Medium Italic faces at 15px, with
Bold (700) for ANSI emphasis. The code editor retains its regular 14px default.
All terminal text styles are loaded before measuring the grid.
