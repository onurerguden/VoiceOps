/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        surface: {
          DEFAULT: "rgba(255,255,255,0.06)",
          hover: "rgba(255,255,255,0.10)",
          border: "rgba(255,255,255,0.10)",
          "border-hover": "rgba(255,255,255,0.18)",
        },
        accent: {
          DEFAULT: "#34d399",
          dim: "#059669",
          glow: "rgba(52,211,153,0.18)",
        },
        danger: {
          DEFAULT: "#fb7185",
          dim: "#e11d48",
          glow: "rgba(251,113,133,0.15)",
        },
      },
      boxShadow: {
        glass: "0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)",
        "glass-hover": "0 12px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)",
        glow: "0 0 40px rgba(52,211,153,0.15)",
        "glow-danger": "0 0 40px rgba(251,113,133,0.15)",
        mic: "0 0 0 0 rgba(52,211,153,0.3)",
        "mic-listening": "0 0 60px rgba(251,113,133,0.35)",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
      },
      animation: {
        "pulse-ring": "pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "wave-1": "wave 1.2s ease-in-out infinite",
        "wave-2": "wave 1.2s ease-in-out 0.15s infinite",
        "wave-3": "wave 1.2s ease-in-out 0.3s infinite",
        "wave-4": "wave 1.2s ease-in-out 0.45s infinite",
        "wave-5": "wave 1.2s ease-in-out 0.6s infinite",
        "fade-in": "fade-in 0.5s ease-out",
        "slide-up": "slide-up 0.4s ease-out",
        "float": "float 6s ease-in-out infinite",
        "shimmer": "shimmer 2s linear infinite",
      },
      keyframes: {
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(251,113,133,0.4)" },
          "70%": { boxShadow: "0 0 0 24px rgba(251,113,133,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(251,113,133,0)" },
        },
        wave: {
          "0%, 100%": { transform: "scaleY(0.4)", opacity: "0.5" },
          "50%": { transform: "scaleY(1)", opacity: "1" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};
