import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
const site = 'https://landscapeestimatepro.com';
const files = fs.readdirSync('dist', { recursive: true }).filter(f => f.endsWith('.html'));
const issues = [];
const pages = files.map(file => {
  const html = fs.readFileSync(path.join('dist', file), 'utf8');
  const doc = new JSDOM(html).window.document;
  const route = '/' + file.replaceAll('\\', '/').replace(/index\.html$/, '');
  const noindex = !!doc.querySelector('meta[name="robots"]')?.content.includes('noindex');
  const main = doc.querySelector('main')?.cloneNode(true);
  main?.querySelectorAll('script,style,nav,astro-island,svg,noscript,[aria-labelledby^="tool-grid-heading"],.bg-forest').forEach(el => el.remove());
  const text = main?.textContent.replace(/\s+/g, ' ').trim() ?? '';
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const links = [...doc.querySelectorAll('a[href]')].map(a => ({ href: a.getAttribute('href'), anchor: a.textContent.trim() || a.querySelector('img')?.alt || '', main: !!a.closest('main') }));
  return { file, doc, route, noindex, text, words, links, title: doc.title, description: doc.querySelector('meta[name="description"]')?.content, canonical: doc.querySelector('link[rel="canonical"]')?.href };
});
const publicPages = pages.filter(p => !p.noindex);
const paths = new Map(pages.map(p => [p.route, p]));
for (const p of pages) {
  if (!p.noindex) {
    if (!p.title || !p.description) issues.push(`${p.route}: missing title or description`);
    if (p.canonical !== site + p.route) issues.push(`${p.route}: non-self canonical ${p.canonical}`);
    if (p.doc.querySelectorAll('h1').length !== 1) issues.push(`${p.route}: needs exactly one h1`);
    for (const name of ['og:title', 'og:description', 'og:url', 'og:image']) if (!p.doc.querySelector(`meta[property="${name}"]`)?.content) issues.push(`${p.route}: missing ${name}`);
    for (const img of p.doc.querySelectorAll('img')) if (!img.hasAttribute('alt')) issues.push(`${p.route}: image missing alt`);
  }
  for (const node of p.doc.querySelectorAll('script[type="application/ld+json"]')) {
    try { JSON.parse(node.textContent); } catch { issues.push(`${p.route}: invalid JSON-LD`); }
  }
  const ids = [...p.doc.querySelectorAll('[id]')].map(n => n.id);
  if (new Set(ids).size !== ids.length) issues.push(`${p.route}: duplicate element IDs`);
  for (const link of p.links) {
    const url = new URL(link.href, site + p.route);
    if (url.origin !== site) continue;
    const target = paths.get(url.pathname);
    if (!target && !fs.existsSync(path.join('dist', decodeURIComponent(url.pathname)))) issues.push(`${p.route}: broken internal link ${link.href}`);
    if (target && url.hash && !target.noindex && !target.doc.getElementById(decodeURIComponent(url.hash.slice(1)))) issues.push(`${p.route}: missing anchor ${link.href}`);
    if (!link.anchor) issues.push(`${p.route}: empty link text ${link.href}`);
  }
  for (const node of p.doc.querySelectorAll('img[src],script[src],link[rel="stylesheet"][href],meta[property="og:image"]')) {
    const src = node.getAttribute('src') || node.getAttribute('href') || node.getAttribute('content');
    const url = new URL(src, site);
    if (url.origin === site && !fs.existsSync(path.join('dist', url.pathname))) issues.push(`${p.route}: missing asset ${src}`);
  }
}
for (const key of ['title', 'description', 'text']) {
  const seen = new Map();
  for (const p of publicPages) {
    if (seen.has(p[key])) issues.push(`${p.route}: duplicate ${key} with ${seen.get(p[key])}`);
    seen.set(p[key], p.route);
  }
}
const xml = fs.readdirSync('dist').filter(f => /^sitemap.*\.xml$/.test(f)).map(f => fs.readFileSync(path.join('dist', f), 'utf8')).join('\n');
for (const p of pages) {
  if (p.noindex && xml.includes(`<loc>${site + p.route}</loc>`)) issues.push(`${p.route}: noindex page in sitemap`);
  if (!p.noindex && !xml.includes(`<loc>${site + p.route}</loc>`)) issues.push(`${p.route}: missing from sitemap`);
}
if (/Disallow:\s*\/app/.test(fs.readFileSync('dist/robots.txt', 'utf8'))) issues.push('robots.txt prevents reading app noindex');
const shingle = words => new Set(words.slice(0, -4).map((_, i) => words.slice(i, i + 5).join(' ')));
const similarities = [];
for (let i = 0; i < publicPages.length; i++) for (let j = i + 1; j < publicPages.length; j++) {
  const a = shingle(publicPages[i].words), b = shingle(publicPages[j].words);
  const common = [...a].filter(x => b.has(x)).length;
  similarities.push({ a: publicPages[i].route, b: publicPages[j].route, sharedFiveWordPhrasesPercent: +(100 * common / Math.max(1, Math.min(a.size, b.size))).toFixed(1) });
}
const summary = publicPages.map(p => ({ route: p.route, title: p.title, description: p.description, editorialWordCount: p.words.length, incomingMainPages: publicPages.filter(other => other.route !== p.route && other.links.some(l => l.main && new URL(l.href, site + other.route).pathname === p.route)).map(other => other.route), schemas: [...p.doc.querySelectorAll('script[type="application/ld+json"]')].map(n => JSON.parse(n.textContent)['@type']) }));
for (const p of summary) if (p.route !== '/' && p.incomingMainPages.length === 0 && !['/contact/', '/privacy/', '/terms/', '/refund/'].includes(p.route)) issues.push(`${p.route}: no incoming content links`);
const report = { generatedAt: new Date().toISOString(), totalPages: pages.length, indexablePages: publicPages.length, noindexPages: pages.filter(p => p.noindex).map(p => p.route), issues: [...new Set(issues)], pages: summary, highestOverlap: similarities.sort((a, b) => b.sharedFiveWordPhrasesPercent - a.sharedFiveWordPhrasesPercent).slice(0, 12), methodology: 'Rendered HTML checks. Editorial text excludes global chrome, React calculators, related-tool grids and shared promotion. Five-word overlap is a review signal, not a Google threshold. Short functional/legal pages are not automatically thin content.' };
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/seo-audit.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.issues.length) process.exitCode = 1;
