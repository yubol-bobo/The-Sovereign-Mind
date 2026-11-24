// Finds a cover for every book and writes site/data/covers.json.
//
// Sources, in order: Open Library (open data; its covers may be linked from any page) and, when Open
// Library has none, Google Books. Each book is matched by its English title and author (the Chinese
// title for books with no English edition). The site links to the images; nothing is downloaded or
// stored here. Matches the script is unsure of are marked "check", and books with no cover keep the
// site's drawn cover.
//
// covers.fix.json corrects a match by hand: { "书名": { "ol": 12345 } } (an Open Library cover id),
// { "书名": { "isbn": "9780…" } }, { "书名": { "src": "https://…" } }, { "书名": null } for no cover, or
// { "书名": { "title": "…", "author": "…" } } to search under another title.
//
// An ISBN fix is checked against Open Library's record for that ISBN, and its image asks for a 404
// (?default=false) rather than a blank picture when Open Library has no cover for it.
//
// Run: node scripts/fetch-covers.mjs            look up every book (needs network)
//      node scripts/fetch-covers.mjs --missing  keep the sure matches in site/data/covers.json and look
//                                               up only new books, books with none, and fixed books
// The "Covers" workflow runs it on GitHub.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parse, translate } from './booklist.mjs';

const root = new URL('../', import.meta.url);
const list = parse(readFileSync(new URL('书单.md', root), 'utf8'));
translate(list, JSON.parse(readFileSync(new URL('booklist.en.json', root), 'utf8')));
const fixFile = new URL('covers.fix.json', root);
const fixes = existsSync(fixFile) ? JSON.parse(readFileSync(fixFile, 'utf8')) : {};

const UA = 'TheSovereignMind-covers/1.0 (+https://github.com/yubol-bobo/The-Sovereign-Mind)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Open Library asks scripts to stay near one request a second; a 429 or 5xx is waited out and retried.
async function getJSON(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (r.ok) return await r.json();
      if (r.status !== 429 && r.status < 500) return null;
    } catch {}
    await sleep(3000 * (i + 1));
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

// Abridgements, study guides and the like have their own covers; never take them for the book.
const DERIVED = /\b(adapted|young (readers|adults)|summary|study guide|sparknotes|cliffsnotes|workbook|analysis of|and other films|reader s guide)\b/;

// 3 = same title, or a close title by the same author; 5 = same title and author.
function score(doc, title, authors) {
  const t = norm(doc.title);
  if (DERIVED.test(norm(doc.title + ' ' + (doc.subtitle || '')))) return -1;
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

async function olSearch(params) {
  const q = new URLSearchParams({ ...params, limit: '30', fields: 'key,title,subtitle,author_name,cover_i,edition_count' });
  const res = await getJSON(`https://openlibrary.org/search.json?${q}`);
  await sleep(1000);
  return (res?.docs || []).filter((d) => d.cover_i);
}

async function openLibrary(title, author) {
  const who = surnames(author)[0];
  let docs = await olSearch(who ? { title, author: who } : { title });
  // An author search misses books catalogued under another spelling of the name; try the title alone.
  if (!docs.length && who) docs = await olSearch({ title });
  const ranked = docs
    .map((d) => ({ d, s: score(d, title, surnames(author)) + Math.min(1, (d.edition_count || 0) / 50) }))
    .filter((x) => x.s >= 3)
    .sort((a, b) => b.s - a.s);
  if (!ranked.length) return null;
  const { d, s } = ranked[0];
  return { src: `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`, by: 'openlibrary', ref: d.key, found: d.title, sure: s >= 5 };
}

async function googleBooks(title, author) {
  await sleep(1000);
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

// "War and Peace / Crime and Punishment" is two books on one line; the first one stands for both.
const first = (s = '') => s.split(' / ')[0].trim();

async function find(b, fix) {
  const tries = [];
  if (fix?.title) tries.push([fix.title, fix.author || b.en?.author || b.author]);
  if (b.en?.title) tries.push([first(b.en.title), first(b.en.author)]);
  tries.push([first(b.title.replace(/》\s*\+?\s*《/g, ' / ').replace(/[《》]/g, '')), first(b.author)]);
  let best = null;
  for (const src of [openLibrary, googleBooks]) {
    for (const [title, author] of tries) {
      const hit = await src(title, author);
      if (hit?.sure) return hit;
      if (hit && !best) best = hit;
    }
    if (best) return best;
  }
  return null;
}

// Checks that an ISBN is the book it is meant to be: "ok", the title Open Library has for it, or null.
async function isbnTitle(isbn, b) {
  const rec = await getJSON(`https://openlibrary.org/isbn/${isbn}.json`);
  await sleep(1000);
  if (!rec?.title) return null;
  const want = norm(first(b.en?.title || b.key));
  const got = norm(rec.title);
  return got === want || got.startsWith(want) || want.startsWith(got) ? 'ok' : rec.title;
}

const coversFile = new URL('site/data/covers.json', root);
const missingOnly = process.argv.includes('--missing');
const old = missingOnly && existsSync(coversFile) ? JSON.parse(readFileSync(coversFile, 'utf8')) : {};
const out = {};
const report = { sure: [], check: [], none: [], fixed: [] };
for (const b of list.books) {
  if (b.key in fixes && !fixes[b.key]?.title) {
    const f = fixes[b.key];
    let entry = null;
    let note = 'no cover';
    if (f?.src) [entry, note] = [{ src: f.src, by: 'fix' }, f.src];
    else if (f?.ol) [entry, note] = [{ src: `https://covers.openlibrary.org/b/id/${f.ol}-M.jpg`, by: 'fix' }, `cover ${f.ol}`];
    else if (f?.isbn) {
      const seen = await isbnTitle(f.isbn, b);
      entry = seen ? { src: `https://covers.openlibrary.org/b/isbn/${f.isbn}-M.jpg?default=false`, by: 'fix', ...(seen === 'ok' ? {} : { check: 1 }) } : null;
      note = `ISBN ${f.isbn}: ${seen === 'ok' ? 'title matches' : seen ? `Open Library has "${seen}"` : 'not on Open Library'}`;
    }
    out[b.key] = entry;
    report.fixed.push(`${b.title} → ${note}`);
    continue;
  }
  if (old[b.key] && !old[b.key].check) {
    out[b.key] = old[b.key];
    report.sure.push(b.key);
    continue;
  }
  const hit = await find(b, fixes[b.key]);
  if (!hit) {
    out[b.key] = null;
    report.none.push(`${b.title} ${b.en?.title ? `(${b.en.title})` : ''}`);
    continue;
  }
  out[b.key] = { src: hit.src, by: hit.by, ...(hit.sure ? {} : { check: 1 }) };
  (hit.sure ? report.sure : report.check).push(`${b.title} → ${hit.found} [${hit.by} ${hit.ref}]`);
  console.log(`${hit.sure ? '✓' : '?'} ${b.title} → ${hit.found} (${hit.by})`);
}

writeFileSync(coversFile, JSON.stringify(out, null, 1) + '\n');
const lines = [
  `## Covers: ${report.sure.length} sure · ${report.check.length} to check · ${report.none.length} none · ${report.fixed.length} fixed by hand`,
  '',
  ...(report.check.length ? ['### To check', ...report.check.map((l) => `- ${l}`), ''] : []),
  ...(report.none.length ? ['### No cover found', ...report.none.map((l) => `- ${l}`), ''] : []),
  ...(report.fixed.length ? ['### Fixed by hand', ...report.fixed.map((l) => `- ${l}`), ''] : []),
];
console.log('\n' + lines.join('\n'));
// One line a book, for copying the result out of the log: key, Open Library cover id or address, ? when unsure.
console.log('\n----- covers.tsv -----');
for (const [k, v] of Object.entries(out)) {
  const id = v?.src.match(/openlibrary\.org\/b\/id\/(\d+)-M/)?.[1];
  console.log([k, v ? id || v.src : '-', v?.check ? '?' : ''].join('\t').trimEnd());
}
if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n', { flag: 'a' });
