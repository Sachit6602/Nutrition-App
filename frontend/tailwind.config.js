/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        ink: token('ink'),
        'ink-2': token('ink-2'),
        line: token('line'),
        accent: token('accent'),
        'accent-ink': token('accent-ink'),
        'accent-soft': token('accent-soft'),
        'on-tint': token('on-tint'),
        protein: token('protein'),
        carbs: token('carbs'),
        fat: token('fat'),
        danger: token('danger'),
      },
      fontFamily: {
        sans: ['"Outfit Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        // Shape rule: containers 24px, inputs 12px, every button/chip full pill.
        card: '1.5rem',
      },
    },
  },
  plugins: [],
}
