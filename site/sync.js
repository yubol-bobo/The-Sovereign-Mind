// Cross-device progress sync through a secret Gist on the reader's own GitHub account.
// The token never leaves this browser except in requests to api.github.com.
const API = 'https://api.github.com';
const FILE = 'sovereign-mind-sync.json';
const KEY = 'sovereign-mind:sync';
export const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=The%20Sovereign%20Mind%20sync';

const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
};
const store = (v) => {
  try {
    v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY);
  } catch {}
};

async function call(token, path, init = {}) {
  let r;
  try {
    r = await fetch(API + path, {
      ...init,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new Error('连不上 GitHub，请检查网络后重试。');
  }
  if (r.status === 401) throw new Error('Token 无效或已过期，请重新生成一个。');
  if (r.status === 403 || r.status === 404) throw new Error('Token 没有 gist 权限，或同步文件已被删除。');
  if (!r.ok) throw new Error(`GitHub 返回了 ${r.status}，请稍后重试。`);
  return r.json();
}

async function findGist(token) {
  for (let page = 1; page <= 5; page++) {
    const list = await call(token, `/gists?per_page=100&page=${page}`);
    const hit = list.find((g) => g.files && g.files[FILE]);
    if (hit) return hit.id;
    if (list.length < 100) break;
  }
  return null;
}

async function readGist(token, id) {
  const g = await call(token, `/gists/${id}`);
  const f = g.files[FILE];
  if (!f) return {};
  let text = f.content ?? '';
  if (f.truncated && f.raw_url) text = await (await fetch(f.raw_url)).text();
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/** Last write wins per book: a book is read if its newest "read" mark is newer than its newest "unread" mark. */
export function merge(a, b) {
  const pick = (x, y) => {
    const out = { ...x };
    for (const [k, t] of Object.entries(y || {})) if (!(out[k] >= t)) out[k] = t;
    return out;
  };
  const read = pick(a.read || {}, b.read);
  const unread = pick(a.unread || {}, b.unread);
  for (const k of Object.keys(read)) {
    if (unread[k] > read[k]) delete read[k];
    else delete unread[k];
  }
  return { read, unread };
}
const same = (a, b) => JSON.stringify([a.read, a.unread].map((o) => Object.entries(o || {}).sort())) === JSON.stringify([b.read, b.unread].map((o) => Object.entries(o || {}).sort()));

/**
 * @param getLocal  () => { read, unread }
 * @param setLocal  (merged) => void — called when the remote copy changed local progress
 * @param onStatus  (status) => void — { connected, busy, error, at, gistId }
 * @param normalize (progress) => progress — e.g. moves marks from old book keys to current ones
 */
export function createSync({ getLocal, setLocal, onStatus, normalize = (m) => m }) {
  let cfg = load();
  let busy = false;
  let again = false;
  let timer = 0;
  let error = '';
  const emit = () => onStatus({ connected: !!cfg, busy, error, at: cfg?.at ?? 0, gistId: cfg?.gistId ?? '' });

  async function run() {
    if (!cfg) return;
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    error = '';
    emit();
    try {
      const remote = await readGist(cfg.token, cfg.gistId);
      const local = getLocal();
      const merged = normalize(merge(local, remote));
      if (!same(merged, local)) setLocal(merged);
      if (!same(merged, remote)) {
        await call(cfg.token, `/gists/${cfg.gistId}`, {
          method: 'PATCH',
          body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify({ v: 1, ...merged }, null, 1) } } }),
        });
      }
      cfg.at = Date.now();
      store(cfg);
    } catch (e) {
      error = e.message;
    }
    busy = false;
    emit();
    if (again) {
      again = false;
      run();
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && cfg && Date.now() - (cfg.at || 0) > 30_000) run();
  });

  emit();
  if (cfg) run();

  return {
    /** Connects this browser. Reuses the reader's existing sync gist if there is one. */
    async connect(token) {
      token = token.trim();
      let gistId = await findGist(token);
      const found = !!gistId;
      if (!gistId) {
        const g = await call(token, '/gists', {
          method: 'POST',
          body: JSON.stringify({
            description: 'The Sovereign Mind — reading progress',
            public: false,
            files: { [FILE]: { content: JSON.stringify({ v: 1, read: {}, unread: {} }) } },
          }),
        });
        gistId = g.id;
      }
      cfg = { token, gistId, at: 0 };
      store(cfg);
      await run();
      if (error) throw new Error(error);
      return found;
    },
    disconnect() {
      cfg = null;
      error = '';
      store(null);
      emit();
    },
    /** Call after a local change; batches quick successive toggles into one write. */
    touch() {
      if (!cfg) return;
      clearTimeout(timer);
      timer = setTimeout(run, 1200);
    },
    now: run,
  };
}
