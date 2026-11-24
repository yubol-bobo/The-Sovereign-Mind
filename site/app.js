// The Sovereign Mind — page logic. Data comes from data/books.json (generated from 书单.md).

const REPO = 'yubol-bobo/The-Sovereign-Mind';
const STORE_KEY = 'sovereign-mind:v1';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const CHECK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

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

const data = await fetch('./data/books.json').then((r) => r.json());
const { directions, seasons, books } = data;
const dirById = Object.fromEntries(directions.map((d) => [d.id, d]));
const byTitle = Object.fromEntries(books.map((b) => [b.title, b]));
const mainline = books.filter((b) => b.main).sort((a, b) => a.main - b.main);
const color = (b) => `var(--p-${dirById[b.dir].color})`;
const isRead = (b) => !!state.read[b.title];

let view = { dir: 'all', filter: 'all', q: '' };
let scene = null;
let sync = null;

/* ---------- links ---------- */
$('#repoLink').href = `https://github.com/${REPO}`;
$('#starLink').href = `https://github.com/${REPO}`;
$('#mdLink').href = `https://github.com/${REPO}/blob/main/%E4%B9%A6%E5%8D%95.md`;
$('#recLink').href = `https://github.com/${REPO}/issues/new?template=recommend-a-book.yml`;

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
    delete state.read[b.title];
    state.unread[b.title] = Date.now();
  } else {
    state.read[b.title] = Date.now();
    delete state.unread[b.title];
  }
  save();
  renderAll();
  scene?.setRead(b.id, isRead(b));
  sync?.touch();
}

function checkBtn(b) {
  return `<button class="check" type="button" data-check="${b.id}" aria-pressed="${isRead(b)}" aria-label="标记《${esc(b.title.replace(/[《》]/g, ''))}》已读" style="--c:${color(b)}">${CHECK}</button>`;
}

/* ---------- hero ---------- */
function renderHero() {
  const done = mainline.filter(isRead).length;
  const total = books.filter(isRead).length;
  $('#heroStats').innerHTML = [
    [mainline.length, '本主线'],
    [directions.length, '个方向'],
    [books.length, '本藏书'],
    [total, '本已读'],
  ]
    .map(([n, l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`)
    .join('');
  $('#menuStat').textContent = `主线 ${done} / ${mainline.length}`;

  const next = mainline.find((b) => !isRead(b));
  $('#nextUp').innerHTML = next
    ? `<span class="n">${next.main}</span><span><small>${done ? '下一本' : '从这本开始'} · ${next.season}</small><b>${esc(next.title)}</b> <span class="muted small">${esc(next.author)}</span></span>`
    : `<span class="n">✓</span><span><small>主线读完了</small><b>去书房里挑下一本</b></span>`;
  $('#nextUp').dataset.open = next ? next.id : '';
}
$('#nextUp').addEventListener('click', (e) => {
  const id = e.currentTarget.dataset.open;
  if (id) openBook(books[id]);
  else $('#library').scrollIntoView();
});

/* ---------- consensus ---------- */
function renderConsensus() {
  $('#consensus').innerHTML = books
    .filter((b) => b.mark === 3)
    .map(
      (b) =>
        `<button class="spine${isRead(b) ? ' read' : ''}" type="button" data-open="${b.id}" style="--c:${color(b)}"><b>${esc(b.title.replace(/[《》]/g, ''))}</b><span>${esc(b.author.replace(/（.*$/, ''))}</span></button>`,
    )
    .join('');
}

/* ---------- mainline ---------- */
function renderMainline() {
  const done = mainline.filter(isRead).length;
  const C = 2 * Math.PI * 26;
  $('#mainRing').innerHTML = `
    <svg viewBox="0 0 62 62" role="img" aria-label="主线已读 ${done} / ${mainline.length}">
      <circle class="track" cx="31" cy="31" r="26" fill="none" stroke-width="6"/>
      <circle class="bar" cx="31" cy="31" r="26" fill="none" stroke-width="6" stroke-linecap="round" transform="rotate(-90 31 31)" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - done / mainline.length)}"/>
      <text x="31" y="37" text-anchor="middle">${done}</text>
    </svg>
    <span><b>${done} / ${mainline.length}</b><span class="muted small">主线已读</span></span>`;

  $('#seasons').innerHTML = seasons
    .map((s) => {
      const list = s.books.map((t) => byTitle[t]);
      const n = list.filter(isRead).length;
      return `<div class="card season">
        <div class="season-head">
          <small>${s.name} · ${n} / ${list.length}</small>
          <h3>${esc(s.theme)}</h3>
          <div class="season-bar"><i style="width:${(n / list.length) * 100}%"></i></div>
        </div>
        ${list
          .map(
            (b, i) => `<div class="row${isRead(b) ? ' read' : ''}${i === 2 ? ' core-end' : ''}">
              ${checkBtn(b)}
              <button class="row-main" type="button" data-open="${b.id}"><b>${esc(b.title)}</b><span>${esc(b.author)}</span></button>
            </div>`,
          )
          .join('')}
      </div>`;
    })
    .join('');
}

/* ---------- library ---------- */
function renderChips() {
  const chip = (id, name, c, n) =>
    `<button class="chip" type="button" role="tab" data-dir="${id}" aria-selected="${view.dir === id}" style="--c:${c}"><i></i>${name}<span class="num">${n}</span></button>`;
  $('#chips').innerHTML =
    chip('all', '全部', 'var(--ink-3)', books.length) +
    directions.map((d) => chip(d.id, d.name, `var(--p-${d.color})`, books.filter((b) => b.dir === d.id).length)).join('');

  const d = dirById[view.dir];
  const card = $('#dirCard');
  card.hidden = !d;
  if (d) {
    card.style.setProperty('--c', `var(--p-${d.color})`);
    card.innerHTML = `<span class="badge">${d.id}</span><div><h3>${esc(d.name)} · ${esc(d.sub)}</h3><q>${esc(d.question)}</q></div>`;
  }
}

function bookCard(b) {
  const d = dirById[b.dir];
  const tags = [];
  if (b.main) tags.push(`<span class="tag accent">主线 ${b.main}</span>`);
  if (b.optional) tags.push(`<span class="tag accent">入世之书</span>`);
  if (b.mark === 3) tags.push(`<span class="tag gold">三份推荐都选了</span>`);
  if (b.mark === 2) tags.push(`<span class="tag gold">两份推荐选了</span>`);
  if (view.dir === 'all') tags.push(`<span class="tag dir">${esc(d.name)}</span>`);
  return `<article class="book${isRead(b) ? ' read' : ''}" data-open="${b.id}" style="--c:${color(b)}" tabindex="0">
    <div><h3>${esc(b.title)}</h3><p class="author">${esc(b.author)}</p></div>
    ${checkBtn(b)}
    <p class="note">${esc(b.note)}</p>
    ${tags.length ? `<div class="tags">${tags.join('')}</div>` : ''}
  </article>`;
}

function renderGrid() {
  const q = view.q.trim().toLowerCase();
  let list = books.filter((b) => view.dir === 'all' || b.dir === view.dir);
  if (view.filter === 'marked') list = list.filter((b) => b.mark);
  if (view.filter === 'main') list = list.filter((b) => b.main);
  if (view.filter === 'unread') list = list.filter((b) => !isRead(b));
  if (q) list = list.filter((b) => (b.title + b.author).toLowerCase().includes(q));

  $('#count').textContent = `${list.length} 本`;
  if (!list.length) {
    $('#grid').innerHTML = `<p class="empty">这里还没有书。换个筛选条件，或者<a href="#recommend">推荐一本</a>。</p>`;
    return;
  }
  // Inside one direction, keep the shelf's own sub-groups; mainline books lead.
  let html = '';
  if (view.dir !== 'all' && !q) {
    const main = list.filter((b) => b.main);
    const rest = list.filter((b) => !b.main);
    if (main.length) html += `<div class="group-title">主线</div>` + main.map(bookCard).join('');
    let g = null;
    for (const b of rest) {
      if (b.group !== g) {
        g = b.group;
        if (g || main.length) html += `<div class="group-title">${esc(g || '延伸')}</div>`;
      }
      html += bookCard(b);
    }
  } else {
    html = list.map(bookCard).join('');
  }
  $('#grid').innerHTML = html;
}

/* ---------- modal ---------- */
const modal = $('#modal');
function openBook(b) {
  const d = dirById[b.dir];
  const name = b.title.replace(/[《》]/g, '').replace(/[（(].*$/, '').replace(/\+.*$/, '');
  modal.style.setProperty('--c', color(b));
  $('#modalBody').innerHTML = `
    <div class="m-head">
      <span class="m-cover"></span>
      <div><h2 id="mTitle">${esc(b.title)}</h2><p class="muted">${esc(b.author)}</p></div>
    </div>
    <p class="m-note">${esc(b.note)}</p>
    <div class="tags">
      <span class="tag dir">${d.id} ${esc(d.name)}</span>
      ${b.main ? `<span class="tag accent">主线第 ${b.main} 本 · ${b.season}</span>` : ''}
      ${b.optional ? `<span class="tag accent">第${b.optional}季入世之书</span>` : ''}
      ${b.mark === 3 ? `<span class="tag gold">三份推荐都选了</span>` : b.mark === 2 ? `<span class="tag gold">两份推荐选了</span>` : ''}
    </div>
    <div class="m-q"><b>带着这个问题读</b>${esc(d.question)}</div>
    <div class="m-actions">
      <button class="btn primary" type="button" data-check="${b.id}">${isRead(b) ? '取消已读' : '我读完了'}</button>
      <a class="btn" target="_blank" rel="noopener" href="https://search.douban.com/book/subject_search?search_text=${encodeURIComponent(name)}">在豆瓣找这本书</a>
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
    renderChips();
    renderGrid();
    scene?.focusDir(view.dir);
    return;
  }
  const f = e.target.closest('[data-f]');
  if (f) {
    view.filter = f.dataset.f;
    document.querySelectorAll('[data-f]').forEach((p) => p.classList.toggle('on', p === f));
    renderGrid();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches?.('.book')) openBook(books[e.target.dataset.open]);
});
$('#q').addEventListener('input', (e) => {
  view.q = e.target.value;
  renderGrid();
});

function renderAll() {
  renderHero();
  renderConsensus();
  renderMainline();
  renderChips();
  renderGrid();
}
renderAll();

/* ---------- sync across devices (secret Gist on the reader's own GitHub) ---------- */
const syncModal = $('#syncModal');
const syncBtn = $('#syncBtn');
let syncStatus = { connected: false };
const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? '刚刚' : m < 60 ? `${m} 分钟前` : m < 1440 ? `${Math.round(m / 60)} 小时前` : new Date(t).toLocaleDateString('zh-CN');
};
function renderSync(formError = '') {
  const st = syncStatus;
  syncBtn.dataset.state = st.error ? 'error' : st.busy ? 'busy' : st.connected ? 'on' : 'off';
  syncBtn.title = st.error ? `同步出错：${st.error}` : st.connected ? '跨设备同步已开启' : '跨设备同步';
  const n = Object.keys(state.read).length;
  $('#syncBody').innerHTML = st.connected
    ? `<h2 id="sTitle">跨设备同步已开启</h2>
       <p class="muted">你的 ${n} 条已读记录保存在你自己 GitHub 账号下的一个私密 Gist 里。在这台设备上的改动会在几秒内上传。</p>
       <dl class="sync-facts">
         <dt>状态</dt><dd class="${st.error ? 'bad' : ''}">${st.error ? esc(st.error) : st.busy ? '正在同步…' : st.at ? `上次同步：${ago(st.at)}` : '还没同步过'}</dd>
         <dt>同步文件</dt><dd><a href="https://gist.github.com/${esc(st.gistId)}" target="_blank" rel="noopener">在 GitHub 上查看</a></dd>
       </dl>
       <p class="muted small">在另一台设备上：打开这个网站，点右上角的云图标，填同一个 token。</p>
       <div class="m-actions">
         <button class="btn primary" type="button" data-sync="now" ${st.busy ? 'disabled' : ''}>立即同步</button>
         <button class="btn" type="button" data-sync="off">在这台设备上断开</button>
       </div>
       <p class="muted small">断开只会从这台设备删除 token，这里和云端的记录都会保留。</p>`
    : `<h2 id="sTitle">在所有设备上看到同一份进度</h2>
       <p class="muted">已读记录默认只存在这个浏览器里。开启同步后，它会保存在你自己 GitHub 账号下的一个私密 Gist 里，手机和电脑看到同一份。</p>
       <ol class="sync-steps">
         <li><a href="${TOKEN_URL}" target="_blank" rel="noopener">在 GitHub 上生成一个 token</a>。权限只勾 <b>gist</b>，可以设置过期时间。</li>
         <li>把它贴到下面。每台设备填同一个 token。</li>
       </ol>
       <form id="syncForm" class="sync-form">
         <label for="syncToken">GitHub token</label>
         <input id="syncToken" type="password" autocomplete="off" spellcheck="false" placeholder="ghp_…" required minlength="10" />
         <p class="bad small" role="alert" ${formError ? '' : 'hidden'}>${esc(formError)}</p>
         <button class="btn primary" type="submit">开启同步</button>
       </form>
       <p class="muted small">Token 只保存在这个浏览器里，只会发给 api.github.com。它只有 gist 权限，碰不到你的仓库。</p>`;
}
const { createSync, TOKEN_URL } = await import('./sync.js');
sync = createSync({
  getLocal: () => ({ read: state.read, unread: state.unread }),
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
  btn.textContent = '正在连接…';
  try {
    await sync.connect($('#syncToken').value);
  } catch (err) {
    sync.disconnect();
    renderSync(err.message);
    $('#syncToken')?.focus();
  }
});

/* ---------- 3D scene (lazy; the page is complete without it) ---------- */
import('./scene.js')
  .then(({ mountScene }) => {
    scene = mountScene($('#scene'), $('#sceneTip'), {
      books,
      directions,
      read: new Set(books.filter(isRead).map((b) => b.id)),
      theme: document.documentElement.dataset.theme,
      onPick: (id) => openBook(books[id]),
    });
  })
  .catch((err) => {
    console.warn('3D scene unavailable', err);
    document.querySelector('.hero').classList.add('no-scene');
  });
