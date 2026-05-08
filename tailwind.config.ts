import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1f2933",
        paper: "#f8fafc",
        moss: "#3f7d58",
        coral: "#c75f4b",
        amber: "#b7791f"
      }
    }
  },
  plugins: []
};

export default config;
