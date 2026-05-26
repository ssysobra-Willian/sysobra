import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fef9ee',
          100: '#fef0d3',
          200: '#fddda7',
          300: '#fcc571',
          400: '#faa238',
          500: '#f88412',
          600: '#e96a08',
          700: '#c15009',
          800: '#9a3f10',
          900: '#7c3410',
          950: '#431806',
        },
        brand: {
          orange: '#f88412',
          dark: '#1a1a1a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.5rem',
      },
    },
  },
  plugins: [],
}

export default config
