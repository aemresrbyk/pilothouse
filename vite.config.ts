import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'path';

// Ensure Electron launches in GUI browser mode
delete process.env.ELECTRON_RUN_AS_NODE;

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: ['node-pty', 'electron-updater']
            }
          }
        }
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload();
        },
      }
    ]),
    renderer(),
    // ORT's .wasm (~15 MB) is handed to the renderer as bytes by main (wake:assets), so the copy Vite emits is never
    // loaded; dropping it keeps the app from shipping the file twice.
    {
      name: 'drop-unused-ort-wasm',
      generateBundle(_opts, bundle) {
        for (const f of Object.keys(bundle)) if (/ort-wasm.*\.wasm$/.test(f)) delete bundle[f];
      }
    }
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  }
});
