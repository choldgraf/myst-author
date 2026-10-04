// Tailwind setup for page.css: hosts that bundle the preview build their CSS with this config.
const path = require('node:path');
const myst = require('@myst-theme/styles');

// The packages whose class names the CSS needs, wherever npm installed them.
const mystToReact = path.dirname(require.resolve('myst-to-react')); // its dist/
const mystTheme = path.resolve(require.resolve('@myst-theme/styles/package.json'), '../..'); // the @myst-theme/ folder

module.exports = {
  darkMode: 'class',
  content: [
    path.join(__dirname, 'src/**/*.tsx'),
    `${mystToReact}/**/*.js`,
    `${mystTheme}/*/dist/**/*.js`,
  ],
  theme: { extend: myst.themeExtensions },
  plugins: [require('@tailwindcss/typography')],
  safelist: myst.safeList,
};
