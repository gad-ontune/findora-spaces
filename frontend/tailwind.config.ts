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
        teal: {
          50: "#EDF5F3",
          100: "#D6E8E4",
          200: "#AFD2CB",
          300: "#7FB5AC",
          400: "#4E948A",
          500: "#2C776E",
          600: "#1B6159",
          700: "#124F49",
          800: "#0E403B",
          900: "#0A322E",
          950: "#062421",
        },
        ivory: {
          50: "#FCFAF5",
          100: "#F9F5EC",
          200: "#F2EADB",
          300: "#E8DCC4",
          400: "#DCC9A8",
        },
        sand: {
          100: "#F5EEDF",
          200: "#EADCC1",
          300: "#DCC6A0",
          400: "#C9AA78",
          500: "#B08C57",
        },
        sage: {
          100: "#EDF2EA",
          200: "#DCE6D6",
          300: "#C2D3B8",
          400: "#A9BFA5",
          500: "#8AA584",
          600: "#6C8766",
        },
        terracotta: {
          100: "#F8E9E2",
          200: "#F0D2C5",
          300: "#E2AC96",
          400: "#D18768",
          500: "#C26A4A",
          600: "#A75338",
          700: "#85412C",
        },
        ink: {
          50: "#F4F6F5",
          100: "#E6EAE9",
          200: "#C9D2D0",
          300: "#A2B0AD",
          400: "#71817D",
          500: "#51615D",
          600: "#3B4A47",
          700: "#2A3835",
          800: "#1C2A28",
          900: "#111C1A",
        },
      },
      fontFamily: {
        display: ["var(--font-manrope)", "system-ui", "sans-serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(17,28,26,0.04), 0 8px 24px -12px rgba(17,28,26,0.16)",
        lift: "0 2px 4px rgba(17,28,26,0.06), 0 18px 40px -20px rgba(17,28,26,0.28)",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.45s ease-out both",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
