import type { Config } from "tailwindcss"

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        secondary: "hsl(var(--secondary))",
        "secondary-foreground": "hsl(var(--secondary-foreground))",
        destructive: "hsl(var(--destructive))",
        "destructive-foreground": "hsl(var(--destructive-foreground))",
        ring: "hsl(var(--ring))",
        surface: "hsl(var(--surface))",
        "text-strong": "hsl(var(--text-strong))",
        danger: "hsl(var(--danger))",
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        tide: {
          50: "hsl(var(--tide-50))",
          100: "hsl(var(--tide-100))",
          200: "hsl(var(--tide-200))",
          300: "hsl(var(--tide-300))",
          400: "hsl(var(--tide-400))",
          500: "hsl(var(--tide-500))",
          600: "hsl(var(--tide-600))",
          700: "hsl(var(--tide-700))",
          800: "hsl(var(--tide-800))",
          900: "hsl(var(--tide-900))"
        },
        forest: {
          50: "hsl(var(--forest-50))",
          100: "hsl(var(--forest-100))",
          200: "hsl(var(--forest-200))",
          300: "hsl(var(--forest-300))",
          400: "hsl(var(--forest-400))",
          500: "hsl(var(--forest-500))",
          600: "hsl(var(--forest-600))",
          700: "hsl(var(--forest-700))",
          800: "hsl(var(--forest-800))",
          900: "hsl(var(--forest-900))"
        },
        sun: {
          50: "hsl(var(--sun-50))",
          100: "hsl(var(--sun-100))",
          200: "hsl(var(--sun-200))",
          300: "hsl(var(--sun-300))",
          400: "hsl(var(--sun-400))",
          500: "hsl(var(--sun-500))",
          600: "hsl(var(--sun-600))",
          700: "hsl(var(--sun-700))",
          800: "hsl(var(--sun-800))",
          900: "hsl(var(--sun-900))"
        },
        sand: {
          50: "hsl(var(--sand-50))",
          100: "hsl(var(--sand-100))",
          200: "hsl(var(--sand-200))",
          300: "hsl(var(--sand-300))",
          400: "hsl(var(--sand-400))",
          500: "hsl(var(--sand-500))",
          600: "hsl(var(--sand-600))",
          700: "hsl(var(--sand-700))",
          800: "hsl(var(--sand-800))",
          900: "hsl(var(--sand-900))"
        }
      },
      fontFamily: {
        display: ["Playfair Display", "Times New Roman", "serif"],
        body: ["DM Sans", "Space Grotesk", "Segoe UI", "sans-serif"]
      },
      fontSize: {
        "display-xl": ["4rem", { lineHeight: "1.05", letterSpacing: "-0.03em" }],
        "display-lg": ["3rem", { lineHeight: "1.08", letterSpacing: "-0.025em" }],
        h1: ["2.25rem", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
        h2: ["1.875rem", { lineHeight: "1.15", letterSpacing: "-0.015em" }],
        h3: ["1.5rem", { lineHeight: "1.2", letterSpacing: "-0.01em" }],
        h4: ["1.25rem", { lineHeight: "1.3" }],
        body: ["1rem", { lineHeight: "1.6" }],
        caption: ["0.8125rem", { lineHeight: "1.4", letterSpacing: "0.01em" }]
      },
      boxShadow: {
        "focus-ring": "0 0 0 3px hsl(var(--ring) / 0.35)"
      }
    }
  },
  plugins: []
}

export default config
