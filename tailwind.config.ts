import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        statusGreen: "#16a34a",
        statusOrange: "#f59e0b",
      },
    },
  },
  plugins: [],
};
export default config;
