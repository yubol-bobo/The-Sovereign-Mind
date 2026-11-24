// Writes site/data/books.json from 书单.md. 书单.md is the single source of truth.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parse } from './booklist.mjs';

const { directions, seasons, books } = parse(readFileSync(new URL('../书单.md', import.meta.url), 'utf8'));

mkdirSync(new URL('../site/data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../site/data/books.json', import.meta.url), JSON.stringify({ directions, seasons, books }, null, 1) + '\n');
console.log(`${books.length} books · ${directions.length} directions · ${seasons.length} seasons · ${books.filter((b) => b.mark === 3).length} ◆ · ${books.filter((b) => b.optional).length} optional`);
