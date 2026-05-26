/**
 * Design tokens do SYSOBRA
 * Fonte única da verdade para cores, tipografia e espaçamentos.
 * Use estes valores em código JS/TS; nas classes Tailwind use os aliases
 * configurados em tailwind.config.ts (brand.*, primary.*).
 */

// ─── Cores ────────────────────────────────────────────────────────────────────

export const colors = {
  /** Laranja principal da marca */
  brand: {
    orange:     '#F5A623',
    orangeDark: '#d4891a',
    /** Fundo escuro da sidebar e header */
    dark:       '#1a1a1a',
    darkHover:  '#2a2a2a',
    sidebar:    '#111111',
  },

  /** Escala completa do laranja (primary) */
  primary: {
    50:  '#fef9ee',
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

  /** Cores semânticas */
  semantic: {
    success:     '#16a34a', // green-600
    successBg:   '#dcfce7', // green-100
    warning:     '#d97706', // amber-600
    warningBg:   '#fef3c7', // amber-100
    danger:      '#dc2626', // red-600
    dangerBg:    '#fee2e2', // red-100
    info:        '#2563eb', // blue-600
    infoBg:      '#dbeafe', // blue-100
  },

  /** Neutros */
  neutral: {
    0:   '#ffffff',
    50:  '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
    950: '#030712',
  },
} as const

// ─── Tipografia ───────────────────────────────────────────────────────────────

export const typography = {
  fontFamily: {
    sans: ['Inter', 'system-ui', 'sans-serif'],
    mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
  },
  fontSize: {
    xs:  '0.75rem',   // 12px
    sm:  '0.875rem',  // 14px
    base:'1rem',      // 16px
    lg:  '1.125rem',  // 18px
    xl:  '1.25rem',   // 20px
    '2xl': '1.5rem',  // 24px
    '3xl': '1.875rem',// 30px
  },
  fontWeight: {
    normal:    400,
    medium:    500,
    semibold:  600,
    bold:      700,
    extrabold: 800,
  },
  lineHeight: {
    tight:  1.25,
    snug:   1.375,
    normal: 1.5,
    relaxed:1.625,
  },
} as const

// ─── Espaçamento ──────────────────────────────────────────────────────────────

export const spacing = {
  0:  '0',
  1:  '0.25rem',
  2:  '0.5rem',
  3:  '0.75rem',
  4:  '1rem',
  5:  '1.25rem',
  6:  '1.5rem',
  8:  '2rem',
  10: '2.5rem',
  12: '3rem',
  16: '4rem',
  20: '5rem',
  24: '6rem',
} as const

// ─── Border radius ────────────────────────────────────────────────────────────

export const radius = {
  sm:   '0.375rem', // 6px
  md:   '0.5rem',   // 8px
  lg:   '0.75rem',  // 12px
  xl:   '1rem',     // 16px
  '2xl':'1.5rem',   // 24px
  full: '9999px',
} as const

// ─── Shadows ──────────────────────────────────────────────────────────────────

export const shadows = {
  sm:  '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md:  '0 4px 6px -1px rgb(0 0 0 / 0.1)',
  lg:  '0 10px 15px -3px rgb(0 0 0 / 0.1)',
  xl:  '0 20px 25px -5px rgb(0 0 0 / 0.1)',
  card:'0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
} as const

// ─── Breakpoints (mirrors Tailwind defaults) ──────────────────────────────────

export const breakpoints = {
  sm:  '640px',
  md:  '768px',
  lg:  '1024px',
  xl:  '1280px',
  '2xl':'1536px',
} as const

// ─── Z-index ──────────────────────────────────────────────────────────────────

export const zIndex = {
  behind:   -1,
  base:     0,
  dropdown: 10,
  sticky:   20,
  modal:    50,
  toast:    60,
  tooltip:  70,
} as const

// ─── Animações ────────────────────────────────────────────────────────────────

export const transitions = {
  fast:   '100ms ease',
  normal: '200ms ease',
  slow:   '300ms ease',
} as const
