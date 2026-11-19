/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'), panel: v('panel'), panel2: v('panel2'), hover: v('hover'), line: v('line'), line2: v('line'),
        fg: v('fg'), fg2: v('fg2'), muted: v('muted'), faint: v('faint'), stage: v('stage'), track: v('track'),
        accent: { DEFAULT: v('accent'), 400: v('accent-hi'), 300: v('accent-text'), 600: v('accent-lo') },
        onaccent: v('on-accent'),
      },
      fontFamily: { sans: ['"Segoe UI Variable Text"', '"Segoe UI"', 'Inter', 'system-ui', 'sans-serif'], display: ['Montserrat', 'sans-serif'] },
      boxShadow: { glow: '0 0 0 1px rgb(var(--accent) / .9)', pop: '0 12px 40px -12px rgb(0 0 0 / .45)' },
    },
  },
  plugins: [],
};
