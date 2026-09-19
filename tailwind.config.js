// tailwind.config.js
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#eef1f6',
          100: '#d7deea',
          400: '#2a4470',
          600: '#132a4d',
          700: '#0f2140',
          800: '#0b1a33',
          900: '#081328',
        },
        gold: {
          300: '#f6d989',
          400: '#f2c14e',
          500: '#e0a92e',
          600: '#b8841c',
        },
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};