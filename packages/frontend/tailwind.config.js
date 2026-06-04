/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // EquinoxFi deep-space palette (GENERAL.md Section 0/8).
      colors: {
        midnight: '#0a0e27',
        indigo: '#4f46e5',
        aurora: '#2dd4bf',
      },
    },
  },
  plugins: [],
};
