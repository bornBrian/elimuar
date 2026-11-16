import type { Config } from "tailwindcss";

/** ElimuAR design tokens. */

const COLORS = {
  /** Official navy — sidebar, primary actions, links, active states. */
  navy: {
    50: "#F4F7FC",
    100: "#E6EEF8",
    200: "#C7D8EC",
    300: "#9BB8DA",
    400: "#4A80C0",
    500: "#2A64A8",
    600: "#1E4D8C",
    700: "#163A70",
    800: "#102A56",
    900: "#0A1F44",
  },
  primary: {
    50: "#F4F7FC",
    100: "#E6EEF8",
    200: "#C7D8EC",
    300: "#9BB8DA",
    400: "#4A80C0",
    500: "#2A64A8",
    600: "#1E4D8C",
    700: "#163A70",
    800: "#102A56",
    900: "#0A1F44",
  },
  /** Cyan — data series and live indicators only. */
  accent: {
    50: "#ECFEFF",
    100: "#CFFAFE",
    200: "#A5F3FC",
    300: "#67E8F9",
    400: "#22D3EE",
    500: "#06B6D4",
    600: "#0E7490",
    700: "#155E75",
  },
  success: { 50: "#E8F5E9", 100: "#D6EFD9", 200: "#B6E2BC", 500: "#1B7F4B", 600: "#166B3F", 700: "#0F5132" },
  warning: { 50: "#FFF4E5", 100: "#FDE8CE", 200: "#F8D5A8", 400: "#D97706", 500: "#B45309", 600: "#96450A", 700: "#92400E" },
  danger: { 50: "#FDE8E8", 100: "#FBD5D5", 200: "#F5B5B5", 500: "#B91C1C", 600: "#991B1B", 700: "#7F1D1D" },
  slate: {
    50: "#F8FAFC",
    100: "#F1F5F9",
    200: "#E2E8F0",
    300: "#CBD5E1",
    400: "#94A3B8",
    500: "#64748B",
    600: "#475569",
    700: "#334155",
    800: "#1E293B",
    900: "#0F172A",
  },
  surface: {
    DEFAULT: "#FFFFFF",
    /** Page canvas only — cards and tables stay pure white. */
    sunken: "#F5F7FA",
    rail: "#163A70",
  },
  /** The console blue. */
  brand: {
    50: "#F0F6FF",
    100: "#E4EEFE",
    200: "#C6DCFD",
    300: "#9DC2FA",
    400: "#5C97F6",
    500: "#2F7BF6",
    600: "#2563EB",
    700: "#1D4FD8",
    800: "#1B3FB0",
    900: "#17357F",
  },
  /** Near-black navy: the console's headings, two shades darker than body copy. */
  ink: {
    500: "#5A7593",
    600: "#3C5A7A",
    700: "#20405F",
    800: "#123049",
    900: "#0A2138",
  },
  /** The console's page canvas — a cool blue-white, lighter than the portal's. */
  shell: {
    canvas: "#F3F7FD",
    rail: "#FBFDFF",
  },
  line: "#E6EAF2",
  /** Categorical ramp for charts. Navy-led, cyan for the second series. */
  chart: {
    1: "#163A70",
    2: "#0E7490",
    3: "#4A80C0",
    4: "#B45309",
    5: "#1B7F4B",
    6: "#6D28D9",
    7: "#64748B",
    8: "#0F766E",
  },
};

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: COLORS,
      borderRadius: { card: "12px", control: "6px", panel: "14px", pill: "999px" },
      fontFamily: {
        sans: ["Inter", "Public Sans", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      /** The type scale. */
      /* Fewer sizes, further apart. */
      fontSize: {
        /** The sign-in headline — the one place type is allowed to be big. */
        display: ["54px", { lineHeight: "60px", letterSpacing: "-0.035em" }],
        /** Console page titles: "Platform Overview", "Schools", "AR Content". */
        head: ["27px", { lineHeight: "34px", letterSpacing: "-0.025em" }],
        micro: ["11px", { lineHeight: "14px", letterSpacing: "0.07em" }],
        xs: ["13px", { lineHeight: "18px" }],
        sm: ["14px", { lineHeight: "20px" }],
        base: ["15px", { lineHeight: "23px" }],
        title: ["17px", { lineHeight: "24px", letterSpacing: "-0.01em" }],
        lg: ["18px", { lineHeight: "26px", letterSpacing: "-0.01em" }],
        xl: ["22px", { lineHeight: "28px", letterSpacing: "-0.015em" }],
        page: ["26px", { lineHeight: "32px", letterSpacing: "-0.02em" }],
        "2xl": ["30px", { lineHeight: "36px", letterSpacing: "-0.02em" }],
        "3xl": ["36px", { lineHeight: "42px", letterSpacing: "-0.02em" }],
      },
      spacing: { 4.5: "18px", 13: "52px", 15: "60px" },
      boxShadow: {
        card: "0 1px 2px 0 rgb(16 42 86 / 0.04)",
        pop: "0 12px 28px -18px rgb(10 31 68 / 0.35), 0 0 0 1px rgb(10 31 68 / 0.05)",
      },
      zIndex: { drawer: "45", modal: "50", toast: "60" },
    },
  },
  plugins: [],
};

export default config;
