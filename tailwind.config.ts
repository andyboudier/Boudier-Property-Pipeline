import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#16202B", // deep charcoal-navy — primary brand ink
          soft: "#33414F",
          muted: "#5B6976",
        },
        bronze: {
          DEFAULT: "#B08D57", // warm metallic accent — "lasting value"
          dark: "#8C6E40",
          soft: "#D9C3A1",
        },
        paper: {
          DEFAULT: "#FFFFFF",
          warm: "#F7F6F3", // warm off-white background
          line: "#E7E4DE", // hairline borders
        },
        status: {
          go: "#2E7D5B", // proceedable
          review: "#C2872B", // review / borderline
          stop: "#B23A48", // not proceedable
          idle: "#8A8F94", // incomplete
        },
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(22,32,43,0.04), 0 8px 24px -12px rgba(22,32,43,0.18)",
      },
      borderRadius: { xl2: "1rem" },
    },
  },
  plugins: [],
};
export default config;
