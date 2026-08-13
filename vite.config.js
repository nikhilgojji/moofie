// Vite reads this file while starting the dev server or creating a production build.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // The React plugin transforms JSX and enables React Fast Refresh in development.
  plugins: [react()],
});
