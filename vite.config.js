import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// The NEAR wallet packages expect Node globals (Buffer, process) in the browser.
// Without these polyfills the built app throws on load and shows a blank page.
export default defineConfig({
  plugins: [nodePolyfills({ include: ['buffer', 'crypto', 'util', 'stream', 'events', 'process'], globals: { Buffer: true, global: true, process: true } })],
  server: { proxy: { '/api': 'http://localhost:8787' } }
});
