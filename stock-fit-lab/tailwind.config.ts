import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        up: '#e5484d',   // 台股慣例：紅漲
        down: '#30a46c', // 綠跌
      },
    },
  },
  plugins: [],
};
export default config;
