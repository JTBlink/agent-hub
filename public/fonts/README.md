# Bundled terminal fonts

These unmodified fonts ship with the application for offline terminal rendering.
No system font installation or runtime network request is required.

- JetBrains Mono 2.304: regular, bold, italic and bold italic WOFF2 files from
  https://github.com/JetBrains/JetBrainsMono/tree/v2.304/fonts/webfonts
  (SIL Open Font License, see `OFL-JetBrainsMono.txt`).
- Nerd Fonts 3.4.0 Symbols Only Mono: `SymbolsNerdFontMono-Regular.ttf` from
  https://github.com/ryanoasis/nerd-fonts/tree/v3.4.0/patched-fonts/NerdFontsSymbolsOnly
  (MIT, see `LICENSE-NerdFontsSymbols`).

The text font preserves a monospaced terminal grid. Symbols Only supplies Git,
file, folder, Powerline and other private-use icons without replacing CJK text.

The CSS family `AgentHub Mono` is composite: its private-use Unicode ranges
select Symbols Only directly, including bold and italic ANSI text. Terminal
startup explicitly loads text and icon samples before measuring or rendering
cells, so icon rendering does not depend on system font fallback.
