import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--color-text)",
        paper: "var(--color-bg)",
        moss: "var(--color-accent)",
        surface: "var(--color-surface)",
        "surface-muted": "var(--color-surface-muted)",
        primary: "var(--color-text)",
        muted: "var(--color-text-muted)",
        line: "var(--color-border)",
        accent: "var(--color-accent)",
        "accent-soft": "var(--color-accent-soft)",
        coral: "#c75f4b",
        amber: "#b7791f"
      }
    }
  },
  plugins: []
};

export default config;
