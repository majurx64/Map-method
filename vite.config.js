import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'

function offlineBuild() {
  return {
    name: 'map-method-offline-shell',
    apply: 'build',
    closeBundle() {
      const assets = readdirSync('dist/assets').filter((name) => /\.(js|css)$/.test(name))
        .map((name) => `https://map-method-chi.vercel.app/assets/${name}`);
      const id = assets.find((name) => /index-.*\.js$/.test(name))?.split('/').at(-1) || 'initial';
      const worker = readFileSync('public/sw.js', 'utf8')
        .replace('["__BUILD_ASSETS__"]', JSON.stringify(assets)).replace('__BUILD_ID__', id);
      writeFileSync('dist/sw.js', worker);
      const html = readFileSync('dist/index.html', 'utf8')
        .replace('href="https://map-method-chi.vercel.app/manifest.webmanifest"', 'href="/manifest.webmanifest"');
      writeFileSync('dist/index.html', html);
    },
  };
}

export default defineConfig({
  base: 'https://map-method-chi.vercel.app/',
  plugins: [react(), offlineBuild()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react-vendor',
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
            },
            {
              name: 'supabase-vendor',
              test: /[\\/]node_modules[\\/]@supabase[\\/]/,
            },
          ],
        },
      },
    },
  },
})
