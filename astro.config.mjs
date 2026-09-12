// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

const SITE_URL = 'https://landscapeestimatepro.com';

export default defineConfig({
  site: SITE_URL,
  // Fully static — no server runtime, no adapter. Every page (marketing,
  // free tools, and the /app Pro workspace) is prerendered at build time;
  // the Pro app is a client-only React island that reads/writes localStorage
  // in the browser. No API routes, no SSR, by explicit product decision —
  // this app never sends project/customer data to a server.
  //
  // The public contact form's backend (api/contact.ts) is deliberately kept
  // OUTSIDE Astro entirely, as a plain Vercel serverless function at the
  // project root rather than an Astro API route — an Astro server adapter
  // would switch the whole build to Vercel's Build Output API and break
  // `astro preview` (which every Playwright spec's webServer depends on).
  // Vercel auto-deploys any file under /api regardless of the static build
  // next to it, so this keeps that one endpoint working in production
  // without touching how this project builds or tests locally at all.
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
