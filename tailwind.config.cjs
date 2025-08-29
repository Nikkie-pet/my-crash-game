/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // ← důležité pro ruční přepínání
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};