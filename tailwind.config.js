/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      boxShadow: {
        soft: "0 10px 30px -12px rgba(2,6,23,0.15)" // jemný skandi stín
      },
      borderRadius: {
        xl2: "1.25rem"
      }
    }
  },
  plugins: []
};