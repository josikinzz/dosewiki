import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcssAnimate from "tailwindcss-animate";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const themeTokenInterface = JSON.parse(
  fs.readFileSync(path.join(__dirname, "src/theme/theme-token-interface.json"), "utf8"),
);

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        // `font-display` reads the *token*, not the raw next/font variable it is
        // built from. Both expand to the same list today — base.css defines
        // `--font-family-display: var(--font-display), Inter, …` — so this
        // changes nothing about what either flavor renders. What it buys is that
        // the ~40 `font-display` call sites (the wordmark, every page h1) follow
        // the same one variable the Theme Lab's display-face control writes,
        // instead of being the one family on the site a theme cannot reach.
        display: ['var(--font-family-display)'],
      },
      colors: {
        ...themeTokenInterface.tailwindAliases,
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / 0.1)",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border) / 0.1)",
        input: "hsl(var(--input) / 0.1)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // Corner roles; values per visual style live in src/styles/base.css and pro-theme.css.
        control: "var(--radius-control)",
        chip: "var(--radius-chip)",
        card: "var(--radius-card)",
        panel: "var(--radius-panel)",
        pill: "var(--radius-pill)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
