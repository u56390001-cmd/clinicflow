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
        primary: "#4f806c",
        "primary-light": "#679986",
        secondary: "#29423a",
        app: "#f7f9f7",
        surface: "#FFFFFF",
        skeleton: "#eef5f1",
        /**
         * Patient-record neutrals: the cool slate scale the record renders on.
         * The record is a dense clinical readout, so it sits on slate-50 with
         * slate-200 hairlines and flat (shadowless) white cards — separation
         * comes from the border, not from a drop shadow, which is what keeps a
         * six-column dashboard from turning into a pile of floating tiles.
         * Scoped to the record so the rest of the app keeps its own palette.
         */
        canvas: "#f7f9f7",
        hairline: "#dce5e1",
        "hairline-soft": "#eef5f1",
        chip: "#eef5f1",
        /** Teal tint surfaces — the reference's teal-50. */
        "primary-tint": "#dcebe3",
        "primary-tint-border": "#cfe3d7",
        /**
         * Marketing/landing palette (approved landing page v2). Scoped to the
         * public marketing site only — the SaaS dashboard keeps its teal system.
         */
        marketing: {
          sage: "#527A65",
          forest: "#203D34",
          cta: "#356F59",
          wash: "#F4F7F3",
          border: "#E4EBE5",
          body: "#475569",
        },
        /**
         * MedBook AI product brand palette ("Premium Sage + Forest Green").
         * Reads the `--brand-*` custom properties declared once on `:root` in
         * globals.css, so the sidebar, the app header action and the dashboard
         * overview all draw from one source. Solid fills/text/borders only —
         * the values are CSS variables, so Tailwind's `/opacity` modifier does
         * not apply to them.
         */
        brand: {
          forest: "var(--brand-forest)",
          deep: "var(--brand-deep)",
          sage: "var(--brand-sage)",
          cta: "var(--brand-accent)",
          "cta-hover": "var(--brand-accent-hover)",
          wash: "var(--brand-soft)",
          pale: "var(--brand-pale)",
          canvas: "var(--brand-canvas)",
          line: "var(--brand-line)",
          muted: "var(--brand-muted)",
          faint: "var(--brand-faint)",
          ink: "var(--brand-ink)",
          success: "var(--brand-success)",
          "success-soft": "var(--brand-success-soft)",
          warning: "var(--brand-warning)",
          "warning-soft": "var(--brand-warning-soft)",
          danger: "var(--brand-danger)",
          "danger-soft": "var(--brand-danger-soft)",
          info: "var(--brand-info)",
          "info-soft": "var(--brand-info-soft)",
        },
        text: {
          primary: "#29423a",
          secondary: "#667872",
          muted: "#8a9793",
          /** Value readouts. Deep forest ink, the record's highest contrast. */
          ink: "#29423a",
          "ink-soft": "#667872",
          "ink-faint": "#8a9793",
        },
        status: {
          success: "#249a67",
          destructive: "#d9534f",
          warning: "#d99a32",
          info: "#3b82a0",
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
        /** Marketing body face — the refined landing page reads in Poppins. */
        body: [
          "var(--font-poppins)",
          "Poppins",
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
        "focus-ring": "0 0 0 3px rgba(79, 128, 108, 0.25)",
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
