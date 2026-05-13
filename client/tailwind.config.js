/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  important: "#contact-verify-root",
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Outfit",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        soft: "0 18px 50px rgba(15, 23, 42, 0.35)",
        inset: "inset 0 1px 0 rgba(255,255,255,0.06)",
      },
    },
  },
  plugins: [],
};
