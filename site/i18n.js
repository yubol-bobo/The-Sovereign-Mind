// English and Chinese for every word the page says. English is the default; the visitor's choice
// is remembered. Book titles, authors, notes, directions and seasons come translated in
// data/books.json (from booklist.en.json); this file holds the page's own words.
//
// Static text in index.html is marked with data-i18n="key" (text), data-i18n-html="key" (markup
// we wrote ourselves) or data-i18n-attr="attr:key; attr:key".

const STORE_KEY = 'sovereign-mind:v1';

/** [English, 中文]. A function takes arguments and returns the text. */
const T = {
  'meta.title': ['The Sovereign Mind · A lifelong reading plan', 'The Sovereign Mind · 精神主权'],
  'meta.desc': [
    'A lifelong reading plan for the age of AI: 24 mainline books for the first year and a library in eleven directions. Keep your thinking your own.',
    'AI 时代的终身阅读计划：一年 24 本主线，十一个方向的精神书房。把思考留给自己的大脑。',
  ],

  'nav.label': ['Page navigation', '页面导航'],
  'nav.stars': ['Stars', '恒星'],
  'nav.main': ['Mainline', '主线'],
  'nav.library': ['Library', '书房'],
  'nav.rec': ['Recommend', '荐书'],
  'menu.stat': ['Mainline progress', '主线进度'],
  'menu.statText': [(d, n) => `Mainline ${d} / ${n}`, (d, n) => `主线 ${d} / ${n}`],
  'aria.sync': ['Sync across devices', '跨设备同步'],
  'aria.theme': ['Switch light and dark', '切换明暗主题'],
  'aria.repo': ['GitHub repository', 'GitHub 仓库'],
  'aria.lang': ['切换到中文', 'Switch to English'],
  'lang.btn': ['中', 'EN'],
  'aria.close': ['Close', '关闭'],
  'aria.down': ['Scroll down', '向下'],

  'hero.eyebrow': ['A lifelong reading plan for the age of AI · 精神主权', 'AI 时代的终身阅读计划 · The Sovereign Mind'],
  'hero.h1': ['The Sovereign Mind', '精神主权'],
  'hero.lede': [
    'AI can search, summarize and analyze for me. But my attention, my judgment, my taste and my answers about life must be my own. The method is reading: borrowing decades of another person’s experience, pain and wisdom to see myself and the world anew.',
    'AI 可以替我检索、总结、分析。但我的注意力、判断、审美和人生答案，必须是我自己的。方法是阅读：借用另一个人几十年的经验、痛苦与智慧，重新认识自己与世界。',
  ],
  'hero.follow': ['Follow the mainline', '跟着主线读'],
  'hero.enter': ['Enter the library', '进入书房'],
  'hero.hint': ['Drag to turn the galaxy and click a book to look closer. Books you’ve read light up.', '拖动旋转星系，点一本书看看；读过的书会亮起来。'],
  'hero.hintShelf': ['The 24 mainline books, shelved by season. Click one to look closer; books you’ve read light up.', '主线 24 本按季排在这里。点一本看看；读过的书会亮起来。'],
  'hero.sceneError': [(why) => `3D didn’t start: ${why}`, (why) => `3D 没有启动：${why}`],
  'stat.main': ['mainline', '本主线'],
  'stat.dirs': ['directions', '个方向'],
  'stat.books': ['books', '本藏书'],
  'stat.read': ['read', '本已读'],
  'next.next': ['Next', '下一本'],
  'next.start': ['Start here', '从这本开始'],
  'next.done': ['Mainline finished', '主线读完了'],
  'next.pick': ['Pick your next book in the library', '去书房里挑下一本'],

  'stars.kicker': ['Seven stars', '七颗恒星'],
  'stars.title': ['The seven books all three lists chose', '三份推荐都选中的七本'],
  'stars.sub': [
    'Three reading lists, made independently, chose the same seven books. If you don’t know where to start, start here.',
    '三份书单各自独立得出，却选中了同样的七本。不知从哪开始，就从这里。',
  ],

  'main.kicker': ['Four seasonal orbits', '四季轨道'],
  'main.title': ['Year one: the mainline', '第一年主线'],
  'main.sub': [
    'Six books a season, heavy and light in turn. If that’s too many, read only the first three of each season. Dream of the Red Chamber runs through the whole year, two chapters a week.',
    '每季 6 本，轻重交替。嫌多就只读每季前三本。《红楼梦》每周两回，贯穿全年。',
  ],
  'main.ring': [(d, n) => `Mainline read: ${d} / ${n}`, (d, n) => `主线已读 ${d} / ${n}`],
  'main.read': ['mainline read', '主线已读'],

  'lib.kicker': ['Eleven sectors', '十一个星区'],
  'lib.title': ['A library in eleven directions', '十一个方向的书房'],
  'lib.sub': ['When you finish the mainline, or get hooked on one direction halfway through, take from here.', '主线读完，或中途对某个方向上瘾，从这里取。'],
  'lib.search': ['Search titles or authors', '搜书名或作者'],
  'lib.dirs': ['Directions', '方向'],
  'lib.all': ['All', '全部'],
  'lib.marked': ['Picked by several lists', '多份推荐选中'],
  'lib.main': ['Mainline', '主线'],
  'lib.unread': ['Not read yet', '还没读'],
  'lib.count': [(n) => `${n} ${n === 1 ? 'book' : 'books'}`, (n) => `${n} 本`],
  'lib.empty': [
    'No books here yet. Try another filter, or <a href="#recommend">recommend one</a>.',
    '这里还没有书。换个筛选条件，或者<a href="#recommend">推荐一本</a>。',
  ],
  'lib.groupMain': ['Mainline', '主线'],
  'lib.groupRest': ['Further reading', '延伸'],
  'lib.more': [
    (a, left) => `Show ${a} more<span class="muted small"> (${left} left)</span>`,
    (a, left) => `再看 ${a} 本<span class="muted small">（还有 ${left} 本）</span>`,
  ],

  'tag.main': [(n) => `Mainline ${n}`, (n) => `主线 ${n}`],
  'tag.optional': ['Into the world', '入世之书'],
  'tag.mark3': ['Picked by all three lists', '三份推荐都选了'],
  'tag.mark2': ['Picked by two lists', '两份推荐选了'],
  'aria.check': [(t) => `Mark ${t} as read`, (t) => `标记《${t}》已读`],

  'modal.main': [(n, s) => `Mainline book ${n} · ${s}`, (n, s) => `主线第 ${n} 本 · ${s}`],
  'modal.optional': [(n) => `Into-the-world pick, season ${n}`, (n) => `第${n}季入世之书`],
  'modal.q': ['Read with this question', '带着这个问题读'],
  'modal.unread': ['Mark as unread', '取消已读'],
  'modal.read': ['I’ve finished it', '我读完了'],
  'modal.find': ['Find it on Goodreads', '在豆瓣找这本书'],

  'nav.log': ['Log', '轨迹'],
  'log.kicker': ['Flight log', '航行日志'],
  'log.title': ['Your reading, day by day', '你的阅读轨迹'],
  'log.sub': [
    'Open any book and log where you are: a page or a percentage. Each book gets its own progress curve, and the days add up to months and years here.',
    '打开任何一本书，记下读到哪了：页码或百分比都行。每本书有自己的进度曲线，每天的记录在这里汇成每月、每年。',
  ],
  'log.prevYear': ['Previous year', '上一年'],
  'log.nextYear': ['Next year', '下一年'],
  'log.kFinished': ['books finished', '本读完'],
  'log.kPages': ['pages read', '页已读'],
  'log.kShare': ['books’ worth read', '本书的量'],
  'log.kDays': ['reading days', '天在读'],
  'log.kStreak': ['day streak', '天连续'],
  'log.heat': [(y) => `Reading days in ${y}`, (y) => `${y} 年的阅读日`],
  'log.months': [(y) => `By month, ${y}`, (y) => `${y} 年每月`],
  'log.monthsPages': ['pages read per month', '每月读的页数'],
  'log.monthsShare': ['books’ worth read per month', '每月读完的书量'],
  'log.now': ['Reading now', '正在读'],
  'log.done': [(y) => `Finished in ${y}`, (y) => `${y} 年读完`],
  'log.years': ['Every year', '历年'],
  'log.yearRow': [(f, p) => `${f} finished${p ? ` · ${p} pages` : ''}`, (f, p) => `读完 ${f} 本${p ? ` · ${p} 页` : ''}`],
  'log.emptyNow': ['Nothing in progress. Open a book and log your first page.', '还没有在读的书。打开一本书，记下第一页。'],
  'log.emptyDone': ['No books finished this year yet.', '这一年还没有读完的书。'],
  'log.lastRead': [(a) => `last read ${a}`, (a) => `上次读：${a}`],
  'log.dayTip': [(day, pages, list) => `${day}${pages ? ` · ${pages} pages` : ''}\n${list}`, (day, pages, list) => `${day}${pages ? ` · ${pages} 页` : ''}\n${list}`],
  'log.monthTip': [
    (m, v, unit, f) => `${m}: ${v} ${unit}${f ? ` · ${f} finished` : ''}`,
    (m, v, unit, f) => `${m}：${v} ${unit}${f ? ` · 读完 ${f} 本` : ''}`,
  ],
  'log.unitPages': ['pages', '页'],
  'log.unitShare': ['books', '本'],
  'log.marked': ['marked read', '标记读完'],

  'prog.title': ['Progress', '阅读进度'],
  'prog.start': ['Started', '开始'],
  'prog.done': ['Finished', '读完'],
  'prog.total': ['Pages', '总页数'],
  'prog.totalPh': ['optional', '可不填'],
  'prog.day': ['Day', '日期'],
  'prog.at': ['I’m at', '读到'],
  'prog.page': ['page', '页'],
  'prog.pct': ['%', '%'],
  'prog.save': ['Log it', '记一笔'],
  'prog.needPages': ['Set the page count to log by page, or log a percentage.', '要按页码记，先填总页数；也可以直接记百分比。'],
  'prog.bad': ['Enter a page or a percentage.', '填一个页码或百分比。'],
  'prog.summary': [
    (pct, days, page, total) => `${pct}% read${page != null && total ? ` · page ${page} of ${total}` : ''} · ${days} ${days === 1 ? 'day' : 'days'} logged`,
    (pct, days, page, total) => `已读 ${pct}%${page != null && total ? ` · 第 ${page} / ${total} 页` : ''} · 记了 ${days} 天`,
  ],
  'prog.none': ['Nothing logged yet. Log where you are and the curve starts here.', '还没有记录。记下读到哪，曲线从这里开始。'],
  'prog.curve': [(t) => `Progress curve for ${t}`, (t) => `《${t}》的进度曲线`],
  'prog.pointTip': [
    (day, pct, page, gain, gainPages) => `${day} · ${pct}%${page != null ? ` · p. ${page}` : ''}\n+${gainPages != null ? `${gainPages} pages` : `${gain}%`} that day`,
    (day, pct, page, gain, gainPages) => `${day} · ${pct}%${page != null ? ` · 第 ${page} 页` : ''}\n当天 +${gainPages != null ? `${gainPages} 页` : `${gain}%`}`,
  ],
  'prog.history': ['Log', '记录'],
  'prog.del': [(d) => `Delete the entry for ${d}`, (d) => `删除 ${d} 的记录`],
  'prog.autoDone': ['That’s 100%: marked as read.', '到 100% 了，已标记读完。'],

  'rec.kicker': ['Add a star', '添一颗星'],
  'rec.title': ['Recommend a good book', '推荐一本好书'],
  'rec.lede': ['This library welcomes books from anyone. A book that meets at least two of the criteria below belongs here.', '这座书房欢迎任何人添书。一本书至少满足下面两条，就值得放进来。'],
  'rec.c1': ['Density of thought', '思想密度'],
  'rec.c1d': ['After reading it, you see the world through a lens you can never take off.', '读完之后，看世界多了一个再也摘不掉的镜头。'],
  'rec.c2': ['Density of beauty', '审美密度'],
  'rec.c2d': ['The sentences themselves are worth reading slowly, rereading and copying out.', '句子本身值得慢读、重读、抄下来。'],
  'rec.c3': ['Density of life', '生命密度'],
  'rec.c3d': ['A real or fictional person lays a whole life open before you.', '一个真实或虚构的人，把一生摊开给你看。'],
  'rec.no': [
    'Not accepted: bestsellers with one idea stretched over three hundred pages, chicken soup for the soul, “Understand Y in X minutes”.',
    '不收：只有一个观点却写了三百页的畅销书、鸡汤、"X 分钟读懂 Y"。',
  ],
  'rec.btn': ['Recommend on GitHub', '在 GitHub 上荐书'],
  'rec.star': ['Star this project', '收藏这个项目'],
  'rec.note': ['Recommending opens a GitHub issue form and needs a GitHub account.', '荐书会打开一个 GitHub issue 表单，需要 GitHub 账号。'],

  'foot.quote': [
    'The truly sexy mind is not the one that has stored the most knowledge, but the one that always keeps its own independent judgment.',
    '真正性感的大脑，不是储存了最多知识的大脑，而是始终拥有自己独立判断的大脑。',
  ],
  'foot.note': [
    'Reading progress is saved only in your own browser unless you turn on sync with the cloud icon at the top right. The list updates automatically from <a id="mdLink" target="_blank" rel="noopener">书单.md</a>.',
    '阅读进度默认只保存在你自己的浏览器里；点右上角的云图标可以开启跨设备同步。书单随 <a id="mdLink" target="_blank" rel="noopener">书单.md</a> 自动更新。',
  ],

  'sync.titleOn': ['Sync across devices is on', '跨设备同步已开启'],
  'sync.btnError': [(e) => `Sync error: ${e}`, (e) => `同步出错：${e}`],
  'sync.introOn': [
    (n) => `Your ${n} read ${n === 1 ? 'mark is' : 'marks are'} and your reading log are saved in a secret Gist in your own GitHub account. Changes on this device upload within a few seconds.`,
    (n) => `你的 ${n} 条已读记录和阅读日志保存在你自己 GitHub 账号下的一个私密 Gist 里。在这台设备上的改动会在几秒内上传。`,
  ],
  'sync.status': ['Status', '状态'],
  'sync.busy': ['Syncing…', '正在同步…'],
  'sync.last': [(a) => `Last synced ${a}`, (a) => `上次同步：${a}`],
  'sync.never': ['Not synced yet', '还没同步过'],
  'sync.file': ['Sync file', '同步文件'],
  'sync.view': ['View on GitHub', '在 GitHub 上查看'],
  'sync.other': ['On another device: open this site, click the cloud icon at the top right and paste the same token.', '在另一台设备上：打开这个网站，点右上角的云图标，填同一个 token。'],
  'sync.now': ['Sync now', '立即同步'],
  'sync.off': ['Disconnect this device', '在这台设备上断开'],
  'sync.offNote': ['Disconnecting only removes the token from this device. Your marks here and in the cloud are kept.', '断开只会从这台设备删除 token，这里和云端的记录都会保留。'],
  'sync.titleOff': ['See the same progress on every device', '在所有设备上看到同一份进度'],
  'sync.introOff': [
    'Read marks and your reading log live only in this browser by default. Turn on sync and they’re saved in a secret Gist in your own GitHub account, so your phone and computer see the same progress.',
    '已读记录和阅读日志默认只存在这个浏览器里。开启同步后，它们会保存在你自己 GitHub 账号下的一个私密 Gist 里，手机和电脑看到同一份。',
  ],
  'sync.step1': [
    (url) => `<a href="${url}" target="_blank" rel="noopener">Create a token on GitHub</a>. Tick only the <b>gist</b> scope; you can set it to expire.`,
    (url) => `<a href="${url}" target="_blank" rel="noopener">在 GitHub 上生成一个 token</a>。权限只勾 <b>gist</b>，可以设置过期时间。`,
  ],
  'sync.step2': ['Paste it below. Use the same token on every device.', '把它贴到下面。每台设备填同一个 token。'],
  'sync.on': ['Turn on sync', '开启同步'],
  'sync.connecting': ['Connecting…', '正在连接…'],
  'sync.tokenNote': [
    'The token is stored only in this browser and is only ever sent to api.github.com. It has gist access only and can’t touch your repositories.',
    'Token 只保存在这个浏览器里，只会发给 api.github.com。它只有 gist 权限，碰不到你的仓库。',
  ],
  'sync.justNow': ['just now', '刚刚'],
  'sync.min': [(m) => `${m} min ago`, (m) => `${m} 分钟前`],
  'sync.hour': [(h) => `${h} h ago`, (h) => `${h} 小时前`],
  'err.offline': ['Can’t reach GitHub. Check your connection and try again.', '连不上 GitHub，请检查网络后重试。'],
  'err.token': ['The token is invalid or has expired. Please create a new one.', 'Token 无效或已过期，请重新生成一个。'],
  'err.scope': ['The token has no gist access, or the sync file was deleted.', 'Token 没有 gist 权限，或同步文件已被删除。'],
  'err.http': [(s) => `GitHub answered ${s}. Please try again later.`, (s) => `GitHub 返回了 ${s}，请稍后重试。`],
};

/** ?lang= in the address wins, then the visitor's saved choice, then English. */
function initialLang() {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'zh' || q === 'en') return q;
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}').lang;
    if (s === 'zh' || s === 'en') return s;
  } catch {}
  return 'en';
}

export let lang = initialLang();

export function t(key, ...args) {
  const pair = T[key];
  if (!pair) return key;
  const v = pair[lang === 'zh' ? 1 : 0];
  return typeof v === 'function' ? v(...args) : v;
}

/** A sync error is stored as a code ("offline", "http:502"); anything else is shown as it is. */
export function errorText(code) {
  const [k, arg] = String(code).split(':');
  return T[`err.${k}`] ? t(`err.${k}`, arg) : String(code);
}

export function setLang(l) {
  lang = l === 'zh' ? 'zh' : 'en';
  applyStatic();
}

/** Puts the current language into every marked element of the static page. */
export function applyStatic(root = document) {
  const html = document.documentElement;
  html.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.title = t('meta.title');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('meta.desc'));
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll('[data-i18n-attr]'))
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  // The title: words in English, characters in Chinese, each landing on its own beat.
  const h1 = document.querySelector('h1');
  if (h1) {
    const text = t('hero.h1');
    const parts = lang === 'zh' ? [...text] : text.split(' ');
    h1.setAttribute('aria-label', text);
    h1.classList.toggle('words', lang !== 'zh');
    h1.innerHTML = parts.map((p, i) => `<span style="--i: ${i}">${p}</span>`).join('');
  }
}
