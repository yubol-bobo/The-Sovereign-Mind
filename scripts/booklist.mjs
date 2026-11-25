// Parses 书单.md (the single source of truth) into the site's data.
// Used by build-data.mjs (writes site/data/books.json) and check-booklist.mjs (PR check).

// Direction of each year-one book: those rows are written out in full in 主线, with no direction column.
const MAIN_DIR = {
  昨日的世界: '07', 娱乐至死: '01', 观看之道: '06', 如何阅读一本书: '01', 倦怠社会: '03', 我与地坛: '02',
  我的天才女友: '05', 活出生命的意义: '04', 悉达多: '02', 乡土中国: '03', 悠悠岁月: '02', 美的历程: '06',
  不能承受的生命之轻: '05', 社会学的想象力: '03', 国家的视角: '07', '安娜·卡列尼娜': '05', 万历十五年: '07', 艺术的故事: '06',
  西西弗神话: '04', 人的境况: '04', 卡拉马佐夫兄弟: '05', 庄子: '04', 九诗心: '06', 红楼梦: '05',
};
const COLORS = {
  '01': 'orange', '02': 'pink', '03': 'violet', '04': 'indigo', '05': 'red', '06': 'amber',
  '07': 'brown', '08': 'teal', '09': 'jade', '10': 'lime', '11': 'blue',
};

// Reading progress is stored under each book's key, so a book's key must never change.
// The key is the bare title: no 《》 and no trailing note in brackets, so fixing a translator
// or adding an English title in 书单.md keeps everyone's progress.
// When you really rename a book, list its old key here so progress moves to the new one:
//   新书名: ['旧书名'],
export const RENAMED = {};

export const keyOf = (title) =>
  title
    .replace(/[《》]/g, '')
    .replace(/\s*[（(][^（）()]*[）)]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

const cells = (line) => line.split('|').slice(1, -1).map((c) => c.trim());
const clean = (t) => t.replace(/[◆◇]/g, '').replace(/\*/g, '').trim();
const mark = (t) => (t.includes('◆') ? 3 : t.includes('◇') ? 2 : 0);

export function parse(md) {
  const directions = [];
  const years = [];
  const seasons = [];
  const books = [];
  const refs = []; // route rows that name a book from the shelves: [n, title, season]
  let zone = '', year = null, season = null, dir = null, group = '';

  for (const raw of md.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('## ')) {
      zone = line.includes('主线') ? 'main' : line.includes('书房') ? 'shelf' : '';
      continue;
    }
    if (zone === 'main' && line.startsWith('### ')) {
      const m = line.slice(4).match(/^(第.+年) · ([^：]+)：(.+)$/);
      if (!m) throw new Error(`A year heading should read "### 第X年 · 主题：副题": ${line}`);
      year = { name: m[1], theme: m[2], sub: m[3], intro: '' };
      years.push(year);
      season = null;
      continue;
    }
    if (zone === 'main' && line.startsWith('#### ')) {
      const m = line.slice(5).match(/^(第.+季) · (.+)$/);
      if (!m || !year) throw new Error(`A season heading should read "#### 第X季 · 主题", under a year: ${line}`);
      season = { name: m[1], theme: m[2], year: years.length, books: [] };
      seasons.push(season);
      continue;
    }
    if (line.startsWith('### ')) {
      group = '';
      if (zone === 'shelf') {
        const m = line.slice(4).match(/^(\d\d) · ([^：]+)：(.+)$/);
        if (m) { dir = { id: m[1], name: m[2], sub: m[3], question: '', color: COLORS[m[1]] }; directions.push(dir); }
      }
      continue;
    }
    if (zone === 'main' && year && !season && line && !line.startsWith('|') && !year.intro) { year.intro = line; continue; }
    if (zone === 'shelf' && dir && line.startsWith('> ') && !dir.question) { dir.question = line.slice(2); continue; }
    const g = line.match(/^\*\*(.+)\*\*$/);
    if (g) { group = g[1]; continue; }
    if (!line.startsWith('|') || /^\|\s*-/.test(line)) continue;
    const c = cells(line);
    if (c[0] === '#' || c.includes('作者')) continue; // header row

    if (zone === 'main' && season) {
      const [n, t, author, note] = c;
      if (!/^\d+$/.test(n)) throw new Error(`A route row should start with its number: ${line}`);
      if (!author) { refs.push([Number(n), clean(t), season]); continue; } // a book from the shelves
      const title = clean(t).replace(/^《|》$/g, '').replace(/》（.+$/, '');
      const key = Object.keys(MAIN_DIR).find((k) => title.includes(k));
      if (!key) throw new Error(`No direction mapped for mainline book: ${title}`);
      const b = { title: clean(t), author, note, dir: MAIN_DIR[key], mark: mark(t), main: Number(n), season: season.name, year: season.year };
      books.push(b); season.books.push(b.title);
    } else if (zone === 'shelf' && dir) {
      const [t, author, note] = c;
      books.push({ title: clean(t), author, note, dir: dir.id, mark: mark(t), main: null, group });
    }
  }

  // Route rows that name a shelf book put it on the route, in that season.
  const byKey = new Map(books.map((b) => [keyOf(b.title), b]));
  for (const [n, title, s] of refs) {
    const b = byKey.get(keyOf(title));
    if (!b) throw new Error(`${s.name}里的《${keyOf(title)}》在书房里找不到。路线里的书名要和书房里的写法一致。`);
    if (b.main) throw new Error(`《${b.title}》在路线里出现了两次（第 ${b.main} 本和第 ${n} 本）`);
    Object.assign(b, { main: n, season: s.name, year: s.year });
    s.books.push(b.title);
  }
  // Every book sits in exactly one season, numbered 1, 2, 3… along the route.
  const off = books.filter((b) => !b.main);
  if (off.length) throw new Error(`这些书还没排进任何一季：${off.map((b) => `《${keyOf(b.title)}》`).join('、')}。在「主线」里给它们找一季。`);
  const nums = books.map((b) => b.main).sort((a, b) => a - b);
  nums.forEach((n, i) => { if (n !== i + 1) throw new Error(`路线的编号应该从 1 连续排到 ${books.length}，第 ${i + 1} 个位置是 ${n}`); });
  for (const s of seasons) s.books.sort((a, b) => books.find((x) => x.title === a).main - books.find((x) => x.title === b).main);
  books.forEach((b, i) => { b.id = i; });

  if (!years.length || !seasons.length) throw new Error('No years or seasons parsed from 主线');
  if (!directions.length) throw new Error('No directions parsed');

  const seen = new Map();
  for (const b of books) {
    if (!b.title || !b.author) throw new Error(`A book row is missing its title or author: ${JSON.stringify(b)}`);
    b.key = keyOf(b.title);
    if (seen.has(b.key)) throw new Error(`Two books share the key "${b.key}": ${seen.get(b.key)} / ${b.title}`);
    seen.set(b.key, b.title);
  }
  for (const [key, old] of Object.entries(RENAMED)) {
    const b = books.find((x) => x.key === key);
    if (!b) throw new Error(`RENAMED lists "${key}", but no book has that key`);
    b.aliases = old;
  }
  return { directions, years, seasons, books };
}

/**
 * Attach English text from booklist.en.json to the parsed list (as `en` on each direction, year,
 * season and book). Chinese stays the source; anything untranslated falls back to Chinese on the site.
 * Returns what is missing so the PR check can warn about it.
 */
export function translate(list, en) {
  const missing = [];
  for (const d of list.directions) {
    if (en.directions?.[d.id]) d.en = en.directions[d.id];
    else missing.push(`方向 ${d.id} ${d.name}`);
  }
  for (const y of list.years) {
    if (en.years?.[y.name]) y.en = en.years[y.name];
    else missing.push(`年 ${y.name}`);
  }
  for (const s of list.seasons) {
    if (en.seasons?.[s.name]) s.en = en.seasons[s.name];
    else missing.push(`季 ${s.name}`);
  }
  for (const b of list.books) {
    const t = en.books?.[b.key];
    if (t?.title && t?.author && t?.note) b.en = { title: t.title, author: t.author, note: t.note };
    else missing.push(`《${b.key}》`);
    if (b.group != null) {
      if (en.groups?.[b.group] != null) b.groupEn = en.groups[b.group];
      else missing.push(`分组 ${b.group}`);
    }
  }
  return [...new Set(missing)];
}
