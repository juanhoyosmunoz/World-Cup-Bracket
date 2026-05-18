/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#FFD600",
          50: "#FFFCE0",
          100: "#FFF7B3",
          200: "#FFEC80",
          300: "#FFE14D",
          400: "#FFD91F",
          500: "#FFD600",
          600: "#D6B400",
          700: "#A88E00",
          800: "#7A6700",
          900: "#4D4100",
        },
        ink: {
          950: "#0B0D10",
          900: "#111418",
          800: "#1A1F25",
          700: "#252B33",
          600: "#3A424C",
          500: "#5A6470",
          400: "#8A95A2",
          300: "#B8C0CB",
          200: "#D9DEE6",
          100: "#EEF1F5",
          50: "#F7F8FB",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        display: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)",
        glow: "0 0 0 4px rgba(255, 214, 0, 0.25)",
      },
      borderRadius: { xl2: "1.25rem" },
    },
  },
  plugins: [],
};
