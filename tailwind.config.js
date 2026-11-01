/** @type {import('tailwindcss').Config} */
// Hue utilities are compatibility aliases for the central theme palette.
// Components can use semantic colors; legacy tags/statuses remain theme-aware.
const paletteHues = {
  red: "red",
  rose: "red",
  green: "green",
  emerald: "green",
  amber: "yellow",
  yellow: "yellow",
  orange: "orange",
  blue: "blue",
  sky: "cyan",
  cyan: "cyan",
  teal: "teal",
  indigo: "violet",
  purple: "violet",
  violet: "violet",
  pink: "pink",
  slate: "neutral",
  gray: "neutral",
  zinc: "neutral",
  neutral: "neutral",
  stone: "neutral",
};
const themeHues = Object.fromEntries(
  Object.entries(paletteHues).map(([name, hue]) => [
    name,
    Object.fromEntries(
      [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((shade) => [
        shade,
        `rgb(var(--palette-${hue}) / <alpha-value>)`,
      ]),
    ),
  ]),
);

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    fontSize: {
      xs: ["var(--font-size-caption)", "var(--line-height-caption)"],
      sm: ["var(--font-size-ui)", "var(--line-height-ui)"],
      base: ["var(--font-size-code)", "var(--line-height-code)"],
      code: ["var(--font-size-code)", "var(--line-height-code)"],
      lg: ["var(--font-size-heading)", "var(--line-height-heading)"],
      xl: ["var(--font-size-title)", "var(--line-height-heading)"],
      "2xl": ["var(--font-size-section)", "var(--line-height-heading)"],
      "3xl": ["var(--font-size-display)", "var(--line-height-heading)"],
      "4xl": ["var(--font-size-metric)", "var(--line-height-heading)"],
      "5xl": ["var(--font-size-hero)", "var(--line-height-heading)"],
      "6xl": ["var(--font-size-jumbo)", "var(--line-height-heading)"],
    },
    extend: {
      colors: {
        ...themeHues,
        white: "rgb(var(--palette-white) / <alpha-value>)",
        black: "rgb(var(--palette-black) / <alpha-value>)",
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        background: "var(--color-bg)",
        "bg-secondary": "var(--color-bg-secondary)",
        surface: "var(--color-surface)",
        "surface-hover": "var(--color-surface-hover)",
        "surface-active": "var(--color-surface-active)",
        border: "var(--color-border)",
        "border-subtle": "var(--color-border-subtle)",
        "border-faint": "var(--color-border-faint)",
        accent: {
          DEFAULT: "var(--color-accent)",
          light: "var(--color-accent-light)",
          dark: "var(--color-accent-dark)",
          bg: "var(--color-accent-bg)",
          border: "var(--color-accent-border)",
        },
        danger: {
          DEFAULT: "var(--color-danger)",
          bg: "var(--color-danger-bg)",
        },
      },
      boxShadow: {
        card: "var(--shadow-card)",
        "card-hover": "var(--shadow-card-hover)",
      },
      textColor: {
        primary: "var(--color-text-primary)",
        secondary: "var(--color-text-secondary)",
        tertiary: "var(--color-text-tertiary)",
        muted: "var(--color-text-muted)",
        faint: "var(--color-text-faint)",
      },
      fontFamily: {
        sans: ["var(--font-family-ui)"],
        mono: ["var(--font-family-code)"],
      },
    },
  },
  plugins: [],
};
