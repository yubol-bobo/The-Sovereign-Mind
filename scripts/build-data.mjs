// Writes site/data/books.json from 书单.md (the single source of truth) and its English text in
// booklist.en.json.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parse, translate } from './booklist.mjs';

const list = parse(readFileSync(new URL('../书单.md', import.meta.url), 'utf8'));
const missing = translate(list, JSON.parse(readFileSync(new URL('../booklist.en.json', import.meta.url), 'utf8')));
const { directions, years, seasons, books } = list;

mkdirSync(new URL('../site/data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../site/data/books.json', import.meta.url), JSON.stringify({ directions, years, seasons, books }, null, 1) + '\n');
console.log(`${books.length} books · ${directions.length} directions · ${years.length} years · ${seasons.length} seasons · ${books.filter((b) => b.mark === 3).length} ◆`);
if (missing.length) console.log(`English missing for ${missing.length}: ${missing.join('、')} (shown in Chinese)`);

// On the deploy runner (or with --stamp), give every file a version from its content: styles.css?v=…,
// app.js?v=…, and an import map so modules import each other at the same version. A browser then
// never runs a fresh page against older cached files. The checked-in index.html stays unstamped.
if (process.env.GITHUB_ACTIONS === 'true' || process.argv.includes('--stamp')) {
  const { createHash } = await import('node:crypto');
  const { readdirSync } = await import('node:fs');
  const root = new URL('../site/', import.meta.url);
  const walk = (dir) =>
    readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${dir}${e.name}/`) : [`${dir}${e.name}`],
    );
  const all = walk('').filter((f) => f !== 'index.html').sort();
  const hash = createHash('sha256');
  for (const f of all) hash.update(f).update(readFileSync(new URL(f, root)));
  const v = hash.digest('hex').slice(0, 10);
  const imports = Object.fromEntries(all.filter((f) => f.endsWith('.js')).map((f) => [`./${f}`, `./${f}?v=${v}`]));
  const page = new URL('index.html', root);
  let html = readFileSync(page, 'utf8');
  if (!html.includes('type="importmap"')) {
    html = html
      .replace('href="./styles.css"', `href="./styles.css?v=${v}"`)
      .replace(
        '<script type="module" src="./app.js"></script>',
        `<script type="importmap">${JSON.stringify({ imports })}</script>\n    <script type="module" src="./app.js?v=${v}"></script>`,
      );
    writeFileSync(page, html);
    console.log(`stamped site files with v=${v}`);
  }
}
