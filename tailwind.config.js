/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/templates/**/*.{html,js}"
  ],
  theme: {
    extend: {
      animation: {
        'aurora': 'aurora-flow 20s ease-in-out infinite',
        'float': 'float 20s ease-in-out infinite',
        'scroll': 'scroll 80s linear infinite',
        'glow': 'glow 3s ease-in-out infinite',
        'slideIn': 'slideIn 0.3s ease',
      },
      keyframes: {
        'aurora-flow': {
          '0%, 100%': { transform: 'translate(-25%, -25%) rotate(0deg)' },
          '33%': { transform: 'translate(-30%, -20%) rotate(5deg)' },
          '66%': { transform: 'translate(-20%, -30%) rotate(-5deg)' },
        },
        'float': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '25%': { transform: 'translate(60px, -40px) scale(1.1)' },
          '50%': { transform: 'translate(-50px, 50px) scale(0.9)' },
          '75%': { transform: 'translate(70px, 40px) scale(1.05)' },
        },
        'scroll': {
          'from': { transform: 'translateX(-50%)' },
          'to': { transform: 'translateX(0%)' },
        },
        'glow': {
          '0%, 100%': { filter: 'drop-shadow(0 0 20px rgba(100, 150, 255, 0.5))' },
          '50%': { filter: 'drop-shadow(0 0 30px rgba(100, 150, 255, 0.8))' },
        },
        'slideIn': {
          'from': { opacity: '0', transform: 'translateY(-10px)' },
          'to': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
