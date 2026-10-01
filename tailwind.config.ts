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
        /**
         * Patient-record neutrals: the cool slate scale the record renders on.
         * The record is a dense clinical readout, so it sits on slate-50 with
         * slate-200 hairlines and flat (shadowless) white cards — separation
         * comes from the border, not from a drop shadow, which is what keeps a
         * six-column dashboard from turning into a pile of floating tiles.
         * Scoped to the record so the rest of the app keeps its own palette.
         */
        canvas: "#F8FAFC",
        hairline: "#E2E8F0",
        "hairline-soft": "#F1F5F9",
        chip: "#F8FAFC",
        /** Teal tint surfaces — the reference's teal-50. */
        "primary-tint": "#F0FDFA",
        "primary-tint-border": "#99F6E4",
        text: {
          primary: "#0F172A",
          secondary: "#475569",
          muted: "#64748B",
          /** Value readouts. Near-black slate, the record's highest contrast. */
          ink: "#0F172A",
          "ink-soft": "#64748B",
          "ink-faint": "#94A3B8",
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
          "var(--font-jakarta)",
          "Plus Jakarta Sans",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
        /**
         * For identifiers a human reads back over the phone — UHIDs, token
         * numbers, dates. Jakarta has no mono, and the slashed-zero of a
         * proportional zero in `CLI-2026-00018` is exactly the ambiguity this
         * has to avoid, so the stack is deliberate rather than inherited.
         */
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        card: "12px",
        /**
         * Record panels. The record's cards are flat slate-50-bordered white
         * rectangles, so this is the one radius in the system and everything
         * the record draws uses it — a mismatched radius between two adjacent
         * cards is the single most visible way a record stops reading as one
         * surface.
         */
        panel: "12px",
        control: "8px",
        pill: "9999px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)",
        dropdown:
          "0 10px 15px rgba(15, 23, 42, 0.10), 0 4px 6px rgba(15, 23, 42, 0.05)",
        "focus-ring": "0 0 0 3px rgba(13, 148, 136, 0.25)",
        /** The soft green lift under the record's primary action. */
        action: "0 2px 8px rgba(22, 163, 74, 0.30)",
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
