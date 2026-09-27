import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#0D9488",
        "primary-light": "#14B8A6",
        secondary: "#0F172A",
        app: "#F9FAFB",
        surface: "#FFFFFF",
        skeleton: "#F1F5F9",
        text: {
          primary: "#111827",
          secondary: "#4B5563",
          muted: "#9CA3AF",
        },
        status: {
          success: "#22C55E",
          destructive: "#EF4444",
          warning: "#F59E0B",
          info: "#0EA5E9",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
      },
      borderRadius: {
        card: "12px",
        control: "8px",
        pill: "9999px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)",
        dropdown:
          "0 10px 15px rgba(15, 23, 42, 0.10), 0 4px 6px rgba(15, 23, 42, 0.05)",
        "focus-ring": "0 0 0 3px rgba(13, 148, 136, 0.25)",
      },
      keyframes: {
        // Slide-in panel (integrations drawer, and any future right rail).
        "drawer-in": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "backdrop-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
      animation: {
        // Slight overshoot-free ease-out. Anything bouncier reads as playful,
        // which is wrong for a clinical settings surface.
        "drawer-in": "drawer-in 240ms cubic-bezier(0.16, 1, 0.3, 1)",
        "backdrop-in": "backdrop-in 200ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
