// Finds a cover for every book and writes site/data/covers.json.
//
// Sources, in order: Open Library (open data; its covers may be linked from any page) and, when Open
// Library has none, Google Books. Each book is matched by its English title and author (the Chinese
// title for books with no English edition). The site links to the images; nothing is downloaded or
// stored here. Matches the script is unsure of are marked "check", and books with no cover keep the
// site's drawn cover.
//
// covers.fix.json corrects a match by hand: { "书名": { "ol": 12345 } } (an Open Library cover id),
// { "书名": { "isbn": "9780…" } }, { "书名": { "src": "https://…" } } or { "书名": null } for no cover.
//
// Run: node scripts/fetch-covers.mjs        (needs network; the "Covers" workflow runs it on GitHub)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parse, translate } from './booklist.mjs';

const root = new URL('../', import.meta.url);
const list = parse(readFileSync(new URL('书单.md', root), 'utf8'));
translate(list, JSON.parse(readFileSync(new URL('booklist.en.json', root), 'utf8')));
const fixFile = new URL('covers.fix.json', root);
const fixes = existsSync(fixFile) ? JSON.parse(readFileSync(fixFile, 'utf8')) : {};

const UA = 'TheSovereignMind-covers/1.0 (+https://github.com/yubol-bobo/The-Sovereign-Mind)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (r.ok) return await r.json();
      if (r.status !== 429 && r.status < 500) return null;
    } catch {}
    await sleep(1500 * (i + 1));
  }
  return null;
}

// "The World of Yesterday: Memoirs of a European" → "world of yesterday"
const norm = (s = '') =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[《》「」"'’‘“”]/g, '')
    .split(/[:：(（—]/)[0]
    .replace(/^(the|a|an) /, '')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const surnames = (author = '') =>
  author
    .split(/\/|,|&| and |、|，/)
    .map((a) => a.replace(/[（(].*$/, '').trim().split(/\s+/).pop())
    .filter(Boolean)
    .map((s) => norm(s));

// 3 = same title, or a close title by the same author; 5 = same title and author.
function score(doc, title, authors) {
  const t = norm(doc.title);
  const want = norm(title);
  let s = 0;
  if (t === want) s += 3;
  else if (t.startsWith(want) || want.startsWith(t)) s += 2;
  else if (t.includes(want) || want.includes(t)) s += 1;
  else return -1;
  const docAuthors = (doc.author_name || doc.authors || []).map(norm).join(' ');
  if (authors.some((a) => a && docAuthors.includes(a))) s += 2;
  return s;
}

async function openLibrary(title, author) {
  const q = new URLSearchParams({ title, limit: '10', fields: 'key,title,author_name,cover_i,edition_count' });
  const who = surnames(author)[0];
  if (who) q.set('author', who);
  const res = await getJSON(`https://openlibrary.org/search.json?${q}`);
  const docs = (res?.docs || []).filter((d) => d.cover_i);
  const ranked = docs
    .map((d) => ({ d, s: score(d, title, surnames(author)) + Math.min(1, (d.edition_count || 0) / 50) }))
    .filter((x) => x.s >= 3)
    .sort((a, b) => b.s - a.s);
  if (!ranked.length) return null;
  const { d, s } = ranked[0];
  return { src: `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`, by: 'openlibrary', ref: d.key, found: d.title, sure: s >= 5 };
}

async function googleBooks(title, author) {
  const who = surnames(author)[0];
  const q = `intitle:${title}${who ? ` inauthor:${who}` : ''}`;
  const res = await getJSON(`https://www.googleapis.com/books/v1/volumes?${new URLSearchParams({ q, maxResults: '10', printType: 'books' })}`);
  const items = (res?.items || []).map((i) => i.volumeInfo).filter((v) => v.imageLinks?.thumbnail);
  const ranked = items
    .map((v) => ({ v, s: score(v, title, surnames(author)) }))
    .filter((x) => x.s >= 3)
    .sort((a, b) => b.s - a.s);
  if (!ranked.length) return null;
  const { v, s } = ranked[0];
  const src = v.imageLinks.thumbnail.replace(/^http:/, 'https:').replace(/&edge=curl/, '');
  return { src, by: 'google', ref: v.infoLink || '', found: v.title, sure: s >= 5 };
}

async function find(b) {
  const tries = [];
  if (b.en?.title) tries.push([b.en.title, b.en.author]);
  tries.push([b.key, b.author]);
  for (const src of [openLibrary, googleBooks])
    for (const [title, author] of tries) {
      const hit = await src(title, author);
      await sleep(400);
      if (hit) return hit;
    }
  return null;
}

const out = {};
const report = { sure: [], check: [], none: [], fixed: [] };
for (const b of list.books) {
  if (b.key in fixes) {
    const f = fixes[b.key];
    out[b.key] = !f
      ? null
      : { src: f.src || (f.ol ? `https://covers.openlibrary.org/b/id/${f.ol}-M.jpg` : `https://covers.openlibrary.org/b/isbn/${f.isbn}-M.jpg`), by: 'fix' };
    report.fixed.push(b.key);
    continue;
  }
  const hit = await find(b);
  if (!hit) {
    out[b.key] = null;
    report.none.push(`${b.title} ${b.en?.title ? `(${b.en.title})` : ''}`);
    continue;
  }
  out[b.key] = { src: hit.src, by: hit.by, ...(hit.sure ? {} : { check: 1 }) };
  (hit.sure ? report.sure : report.check).push(`${b.title} → ${hit.found} [${hit.by} ${hit.ref}]`);
  console.log(`${hit.sure ? '✓' : '?'} ${b.title} → ${hit.found} (${hit.by})`);
}

writeFileSync(new URL('site/data/covers.json', root), JSON.stringify(out, null, 1) + '\n');
const lines = [
  `## Covers: ${report.sure.length} sure · ${report.check.length} to check · ${report.none.length} none · ${report.fixed.length} fixed by hand`,
  '',
  ...(report.check.length ? ['### To check', ...report.check.map((l) => `- ${l}`), ''] : []),
  ...(report.none.length ? ['### No cover found', ...report.none.map((l) => `- ${l}`), ''] : []),
];
console.log('\n' + lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n', { flag: 'a' });
