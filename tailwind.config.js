import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  content: [
    path.join(__dirname, './index.html'),
    path.join(__dirname, './src/**/*.{js,jsx}'),
  ],
  theme: {
    extend: {
      colors: {
        teal: { DEFAULT: '#0a9370' },
        brand: { orange: '#f97316', teal: '#0a9370' },
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        serif: ['DM Serif Display', 'serif'],
      },
      colors: {
        surface: '#ffffff',
        surface2: '#f4f2ee',
        border: '#e8e4dd',
        border2: '#d4cfc6',
        text1: '#1a1814',
        text2: '#5a564f',
        text3: '#9a958c',
      },
      backgroundColor: {
        base: '#faf9f7',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
