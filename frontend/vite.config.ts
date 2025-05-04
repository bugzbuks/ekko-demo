// frontend/vite.config.ts
import path from "path" // Import the 'path' module from Node.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000, // Keeps your specified port
  },
  define: {
    // Keeps your process.env definition (useful for VITE_ variables)
    'process.env': process.env
  },
  // Add the resolve.alias configuration for Shadcn UI paths
  resolve: {
    alias: {
      // This tells Vite that imports starting with "@/"
      // should be resolved relative to the "./src" directory.
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
