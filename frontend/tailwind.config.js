const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        bg2: v("bg2"),
        surface: v("surface"),
        raised: v("raised"),
        hover: v("hover"),
        // borders are translucent in dark mode: alpha is multiplied by the theme's line opacity
        line: "rgb(var(--line) / calc(<alpha-value> * var(--line-a)))",
        "line-strong": "rgb(var(--line) / calc(<alpha-value> * var(--line-a-strong)))",
        fg: v("fg"),
        muted: v("muted"),
        subtle: v("subtle"),
        accent: v("accent"),
        brand: v("brand"),
        navy: v("navy"),
        "on-accent": v("on-accent"),
        cyan: v("cyan"),
        warn: v("warn"),
        ok: v("ok"),
        danger: v("danger"),
      },
      fontFamily: {
        // NASA Horizon-inspired hierarchy: Inter for headings, Public Sans for reading text, DM Mono for identifiers and numbers
        sans: ["Public Sans", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["DM Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: { ctl: "2px", btn: "2px", card: "0px", surface: "2px" },
      boxShadow: { card: "var(--shadow-card)", pop: "var(--shadow-pop)" },
      transitionTimingFunction: { out: "cubic-bezier(0.16, 1, 0.3, 1)" },
      keyframes: {
        fadeUp: { from: { opacity: 0, transform: "translateY(24px)" }, to: { opacity: 1, transform: "translateY(0)" } },
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
    },
  },
  plugins: [],
};
