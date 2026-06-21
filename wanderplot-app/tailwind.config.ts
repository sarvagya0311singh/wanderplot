import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Earthy, premium travel palette
        brand: {
          DEFAULT: '#1B3B36', // Deep forest/ocean green
          light: '#2C5A53',
          dark: '#0E1E1C',
        },
        terracotta: {
          DEFAULT: '#C86B52', // Earthy clay/sunset
          light: '#D98A76',
          dark: '#A0503B',
        },
        sand: {
          DEFAULT: '#F4EFEA', // Light sand/canvas
          dark: '#E6DCCF',
        },
        ocean: {
          DEFAULT: '#3A6073', // Deep ocean blue
          light: '#5B869C',
        },
        sage: '#8BA88E',
        cream: {
          DEFAULT: '#FDFBF7',
          dark: '#F5F0E6',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        display: ['var(--font-playfair)', 'Playfair Display', 'Georgia', 'serif'],
      },
      backgroundImage: {
        'hero-gradient': 'linear-gradient(135deg, #1B3B36 0%, #3A6073 100%)',
        'card-gradient': 'linear-gradient(180deg, transparent 0%, rgba(27, 59, 54, 0.9) 100%)',
      },
      animation: {
        'float': 'float 8s ease-in-out infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up': 'slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in': 'fadeIn 0.8s ease-out',
        'shimmer': 'shimmer 2.5s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-15px)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(30px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      boxShadow: {
        'soft': '0 10px 40px -10px rgba(0,0,0,0.08)',
        'float': '0 20px 40px -10px rgba(0,0,0,0.12)',
        'glow-terracotta': '0 0 40px rgba(200, 107, 82, 0.3)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      backdropBlur: {
        md: '12px',
        lg: '16px',
        xl: '24px',
      },
    },
  },
  plugins: [],
};

export default config;
