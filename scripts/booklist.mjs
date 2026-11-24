// Parses 书单.md (the single source of truth) into the site's data.
// Used by build-data.mjs (writes site/data/books.json) and check-booklist.mjs (PR check).

// Direction of each mainline book (the mainline table has no direction column).
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
  const seasons = [];
  const books = [];
  const byTitle = new Map();
  let zone = '', season = null, dir = null, group = '', optional = false;

  for (const raw of md.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('## ')) {
      zone = line.includes('主线') ? 'main' : line.includes('书房') ? 'shelf' : '';
      continue;
    }
    if (line.startsWith('### ')) {
      const h = line.slice(4);
      group = '';
      optional = false;
      if (zone === 'main') {
        const m = h.match(/^(第.季) · (.+)$/);
        if (m) { season = { name: m[1], theme: m[2], books: [] }; seasons.push(season); }
        else { season = null; optional = h.startsWith('可选'); }
      } else if (zone === 'shelf') {
        const m = h.match(/^(\d\d) · ([^：]+)：(.+)$/);
        if (m) { dir = { id: m[1], name: m[2], sub: m[3], question: '', color: COLORS[m[1]] }; directions.push(dir); }
      }
      continue;
    }
    if (zone === 'shelf' && dir && line.startsWith('> ') && !dir.question) { dir.question = line.slice(2); continue; }
    const g = line.match(/^\*\*(.+)\*\*$/);
    if (g) { group = g[1]; continue; }
    if (!line.startsWith('|') || /^\|\s*-/.test(line)) continue;
    const c = cells(line);
    if (c.includes('作者')) continue; // header row

    if (zone === 'main' && season) {
      const [n, t, author, note] = c;
      const title = clean(t).replace(/^《|》$/g, '').replace(/》（.+$/, '');
      const key = Object.keys(MAIN_DIR).find((k) => title.includes(k));
      if (!key) throw new Error(`No direction mapped for mainline book: ${title}`);
      const b = { title: clean(t), author, note, dir: MAIN_DIR[key], mark: mark(t), main: Number(n), season: season.name };
      books.push(b); byTitle.set(b.title, b); season.books.push(b.title);
    } else if (zone === 'main' && optional) {
      const [s, t, author, note] = c;
      byTitle.set('opt:' + clean(t), { season: s, note });
    } else if (zone === 'shelf' && dir) {
      const [t, author, note] = c;
      const b = { title: clean(t), author, note, dir: dir.id, mark: mark(t), main: null, group };
      books.push(b); byTitle.set(b.title, b);
    }
  }

  for (const [k, v] of byTitle) {
    if (!k.startsWith('opt:')) continue;
    const b = byTitle.get(k.slice(4)) ?? books.find((x) => x.title.startsWith(k.slice(4)));
    if (b) b.optional = v.season;
  }
  books.forEach((b, i) => { b.id = i; });

  if (seasons.length !== 4 || books.filter((b) => b.main).length !== 24) throw new Error('Mainline did not parse to 4 seasons / 24 books');
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
  return { directions, seasons, books };
}

const SEASON_NO = { 一: 1, 二: 2, 三: 3, 四: 4 };

/**
 * Attach English text from booklist.en.json to the parsed list (as `en` on each direction, season
 * and book). Chinese stays the source; anything untranslated falls back to Chinese on the site.
 * Returns what is missing so the PR check can warn about it.
 */
export function translate(list, en) {
  const missing = [];
  for (const d of list.directions) {
    if (en.directions?.[d.id]) d.en = en.directions[d.id];
    else missing.push(`方向 ${d.id} ${d.name}`);
  }
  for (const s of list.seasons) {
    if (en.seasons?.[s.name]) s.en = en.seasons[s.name];
    else missing.push(`季 ${s.name}`);
  }
  for (const b of list.books) {
    if (b.optional) b.optionalNo = SEASON_NO[b.optional] ?? null;
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
