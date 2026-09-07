// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

const SITE_URL = 'https://landscapeestimatepro.com';

export default defineConfig({
  site: SITE_URL,
  integrations: [
    react(),
    sitemap({
      // /app/* is the local-first Pro application, not indexable content — keep it out of the sitemap.
      filter: (page) => !page.includes('/app/'),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
