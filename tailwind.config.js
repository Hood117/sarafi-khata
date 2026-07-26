/**
 * Brand color extensions for Saraf (dark pine green).
 *
 * Runtime theme tokens live in `src/app/globals.css` (Tailwind v4 CSS-first).
 * This file documents and mirrors the palette for tooling / reference.
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#235347",
          dark: "#183A31",
          light: "#3A7A6A",
          foreground: "#FFFFFF",
        },
        accent: {
          DEFAULT: "#C9A84C",
          foreground: "#183A31",
        },
        background: "#F5F2EA",
        foreground: "#183A31",
        sidebar: {
          DEFAULT: "#183A31",
          foreground: "#FFFFFF",
          primary: "#C9A84C",
          "primary-foreground": "#183A31",
          accent: "#235347",
          "accent-foreground": "#FFFFFF",
        },
      },
    },
  },
};
