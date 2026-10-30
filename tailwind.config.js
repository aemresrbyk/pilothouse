/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        claude: {
          50: '#fdf8f6',
          100: '#f2e8e5',
          200: '#eaddd7',
          300: '#e0c2b7',
          400: '#d97706',
          500: '#cc6b49', // Anthropic terracotta
          600: '#b85d3b',
          700: '#94482c',
          800: '#7a3c25',
          900: '#643422',
        },
        dark: {
          bg: '#0f1117',
          surface: '#181b23',
          card: '#1e222d',
          border: '#2a2f3d',
          subtle: '#373e50',
          text: '#f3f4f6',
          muted: '#9ca3af'
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace']
      }
    },
  },
  plugins: [],
}

