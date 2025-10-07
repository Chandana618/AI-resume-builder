import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "/AI-resume-builder/", // IMPORTANT: Add your repository name here for correct asset paths
  build: {
    outDir: 'docs' // Change the output folder from 'dist' to 'docs'
  }
})
