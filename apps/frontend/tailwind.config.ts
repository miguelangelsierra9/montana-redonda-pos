import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Paleta Montaña Redonda Paradise (Michés, RD)
        mountain: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d', // Verde Natural Principal
          800: '#166534', // Verde Bosque Montaña
          900: '#14532d',
          950: '#052e16',
        },
        ocean: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          700: '#1d4ed8',
          800: '#1e40af', // Azul Profundo Laguna/Mar
          900: '#1e3a8a',
          950: '#172554',
        },
        earth: {
          50: '#faf8f5', // Arena Blanca / Tierra Clara
          100: '#f3ede2',
          200: '#e5d8c3',
          600: '#8c6d46',
          700: '#6e5232',
          800: '#574027',
        },
        gold: {
          400: '#facc15',
          500: '#eab308', // Detalles Dorados Sol
          600: '#ca8a04',
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;

