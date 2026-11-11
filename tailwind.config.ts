import type { Config } from "tailwindcss";

// class-based dark mode: toggled by adding/removing `.dark` on <html> - see
// the inline script in app/layout.tsx and ThemeContext.tsx, both of which
// already work this way.
//
// Colors below are a fully achromatic (zero-chroma) neutral palette, ported
// from shadcn/ui's "neutral" base theme (the same one used by the
// reference site this was matched to) - hierarchy comes from grayscale
// value alone, not hue, which is why there's no "accent"/brand color in
// this list. Each token is a CSS custom property (set in globals.css, one
// value for :root and one under .dark) so both themes can share this same
// Tailwind config rather than needing dark: variants sprinkled everywhere.
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      borderRadius: {
        // matches the reference site's --radius: 0.625rem (10px) - close
        // to Tailwind's default `rounded-lg` (8px) but not identical, so
        // it's expressed here explicitly rather than left approximate.
        DEFAULT: "0.625rem",
        sm: "calc(0.625rem - 4px)",
        md: "calc(0.625rem - 2px)",
        lg: "0.625rem",
        xl: "calc(0.625rem + 4px)",
      },
      colors: {
        // Each CSS variable below holds a *complete* color function (not
        // bare L/C/H components), because the dark-mode border/input
        // tokens carry their own baked-in alpha (`oklch(1 0 0 / 10%)`) -
        // mixing that with Tailwind's `<alpha-value>` wrapping would
        // produce an invalid doubled alpha slash. Referencing the
        // variable directly avoids that; the tradeoff is these tokens
        // don't support Tailwind's `bg-primary/50`-style opacity
        // modifiers, which nothing in this app currently relies on.
        background: "oklch(var(--background))",
        foreground: "oklch(var(--foreground))",
        card: "oklch(var(--card))",
        "card-foreground": "oklch(var(--card-foreground))",
        primary: "oklch(var(--primary))",
        "primary-foreground": "oklch(var(--primary-foreground))",
        secondary: "oklch(var(--secondary))",
        "secondary-foreground": "oklch(var(--secondary-foreground))",
        muted: "oklch(var(--muted))",
        "muted-foreground": "oklch(var(--muted-foreground))",
        accent: "oklch(var(--accent))",
        "accent-foreground": "oklch(var(--accent-foreground))",
        destructive: "oklch(var(--destructive))",
        border: "oklch(var(--border))",
        input: "oklch(var(--input))",
        ring: "oklch(var(--ring))",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
