// vite.config.js
// eslint-disable-next-line import/no-extraneous-dependencies
import { defineConfig } from 'vite';

export default defineConfig({
  root: './example',
  build: {
    lib: {
      entry: 'src/main.js',
      name: 'WSC Client',
      fileName: 'bundle',
      formats: ['es'], // or 'umd', 'iife'
    },
    cssCodeSplit: false,
  },
});
