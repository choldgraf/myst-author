// Tailwind setup for page.css: hosts that bundle the preview build their CSS with this config.
const path = require('node:path');
const myst = require('@myst-theme/styles');

const nm = path.resolve(__dirname, '../../node_modules');

module.exports = {
  darkMode: 'class',
  content: [
    path.join(__dirname, 'src/**/*.tsx'),
    `${nm}/myst-to-react/dist/**/*.js`,
    `${nm}/@myst-theme/*/dist/**/*.js`,
  ],
  theme: { extend: myst.themeExtensions },
  plugins: [require('@tailwindcss/typography')],
  safelist: myst.safeList,
};
