// Pull-request check for 书单.md.
//   node scripts/check-booklist.mjs [base-ref]
// Fails if 书单.md no longer parses. With a base ref (e.g. origin/main), also warns about books
// whose key disappeared: readers who marked them read lose that mark unless the book was
// deleted on purpose, or the rename is listed in RENAMED (scripts/booklist.mjs).
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parse, translate } from './booklist.mjs';

const gha = !!process.env.GITHUB_ACTIONS;
const fail = (msg) => {
  console.log(gha ? `::error file=书单.md::${msg}` : `✗ ${msg}`);
  process.exit(1);
};

let head;
try {
  head = parse(readFileSync(new URL('../书单.md', import.meta.url), 'utf8'));
} catch (e) {
  fail(`书单.md 解析失败：${e.message}`);
}
console.log(`✓ 书单.md 解析正常：${head.books.length} 本书，${head.directions.length} 个方向，${head.seasons.length} 季主线`);

// English text lives in booklist.en.json. A gap is only a warning: the site shows Chinese there.
let en;
try {
  en = JSON.parse(readFileSync(new URL('../booklist.en.json', import.meta.url), 'utf8'));
} catch (e) {
  fail(`booklist.en.json 读不了：${e.message}`);
}
const missing = translate(head, en);
for (const m of missing) {
  const msg = `${m} 还没有英文。请在 booklist.en.json 里补上，否则英文版网站会显示中文。`;
  console.log(gha ? `::warning file=booklist.en.json::${msg}` : `! ${msg}`);
}
const keys = new Set(head.books.map((b) => b.key));
for (const k of Object.keys(en.books || {}))
  if (!keys.has(k)) console.log(gha ? `::warning file=booklist.en.json::${k} 在书单里找不到，可能是书名改了。` : `! booklist.en.json 里的 ${k} 在书单里找不到`);
if (!missing.length) console.log('✓ 每本书都有英文');

const base = process.argv[2];
if (base) {
  let old = null;
  try {
    old = parse(execFileSync('git', ['show', `${base}:书单.md`], { encoding: 'utf8' }));
  } catch (e) {
    console.log(`（跳过改名检查：读不到 ${base} 上的 书单.md：${e.message.split('\n')[0]}）`);
  }
  if (old) {
    const now = new Set(head.books.flatMap((b) => [b.key, ...(b.aliases || [])]));
    const gone = old.books.filter((b) => !now.has(b.key));
    for (const b of gone) {
      const msg = `《${b.key}》不在书单里了。如果是改名，请在 scripts/booklist.mjs 的 RENAMED 里写上 新书名: ['${b.key}']，否则读过它的人会丢掉已读标记。如果是有意删掉，可以忽略。`;
      console.log(gha ? `::warning file=书单.md::${msg}` : `! ${msg}`);
    }
    if (!gone.length) console.log('✓ 没有书被改名或删除');
  }
}
