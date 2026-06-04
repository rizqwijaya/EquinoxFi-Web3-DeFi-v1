import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Point envDir to the monorepo root so VITE_* vars in the root .env are loaded.
export default defineConfig({
  plugins: [react()],
  envDir: resolve(__dirname, '../../'),
  server: { port: 5173 },
});
