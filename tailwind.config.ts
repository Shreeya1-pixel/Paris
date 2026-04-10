import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-cormorant)", "Georgia", "serif"],
        sans:    ["var(--font-geist)", "system-ui", "sans-serif"],
      },
      colors: {
        "bg-base":           "var(--bg-base)",
        "bg-surface":        "var(--bg-surface)",
        "bg-glass":          "var(--bg-glass)",
        "accent-gold":       "var(--accent-gold)",
        "accent-gold-light": "var(--accent-gold-light)",
        "accent-cream":      "var(--accent-cream)",
        "accent-red":        "var(--accent-red)",
        "text-primary":      "var(--text-primary)",
        "text-secondary":    "var(--text-secondary)",
        "text-muted":        "var(--text-muted)",
        /* legacy */
        "bg-primary":  "var(--bg-base)",
        "bg-card":     "var(--bg-surface)",
        "bg-elevated": "#1c1c26",
        accent:        "var(--accent-gold)",
        "accent-amber":"var(--accent-gold-light)",
      },
      borderRadius: {
        card: "18px",
        pill: "100px",
        sm:   "10px",
      },
      boxShadow: {
        card:  "var(--shadow-card)",
        glass: "var(--shadow-glass)",
        glow:  "0 0 24px rgba(201,168,76,0.35)",
      },
      backdropBlur: {
        glass: "18px",
      },
    },
  },
  plugins: [],
};
export default config;
