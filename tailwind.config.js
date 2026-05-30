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
      fontFamily: { sans: ['Inter', 'sans-serif'] },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
