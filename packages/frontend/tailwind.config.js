/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // EquinoxFi deep-space palette (GENERAL.md Section 0/8).
      colors: {
        midnight: '#0a0e27',
        'midnight-light': '#11162e',
        indigo: '#4f46e5',
        'indigo-bright': '#6366f1',
        aurora: '#2dd4bf',
        'aurora-dim': '#14b8a6',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        'pulse-slow': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.8' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        spin: {
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        'pulse-slow': 'pulse-slow 4s ease-in-out infinite',
        'fade-in': 'fade-in 0.4s ease-out',
        spin: 'spin 1s linear infinite',
      },
    },
  },
  plugins: [],
};
