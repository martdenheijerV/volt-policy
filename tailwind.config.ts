import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Volt brand-ish purple
        volt: {
          50: "#f5f0fb",
          100: "#e9deF6",
          200: "#d3beef",
          300: "#b894e2",
          400: "#9e6dd3",
          500: "#7d3ec0",
          600: "#6629a9",
          700: "#502089",
          800: "#3c196a",
          900: "#28104a",
        },
      },
      fontFamily: {
        sans: ['var(--font-ubuntu)', 'Ubuntu', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
