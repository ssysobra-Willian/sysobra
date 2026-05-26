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
        brand: {
          orange: '#F5A623',
          'orange-dark': '#d4891a',
          dark: '#1a1a1a',
          'dark-hover': '#2a2a2a',
          sidebar: '#111111',
        },
        primary: {
          50: '#fef9ee',
          100: '#fef0d3',
          200: '#fddda7',
          300: '#fcc571',
          400: '#faa238',
          500: '#F5A623',
          600: '#d4891a',
          700: '#c15009',
          800: '#9a3f10',
          900: '#7c3410',
          950: '#431806',
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
