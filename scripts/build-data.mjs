// Writes site/data/books.json from 书单.md (the single source of truth) and its English text in
// booklist.en.json.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parse, translate } from './booklist.mjs';

const list = parse(readFileSync(new URL('../书单.md', import.meta.url), 'utf8'));
const missing = translate(list, JSON.parse(readFileSync(new URL('../booklist.en.json', import.meta.url), 'utf8')));
const { directions, seasons, books } = list;

mkdirSync(new URL('../site/data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../site/data/books.json', import.meta.url), JSON.stringify({ directions, seasons, books }, null, 1) + '\n');
console.log(`${books.length} books · ${directions.length} directions · ${seasons.length} seasons · ${books.filter((b) => b.mark === 3).length} ◆ · ${books.filter((b) => b.optional).length} optional`);
if (missing.length) console.log(`English missing for ${missing.length}: ${missing.join('、')} (shown in Chinese)`);
