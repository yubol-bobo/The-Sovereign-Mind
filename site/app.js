// The Sovereign Mind — page logic. Data comes from data/books.json (generated from 书单.md,
// with English from booklist.en.json). Words on the page come from i18n.js.
import { lang, t, setLang, applyStatic, errorText } from './i18n.js';

const REPO = 'yubol-bobo/The-Sovereign-Mind';
const STORE_KEY = 'sovereign-mind:v1';
const PAGE = 24; // library cards shown before "show more"

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const CHECK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- state ---------- */
let state = { read: {}, unread: {}, theme: 'dark' };
try {
  state = { ...state, ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') };
} catch {}
const save = () => {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {}
};

// Words first, so a Chinese reader never waits on English while the list loads.
applyStatic();

const data = await fetch('./data/books.json').then((r) => r.json());
const { directions, seasons, books } = data;
const dirById = Object.fromEntries(directions.map((d) => [d.id, d]));
const byTitle = Object.fromEntries(books.map((b) => [b.title, b]));
const mainline = books.filter((b) => b.main).sort((a, b) => a.main - b.main);
const color = (b) => `var(--p-${dirById[b.dir].color})`;
const isRead = (b) => !!state.read[b.key];

/* ---------- the list in the reader's language (the Chinese original stays as written) ---------- */
const zh = () => lang === 'zh';
/** title (zh with 《》), short (for spines and labels), author, note */
const bt = (b) =>
  zh() || !b.en
    ? { title: b.title, short: b.key, author: b.author, note: b.note }
    : { title: b.en.title, short: b.en.title, author: b.en.author, note: b.en.note };
const dt = (d) => (zh() || !d.en ? d : { ...d, ...d.en });
const seasonByName = Object.fromEntries(seasons.map((s) => [s.name, s]));
const st = (s) => (zh() || !s.en ? s : { ...s, ...s.en });
const seasonName = (name) => st(seasonByName[name] || { name }).name;
const groupName = (b) => (zh() ? b.group : b.groupEn || b.group);
const shortAuthor = (b) => bt(b).author.replace(/（.*$/, '');

/**
 * Progress is stored under each book's stable key. Older versions stored it under the full title,
 * and a renamed book lists its old keys as aliases: move both onto the current key.
 * The newer of a read and an unread mark wins.
 */
function migrate(m) {
  m.read ??= {};
  m.unread ??= {};
  for (const b of books)
    for (const old of [b.title, ...(b.aliases || [])]) {
      if (old === b.key) continue;
      for (const kind of ['read', 'unread']) {
        const t = m[kind][old];
        if (t == null) continue;
        if (!(m[kind][b.key] >= t)) m[kind][b.key] = t;
        delete m[kind][old];
      }
    }
  for (const k of Object.keys(m.read))
    if (m.unread[k] != null) {
      if (m.unread[k] > m.read[k]) delete m.read[k];
      else delete m.unread[k];
    }
  return m;
}
migrate(state);
save();

let view = { dir: 'all', filter: 'all', q: '', limit: PAGE };
let scene = null;
let sync = null;

/* ---------- links ---------- */
// #mdLink sits inside translated markup, so it's set again after each language switch.
function setLinks() {
  $('#repoLink').href = `https://github.com/${REPO}`;
  $('#starLink').href = `https://github.com/${REPO}`;
  $('#mdLink').href = `https://github.com/${REPO}/blob/main/%E4%B9%A6%E5%8D%95.md`;
  $('#recLink').href = `https://github.com/${REPO}/issues/new?template=recommend-a-book.yml`;
}
setLinks();

/* ---------- language: one click switches every word, and the choice is remembered ---------- */
$('#langBtn').addEventListener('click', () => {
  state.lang = zh() ? 'en' : 'zh';
  save();
  setLang(state.lang);
  // A ?lang= link would otherwise override the choice on the next visit.
  const u = new URL(location.href);
  if (u.searchParams.has('lang')) {
    u.searchParams.set('lang', state.lang);
    history.replaceState(history.state, '', u);
  }
  setLinks();
  if (document.documentElement.classList.contains('no-webgl')) $('#sceneHint').textContent = t('hero.hintShelf');
  renderAll();
  renderSync();
});

/* ---------- theme ---------- */
$('#themeBtn').addEventListener('click', () => {
  state.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = state.theme;
  save();
  scene?.setTheme(state.theme);
});

/* ---------- read toggling ---------- */
function toggleRead(b) {
  // Timestamps on both marks let two devices merge: the newer mark wins.
  if (isRead(b)) {
    delete state.read[b.key];
    state.unread[b.key] = Date.now();
  } else {
    state.read[b.key] = Date.now();
    delete state.unread[b.key];
  }
  save();
  renderAll();
  scene?.setRead(b.id, isRead(b));
  sync?.touch();
}

function checkBtn(b) {
  return `<button class="check" type="button" data-check="${b.id}" aria-pressed="${isRead(b)}" aria-label="${esc(t('aria.check', bt(b).short))}" style="--c:${color(b)}">${CHECK}</button>`;
}

/* ---------- hero ---------- */
let lastStats = null;
function renderHero() {
  const done = mainline.filter(isRead).length;
  const total = books.filter(isRead).length;
  const stats = [
    [mainline.length, t('stat.main')],
    [directions.length, t('stat.dirs')],
    [books.length, t('stat.books')],
    [total, t('stat.read')],
  ];
  $('#heroStats').innerHTML = stats.map(([n, l]) => `<div class="stat"><b data-to="${n}">${lastStats ? n : 0}</b><span>${l}</span></div>`).join('');
  if (!lastStats) countUp($('#heroStats'), 900);
  lastStats = stats;
  $('#menuStat').textContent = t('menu.statText', done, mainline.length);
  $('#hudLine').textContent = `SYS ONLINE // ${books.length} BOOKS · ${directions.length} SECTORS · ${total} LIT`;

  const next = mainline.find((b) => !isRead(b));
  $('#nextUp').innerHTML = next
    ? `<span class="n">${next.main}</span><span><small>${done ? t('next.next') : t('next.start')} · ${esc(seasonName(next.season))}</small><b>${esc(bt(next).title)}</b> <span class="muted small">${esc(bt(next).author)}</span></span><span class="go" aria-hidden="true">→</span>`
    : `<span class="n">✓</span><span><small>${t('next.done')}</small><b>${t('next.pick')}</b></span><span class="go" aria-hidden="true">→</span>`;
  $('#nextUp').dataset.open = next ? next.id : '';
}
function countUp(root, ms) {
  const els = [...root.querySelectorAll('[data-to]')];
  if (reduce) return els.forEach((el) => (el.textContent = el.dataset.to));
  const t0 = performance.now() + 700; // after the title has landed
  const step = (now) => {
    const k = Math.min(1, Math.max(0, (now - t0) / ms));
    const e = 1 - Math.pow(1 - k, 3);
    for (const el of els) if (el.isConnected) el.textContent = Math.round(el.dataset.to * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const openNext = () => {
  const id = $('#nextUp').dataset.open;
  if (id) openBook(books[id]);
  else $('#library').scrollIntoView();
};
$('#nextUp').addEventListener('click', openNext);
$('#nextUp').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    openNext();
  }
});

/* ---------- 2D shelf: stands in for the galaxy when the browser can't draw 3D ---------- */
function renderShelf() {
  const el = $('#heroShelf');
  if (el.hidden) return;
  el.innerHTML = seasons
    .map(
      (s) => `<div class="shelf-row"><small>${esc(st(s).name)}</small><div>${s.books
        .map((t) => byTitle[t])
        .map(
          (b) =>
            `<button class="mini-spine${isRead(b) ? ' read' : ''}" type="button" data-open="${b.id}" style="--c:${color(b)};--h:${70 + ((b.id * 37) % 30)}%" title="${esc(bt(b).title)}"><span>${esc(bt(b).short)}</span></button>`,
        )
        .join('')}</div></div>`,
    )
    .join('');
}

/* ---------- consensus ---------- */
function renderConsensus() {
  $('#consensus').innerHTML = books
    .filter((b) => b.mark === 3)
    .map(
      (b, i) =>
        `<button class="spine tilt${isRead(b) ? ' read' : ''}" type="button" data-open="${b.id}" data-reveal="star-${b.id}" style="--c:${color(b)};--i:${i}"><i class="orb" aria-hidden="true"></i><b>${esc(bt(b).short)}</b><span>${esc(shortAuthor(b))}</span></button>`,
    )
    .join('');
  observeReveals($('#consensus'));
}

/* ---------- mainline ---------- */
function renderMainline() {
  const done = mainline.filter(isRead).length;
  const C = 2 * Math.PI * 26;
  $('#mainRing').innerHTML = `
    <svg viewBox="0 0 62 62" role="img" aria-label="${esc(t('main.ring', done, mainline.length))}">
      <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--accent-2)"/><stop offset="1" stop-color="var(--p-violet)"/></linearGradient></defs>
      <circle class="track" cx="31" cy="31" r="26" fill="none" stroke-width="5"/>
      <circle class="bar" cx="31" cy="31" r="26" fill="none" stroke-width="5" stroke-linecap="round" transform="rotate(-90 31 31)" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - done / mainline.length)}"/>
      <text x="31" y="37" text-anchor="middle">${done}</text>
    </svg>
    <span><b>${done} / ${mainline.length}</b><span class="muted small">${t('main.read')}</span></span>`;

  $('#seasons').innerHTML = seasons
    .map((s, si) => {
      const list = s.books.map((t) => byTitle[t]);
      const n = list.filter(isRead).length;
      return `<div class="card season" data-reveal="season-${si}" style="--i:${si}">
        <div class="season-head">
          <small><span class="season-no">0${si + 1}</span>${esc(st(s).name)} · ${n} / ${list.length}</small>
          <h3>${esc(st(s).theme)}</h3>
          <div class="season-bar"><i style="width:${(n / list.length) * 100}%"></i></div>
        </div>
        ${list
          .map(
            (b, i) => `<div class="row${isRead(b) ? ' read' : ''}${i === 2 ? ' core-end' : ''}">
              ${checkBtn(b)}
              <button class="row-main" type="button" data-open="${b.id}"><b>${esc(bt(b).title)}</b><span>${esc(bt(b).author)}</span></button>
            </div>`,
          )
          .join('')}
      </div>`;
    })
    .join('');
  observeReveals($('#seasons'));
}

/* ---------- library ---------- */
function renderChips() {
  const chip = (id, name, c, n) =>
    `<button class="chip" type="button" role="tab" data-dir="${id}" aria-selected="${view.dir === id}" style="--c:${c}"><i></i>${name}<span class="num">${n}</span></button>`;
  $('#chips').innerHTML =
    chip('all', t('lib.all'), 'var(--ink-3)', books.length) +
    directions.map((d) => chip(d.id, esc(dt(d).name), `var(--p-${d.color})`, books.filter((b) => b.dir === d.id).length)).join('');

  const d = dirById[view.dir] && dt(dirById[view.dir]);
  const card = $('#dirCard');
  card.hidden = !d;
  if (d) {
    card.style.setProperty('--c', `var(--p-${d.color})`);
    card.innerHTML = `<span class="badge">${d.id}</span><div><h3>${esc(d.name)} · ${esc(d.sub)}</h3><q>${esc(d.question)}</q></div>`;
  }
}

function bookCard(b, i) {
  const d = dt(dirById[b.dir]);
  const x = bt(b);
  const tags = [];
  if (b.main) tags.push(`<span class="tag accent">${t('tag.main', b.main)}</span>`);
  if (b.optional) tags.push(`<span class="tag accent">${t('tag.optional')}</span>`);
  if (b.mark === 3) tags.push(`<span class="tag gold">${t('tag.mark3')}</span>`);
  if (b.mark === 2) tags.push(`<span class="tag gold">${t('tag.mark2')}</span>`);
  if (view.dir === 'all') tags.push(`<span class="tag dir">${esc(d.name)}</span>`);
  return `<article class="book tilt${isRead(b) ? ' read' : ''}" data-open="${b.id}" data-reveal="book-${b.id}" style="--c:${color(b)};--i:${i % 4}" tabindex="0" role="button" aria-label="${esc(x.title)}${zh() ? '，' : ', '}${esc(x.author)}">
    <div><h3>${esc(x.title)}</h3><p class="author">${esc(x.author)}</p></div>
    ${checkBtn(b)}
    <p class="note">${esc(x.note)}</p>
    ${tags.length ? `<div class="tags">${tags.join('')}</div>` : ''}
  </article>`;
}

function renderGrid() {
  const q = view.q.trim().toLowerCase();
  let list = books.filter((b) => view.dir === 'all' || b.dir === view.dir);
  if (view.filter === 'marked') list = list.filter((b) => b.mark);
  if (view.filter === 'main') list = list.filter((b) => b.main);
  if (view.filter === 'unread') list = list.filter((b) => !isRead(b));
  // Search finds a book by its Chinese or English title or author, whichever language is showing.
  if (q) list = list.filter((b) => [b.title, b.author, b.en?.title, b.en?.author].join(' ').toLowerCase().includes(q));

  $('#count').textContent = t('lib.count', list.length);
  $('#more').innerHTML = '';
  if (!list.length) {
    $('#grid').innerHTML = `<p class="empty">${t('lib.empty')}</p>`;
    return;
  }
  // Inside one direction, keep the shelf's own sub-groups; mainline books lead.
  let html = '';
  if (view.dir !== 'all' && !q) {
    const main = list.filter((b) => b.main);
    const rest = list.filter((b) => !b.main);
    let i = 0;
    if (main.length) html += `<div class="group-title">${t('lib.groupMain')}</div>` + main.map((b) => bookCard(b, i++)).join('');
    let g = null;
    for (const b of rest) {
      if (b.group !== g) {
        g = b.group;
        if (g || main.length) html += `<div class="group-title">${esc(g ? groupName(b) : t('lib.groupRest'))}</div>`;
      }
      html += bookCard(b, i++);
    }
  } else {
    // The flat list is long (161 books): show a page at a time.
    html = list.slice(0, view.limit).map(bookCard).join('');
    const left = list.length - view.limit;
    if (left > 0) $('#more').innerHTML = `<button class="btn ghost more" type="button" data-more>${t('lib.more', Math.min(left, PAGE), left)}</button>`;
  }
  $('#grid').innerHTML = html;
  observeReveals($('#grid'));
}
const resetPage = () => (view.limit = PAGE);

/* ---------- modal ---------- */
const modal = $('#modal');
let openId = null;
function openBook(b) {
  const d = dt(dirById[b.dir]);
  const x = bt(b);
  // Chinese readers search Douban by the Chinese title; English readers search Goodreads.
  const find = zh()
    ? `https://search.douban.com/book/subject_search?search_text=${encodeURIComponent(b.key.replace(/\+.*$/, ''))}`
    : `https://www.goodreads.com/search?q=${encodeURIComponent(`${x.title.split(' / ')[0]} ${x.author.split(/[,/]/)[0]}`)}`;
  openId = b.id;
  modal.style.setProperty('--c', color(b));
  $('#modalBody').innerHTML = `
    <div class="m-head">
      <span class="m-cover"></span>
      <div><h2 id="mTitle">${esc(x.title)}</h2><p class="muted">${esc(x.author)}</p></div>
    </div>
    <p class="m-note">${esc(x.note)}</p>
    <div class="tags">
      <span class="tag dir">${d.id} ${esc(d.name)}</span>
      ${b.main ? `<span class="tag accent">${esc(t('modal.main', b.main, seasonName(b.season)))}</span>` : ''}
      ${b.optional ? `<span class="tag accent">${esc(t('modal.optional', b.optional))}</span>` : ''}
      ${b.mark === 3 ? `<span class="tag gold">${t('tag.mark3')}</span>` : b.mark === 2 ? `<span class="tag gold">${t('tag.mark2')}</span>` : ''}
    </div>
    <div class="m-q"><b>${t('modal.q')}</b>${esc(d.question)}</div>
    <div class="m-actions">
      <button class="btn primary" type="button" data-check="${b.id}">${isRead(b) ? t('modal.unread') : t('modal.read')}</button>
      <a class="btn" target="_blank" rel="noopener" href="${find}">${t('modal.find')}</a>
    </div>`;
  if (!modal.open) modal.showModal();
}
modal.addEventListener('click', (e) => {
  if (e.target === modal) modal.close();
});

/* ---------- events ---------- */
document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-check]');
  if (c) {
    e.stopPropagation();
    const b = books[c.dataset.check];
    toggleRead(b);
    if (modal.open) openBook(b);
    return;
  }
  const o = e.target.closest('[data-open]');
  if (o && o.id !== 'nextUp') return openBook(books[o.dataset.open]);
  const d = e.target.closest('[data-dir]');
  if (d) {
    view.dir = d.dataset.dir;
    resetPage();
    renderChips();
    renderGrid();
    scene?.focusDir(view.dir);
    d.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduce ? 'auto' : 'smooth' });
    return;
  }
  const f = e.target.closest('[data-f]');
  if (f) {
    view.filter = f.dataset.f;
    resetPage();
    document.querySelectorAll('[data-f]').forEach((p) => p.classList.toggle('on', p === f));
    renderGrid();
    return;
  }
  if (e.target.closest('[data-more]')) {
    const first = view.limit;
    view.limit += PAGE;
    renderGrid();
    $('#grid').children[first]?.focus({ preventScroll: true });
  }
});
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.book')) {
    e.preventDefault();
    openBook(books[e.target.dataset.open]);
  }
});
$('#q').addEventListener('input', (e) => {
  view.q = e.target.value;
  resetPage();
  renderGrid();
});

function renderAll() {
  if (modal.open && openId != null) openBook(books[openId]);
  renderHero();
  renderShelf();
  renderConsensus();
  renderMainline();
  renderChips();
  renderGrid();
}

/* ---------- motion: reveal on scroll, tilt on hover, scroll-linked camera ---------- */
// Elements re-rendered after a change (a book marked read) keep their revealed state by name.
const revealed = new Set();
const revealer =
  'IntersectionObserver' in window && !reduce
    ? new IntersectionObserver(
        (entries) => {
          for (const e of entries)
            if (e.isIntersecting) {
              e.target.classList.add('in');
              if (e.target.dataset.reveal) revealed.add(e.target.dataset.reveal);
              revealer.unobserve(e.target);
            }
        },
        { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
      )
    : null;
function observeReveals(root = document) {
  for (const el of root.querySelectorAll('[data-reveal]:not(.in)')) {
    if (!revealer || revealed.has(el.dataset.reveal)) el.classList.add('in');
    else revealer.observe(el);
  }
}

if (matchMedia('(hover: hover) and (pointer: fine)').matches && !reduce) {
  let tilted = null;
  document.addEventListener(
    'pointermove',
    (e) => {
      const el = e.target.closest?.('.tilt');
      if (tilted && tilted !== el) {
        tilted.style.removeProperty('--rx');
        tilted.style.removeProperty('--ry');
      }
      tilted = el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      el.style.setProperty('--rx', `${(0.5 - y) * 7}deg`);
      el.style.setProperty('--ry', `${(x - 0.5) * 9}deg`);
      el.style.setProperty('--mx', `${x * 100}%`);
      el.style.setProperty('--my', `${y * 100}%`);
    },
    { passive: true },
  );
}

/** Where the page is, for the 3D camera: 0 hero, 1 seven stars, 2 mainline, 3 library, 4 recommend.
    The camera holds at a section and glides to the next during the last screen before it arrives
    (a section arrives when its top passes 45% of the way down the screen). */
const stageSections = ['#stars', '#mainline', '#library', '#recommend'].map((s) => $(s));
function stageNow() {
  const y = scrollY + innerHeight * 0.45;
  const tops = [innerHeight * 0.45, ...stageSections.map((el) => el.getBoundingClientRect().top + scrollY)];
  let i = 0;
  while (i < tops.length - 1 && y >= tops[i + 1]) i++;
  if (i === tops.length - 1) return i;
  const win = Math.min(innerHeight * 0.9, tops[i + 1] - tops[i]);
  return i + Math.min(1, Math.max(0, (y - (tops[i + 1] - win)) / Math.max(1, win)));
}

let ticking = false;
const onScroll = () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const p = scrollY / Math.max(1, innerHeight);
    document.documentElement.style.setProperty('--p', Math.min(p, 1.5).toFixed(3));
    scene?.setStage(stageNow());
    document.body.classList.toggle('scrolled', scrollY > 8);
  });
};
addEventListener('scroll', onScroll, { passive: true });

renderAll();
observeReveals();
onScroll();
requestAnimationFrame(() => document.body.classList.add('ready'));

/* ---------- sync across devices (secret Gist on the reader's own GitHub) ---------- */
const syncModal = $('#syncModal');
const syncBtn = $('#syncBtn');
let syncStatus = { connected: false };
const ago = (time) => {
  const m = Math.round((Date.now() - time) / 60000);
  return m < 1 ? t('sync.justNow') : m < 60 ? t('sync.min', m) : m < 1440 ? t('sync.hour', Math.round(m / 60)) : new Date(time).toLocaleDateString(zh() ? 'zh-CN' : 'en');
};
let syncLoaded = false;
function renderSync(formError = '') {
  if (!syncLoaded) return; // sync.js is still loading
  const st = syncStatus;
  const err = st.error && errorText(st.error);
  syncBtn.dataset.state = st.error ? 'error' : st.busy ? 'busy' : st.connected ? 'on' : 'off';
  syncBtn.title = err ? t('sync.btnError', err) : st.connected ? t('sync.titleOn') : t('aria.sync');
  const n = books.filter(isRead).length;
  $('#syncBody').innerHTML = st.connected
    ? `<h2 id="sTitle">${t('sync.titleOn')}</h2>
       <p class="muted">${t('sync.introOn', n)}</p>
       <dl class="sync-facts">
         <dt>${t('sync.status')}</dt><dd class="${err ? 'bad' : ''}">${err ? esc(err) : st.busy ? t('sync.busy') : st.at ? t('sync.last', ago(st.at)) : t('sync.never')}</dd>
         <dt>${t('sync.file')}</dt><dd><a href="https://gist.github.com/${esc(st.gistId)}" target="_blank" rel="noopener">${t('sync.view')}</a></dd>
       </dl>
       <p class="muted small">${t('sync.other')}</p>
       <div class="m-actions">
         <button class="btn primary" type="button" data-sync="now" ${st.busy ? 'disabled' : ''}>${t('sync.now')}</button>
         <button class="btn" type="button" data-sync="off">${t('sync.off')}</button>
       </div>
       <p class="muted small">${t('sync.offNote')}</p>`
    : `<h2 id="sTitle">${t('sync.titleOff')}</h2>
       <p class="muted">${t('sync.introOff')}</p>
       <ol class="sync-steps">
         <li>${t('sync.step1', TOKEN_URL)}</li>
         <li>${t('sync.step2')}</li>
       </ol>
       <form id="syncForm" class="sync-form">
         <label for="syncToken">GitHub token</label>
         <input id="syncToken" type="password" autocomplete="off" spellcheck="false" placeholder="ghp_…" required minlength="10" />
         <p class="bad small" role="alert" ${formError ? '' : 'hidden'}>${esc(formError)}</p>
         <button class="btn primary" type="submit">${t('sync.on')}</button>
       </form>
       <p class="muted small">${t('sync.tokenNote')}</p>`;
}
const { createSync, TOKEN_URL } = await import('./sync.js');
syncLoaded = true;
sync = createSync({
  getLocal: () => ({ read: state.read, unread: state.unread }),
  normalize: migrate,
  setLocal: (m) => {
    const before = new Set(books.filter(isRead).map((b) => b.id));
    state.read = m.read;
    state.unread = m.unread;
    save();
    renderAll();
    for (const b of books) if (before.has(b.id) !== isRead(b)) scene?.setRead(b.id, isRead(b));
    if (modal.open) modal.close();
  },
  onStatus: (st) => {
    syncStatus = st;
    renderSync();
  },
});
syncBtn.addEventListener('click', () => {
  renderSync();
  syncModal.showModal();
});
syncModal.addEventListener('click', (e) => {
  if (e.target === syncModal) return syncModal.close();
  const a = e.target.closest('[data-sync]')?.dataset.sync;
  if (a === 'now') sync.now();
  if (a === 'off') sync.disconnect();
});
syncModal.addEventListener('submit', async (e) => {
  if (e.target.id !== 'syncForm') return;
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  btn.textContent = t('sync.connecting');
  try {
    await sync.connect($('#syncToken').value);
  } catch (err) {
    sync.disconnect();
    renderSync(errorText(err.message));
    $('#syncToken')?.focus();
  }
});

/* ---------- the 3D cosmos (the page is complete without it) ---------- */
// The scene needs WebGL 2. If the browser can't give it one, or the first frame fails, the page
// shows a 2D shelf instead and says why, in the console and on <html data-scene-error>.
function fallBack(err) {
  const why = err?.message || String(err || 'unknown error');
  console.warn('3D scene unavailable, showing the 2D shelf instead:', err);
  document.documentElement.classList.remove('has-webgl');
  document.documentElement.classList.add('no-webgl');
  document.documentElement.dataset.sceneError = why;
  scene = null;
  $('#cosmos').replaceChildren();
  $('#heroShelf').hidden = false;
  $('#sceneHint').textContent = t('hero.hintShelf');
  $('#sceneHint').title = t('hero.sceneError', why);
  renderShelf();
}
import('./scene.js')
  .then(({ mountScene }) => {
    scene = mountScene($('#cosmos'), $('#sceneTip'), {
      books,
      directions,
      read: new Set(books.filter(isRead).map((b) => b.key)),
      theme: document.documentElement.dataset.theme,
      onPick: (id) => openBook(books[id]),
      label: (b) => ({ title: bt(b).title, author: shortAuthor(b) }),
      onFail: fallBack,
    });
    scene.setStage(stageNow());
    if (view.dir !== 'all') scene.focusDir(view.dir);
    document.documentElement.classList.add('has-webgl');
  })
  .catch(fallBack);
