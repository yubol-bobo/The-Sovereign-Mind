// Reading log: where you are in each book, day by day, and what that adds up to.
//
// The log lives beside the read marks in localStorage and, with sync on, in its own file in the
// reader's secret Gist. Every field carries the time it was written, so two devices merge field by
// field and the newer write wins (a deleted day is kept as a dated tombstone for the same reason).
//
//   log[bookKey] = {
//     total: { v: 320, t },               // pages in the edition you're reading (optional)
//     start: { v: '2026-11-02', t },      // the day you started (defaults to the first logged day)
//     done:  { v: '2026-11-20', t },      // the day you finished (defaults to the day you marked it read)
//     days:  { '2026-11-03': { pct: 12.5, page: 40, t } | { del: 1, t } },
//   }
//
// A day stores where you were by the end of it: a page (when the book has a page count) and the
// percentage that page was at the time. Pages read that day are the difference from the day before.

/* ---------- dates (the reader's own calendar day, not UTC) ---------- */
const pad = (n) => String(n).padStart(2, '0');
export const dayOf = (time = Date.now()) => {
  const d = new Date(time);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const today = () => dayOf();
const toDate = (day) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (day, n) => {
  const d = toDate(day);
  d.setDate(d.getDate() + n);
  return dayOf(d);
};
const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 864e5);
export const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/* ---------- writing ---------- */
const clampPct = (p) => Math.max(0, Math.min(100, Math.round(p * 10) / 10));
const field = (v, t = Date.now()) => ({ v, t });

export function bookLog(log, key) {
  return (log[key] ??= { days: {} });
}

/** Records where you were on `day`: a page number (needs the page count) or a percentage. */
export function logDay(log, key, day, { page, pct }) {
  const b = bookLog(log, key);
  const total = b.total?.v;
  const entry = { t: Date.now() };
  if (page != null && total) {
    entry.page = Math.max(0, Math.min(total, Math.round(page)));
    entry.pct = clampPct((entry.page / total) * 100);
  } else if (pct != null) {
    entry.pct = clampPct(pct);
    if (total) entry.page = Math.round((entry.pct / 100) * total);
  } else return null;
  b.days[day] = entry;
  if (!b.start?.v || day < b.start.v) b.start = field(day);
  return entry;
}

export function deleteDay(log, key, day) {
  const b = bookLog(log, key);
  if (b.days[day]) b.days[day] = { del: 1, t: Date.now() };
}

export function setField(log, key, name, v) {
  bookLog(log, key)[name] = field(v ?? null);
}

/* ---------- merging two copies (this device and the Gist) ---------- */
// Newer edit wins; an exact tie is settled by content, so both devices pick the same one.
const newer = (a, b) => {
  if (!a || !b) return a || b;
  const d = (b.t || 0) - (a.t || 0);
  return d > 0 || (d === 0 && JSON.stringify(b) > JSON.stringify(a)) ? b : a;
};

export function mergeLog(a = {}, b = {}) {
  const out = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[key] || {};
    const y = b[key] || {};
    const m = { days: {} };
    for (const f of ['total', 'start', 'done']) {
      const v = newer(x[f], y[f]);
      if (v) m[f] = v;
    }
    for (const d of new Set([...Object.keys(x.days || {}), ...Object.keys(y.days || {})])) m.days[d] = newer(x.days?.[d], y.days?.[d]);
    out[key] = m;
  }
  return out;
}

/** Moves a book's log from an old key to its current one (books renamed in 书单.md). */
export function moveKey(log, from, to) {
  if (!log[from] || from === to) return;
  log[to] = mergeLog({ [to]: log[from] }, { [to]: log[to] })[to];
  delete log[from];
}

/** Stable text of a log, for "did anything change?" */
export function logText(log = {}) {
  const sort = (o) =>
    o && typeof o === 'object' && !Array.isArray(o)
      ? Object.fromEntries(
          Object.keys(o)
            .sort()
            .map((k) => [k, sort(o[k])]),
        )
      : o;
  return JSON.stringify(sort(log));
}

/* ---------- reading the log ---------- */

/**
 * One book's story: its logged days in order with how far it moved each day, where it stands now,
 * and when it started and finished. `readAt` is the time it was marked read, if it was.
 */
export function bookStory(entry, readAt) {
  const total = entry?.total?.v || null;
  const days = Object.entries(entry?.days || {})
    .filter(([, e]) => e && !e.del)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  let prevPct = 0;
  let prevPage = 0;
  const points = days.map(([day, e]) => {
    // With a page count, the page is the truth (the count may have been set later).
    const pct = total && e.page != null ? clampPct((e.page / total) * 100) : e.pct ?? 0;
    const page = total ? (e.page != null ? e.page : Math.round((pct / 100) * total)) : null;
    const p = { day, pct, page, dPct: Math.max(0, pct - prevPct), dPages: total ? Math.max(0, page - prevPage) : null };
    prevPct = Math.max(prevPct, pct);
    if (page != null) prevPage = Math.max(prevPage, page);
    return p;
  });
  const last = points.at(-1);
  const pct = readAt ? 100 : last ? last.pct : 0;
  const start = entry?.start?.v || points[0]?.day || null;
  const finished = readAt ? entry?.done?.v || dayOf(readAt) : null;
  return { total, points, pct, start, finished, lastDay: last?.day || null, page: last?.page ?? null };
}

/**
 * Everything the log adds up to, by day, month and year.
 * `books` are { key, readAt } (readAt = when it was marked read, or 0).
 * Pages count only for books with a page count; "books' worth" counts every book by its share read.
 */
export function rollup(log, books) {
  const byDay = {};
  const finished = [];
  for (const b of books) {
    const s = bookStory(log[b.key], b.readAt);
    for (const p of s.points) {
      const d = (byDay[p.day] ??= { pages: 0, share: 0, books: [] });
      d.pages += p.dPages || 0;
      d.share += p.dPct / 100;
      if (p.dPct > 0 || p.dPages > 0) d.books.push({ key: b.key, pages: p.dPages, dPct: p.dPct, pct: p.pct });
    }
    if (s.finished) finished.push({ key: b.key, day: s.finished, logged: s.points.length > 0 });
  }
  const months = {};
  const years = {};
  const bucket = (o, k) => (o[k] ??= { pages: 0, share: 0, days: 0, finished: [] });
  for (const [day, d] of Object.entries(byDay)) {
    if (!d.books.length) continue;
    for (const o of [bucket(months, day.slice(0, 7)), bucket(years, day.slice(0, 4))]) {
      o.pages += d.pages;
      o.share += d.share;
      o.days += 1;
    }
  }
  for (const f of finished) {
    bucket(months, f.day.slice(0, 7)).finished.push(f);
    bucket(years, f.day.slice(0, 4)).finished.push(f);
  }
  return { byDay, months, years, finished };
}

/** Consecutive days with reading, ending today (or yesterday, so the streak survives until tonight). */
export function streak(byDay, now = today()) {
  const read = (d) => byDay[d]?.books.length > 0;
  let d = read(now) ? now : addDays(now, -1);
  let n = 0;
  while (read(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/* ---------- charts (SVG strings; colors come from the page's CSS) ---------- */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const r1 = (n) => Math.round(n * 10) / 10;

/**
 * One book's progress curve: percent read over time, with the day's gain as a bar under each point.
 * The two parts share the time axis but have their own scales and labels (never one dual axis).
 */
export function curveSVG(story, { fmtDay, tipFor, label }) {
  const pts = story.points;
  if (!pts.length) return '';
  const W = 480;
  const H = 150;
  const BH = 34; // bar strip under the curve
  const L = 34;
  const R = 10;
  const T = 10;
  const first = story.start && story.start < pts[0].day ? story.start : pts[0].day;
  const lastDay = pts.at(-1).day;
  const span = Math.max(1, daysBetween(first, lastDay));
  const x = (day) => L + ((W - L - R) * daysBetween(first, day)) / span;
  const y = (pct) => T + (H - T) * (1 - pct / 100);
  const line = [[first, 0], ...pts.map((p) => [p.day, p.pct])];
  const path = line.map(([d, p], i) => `${i ? 'L' : 'M'}${r1(x(d))},${r1(y(p))}`).join('');
  const area = `${path}L${r1(x(lastDay))},${H}L${r1(x(first))},${H}Z`;
  const maxGain = Math.max(...pts.map((p) => p.dPct), 1);
  const bw = Math.max(3, Math.min(14, ((W - L - R) / (span + 1)) * 0.6));
  const grid = [0, 50, 100]
    .map((p) => `<line class="gl" x1="${L}" x2="${W - R}" y1="${r1(y(p))}" y2="${r1(y(p))}"/><text class="tick" x="${L - 6}" y="${r1(y(p)) + 4}" text-anchor="end">${p}%</text>`)
    .join('');
  const bars = pts
    .map((p) => {
      const h = (BH - 6) * (p.dPct / maxGain);
      return `<rect class="gain" x="${r1(x(p.day) - bw / 2)}" y="${r1(H + 6 + BH - 6 - h)}" width="${r1(bw)}" height="${r1(Math.max(h, 1.5))}" rx="2"/>`;
    })
    .join('');
  const dots = pts
    .map((p) => `<g class="pt" data-tip="${esc(tipFor(p))}"><circle class="hit" cx="${r1(x(p.day))}" cy="${r1(y(p.pct))}" r="11"/><circle class="dot" cx="${r1(x(p.day))}" cy="${r1(y(p.pct))}" r="4"/></g>`)
    .join('');
  return `<svg class="curve" viewBox="0 0 ${W} ${H + BH + 22}" role="img" aria-label="${esc(label)}">
    <defs><linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--chart-a)" stop-opacity=".35"/><stop offset="1" stop-color="var(--chart-a)" stop-opacity="0"/></linearGradient></defs>
    ${grid}
    <path class="area" d="${area}" fill="url(#curveFill)"/>
    <path class="line" d="${path}"/>
    ${bars}
    <text class="tick" x="${L}" y="${H + BH + 18}">${esc(fmtDay(first))}</text>
    <text class="tick" x="${W - R}" y="${H + BH + 18}" text-anchor="end">${esc(fmtDay(lastDay))}</text>
    ${dots}
  </svg>`;
}

/** A small curve for lists: no axes, just the shape. */
export function sparkSVG(story) {
  const pts = story.points;
  if (pts.length < 2) return '';
  const W = 90;
  const H = 26;
  const first = pts[0].day;
  const span = Math.max(1, daysBetween(first, pts.at(-1).day));
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${r1((W * daysBetween(first, p.day)) / span)},${r1(H - 2 - ((H - 4) * p.pct) / 100)}`).join('');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${d}"/></svg>`;
}

/**
 * A year of reading days, one cell per day (weeks run left to right, Monday at the top).
 * Brightness follows how much was read that day.
 */
export function heatSVG(byDay, year, { tipFor, label, now = today() }) {
  const jan1 = `${year}-01-01`;
  const offset = (toDate(jan1).getDay() + 6) % 7; // Monday = 0
  const days = daysBetween(jan1, `${year}-12-31`) + 1;
  const C = 11;
  const G = 3;
  const weeks = Math.ceil((days + offset) / 7);
  const effort = (d) => (d ? d.pages + d.share * 300 : 0); // pages, or a share of a typical 300-page book
  let max = 1;
  for (let i = 0; i < days; i++) max = Math.max(max, effort(byDay[addDays(jan1, i)]));
  let cells = '';
  let months = '';
  for (let i = 0; i < days; i++) {
    const day = addDays(jan1, i);
    const k = i + offset;
    const cx = Math.floor(k / 7) * (C + G);
    const cy = (k % 7) * (C + G) + 14;
    const d = byDay[day];
    const e = effort(d);
    const level = !d || !d.books.length ? 0 : Math.min(4, 1 + Math.floor((e / max) * 3.999));
    const future = day > now;
    cells += `<rect class="cell l${level}${future ? ' future' : ''}${day === now ? ' today' : ''}" x="${cx}" y="${cy}" width="${C}" height="${C}" rx="2.5"${level ? ` data-tip="${esc(tipFor(day, d))}"` : ''}/>`;
    if (day.endsWith('-01')) months += `<text class="tick" x="${cx}" y="9">${Number(day.slice(5, 7))}</text>`;
  }
  return `<svg class="heat" viewBox="0 0 ${weeks * (C + G)} ${14 + 7 * (C + G)}" role="img" aria-label="${esc(label)}">${months}${cells}</svg>`;
}

/** Twelve monthly bars for one measure (pages, or books' worth when no page counts are set). */
export function monthsSVG(values, { tipFor, label, monthName, current }) {
  const W = 480;
  const H = 150;
  const B = 22;
  const max = Math.max(...values, 0) || 1;
  const step = W / 12;
  const bw = step * 0.56;
  let out = `<line class="base" x1="0" x2="${W}" y1="${H - B}" y2="${H - B}"/>`;
  values.forEach((v, i) => {
    const h = ((H - B - 16) * v) / max;
    const x = i * step + (step - bw) / 2;
    out += `<g class="mbar${i === current ? ' now' : ''}" data-tip="${esc(tipFor(i, v))}">
      <rect class="hit" x="${r1(i * step)}" y="0" width="${r1(step)}" height="${H}"/>
      ${v > 0 ? `<rect class="bar" x="${r1(x)}" y="${r1(H - B - h)}" width="${r1(bw)}" height="${r1(h)}" rx="4"/>` : ''}
      <text class="tick" x="${r1(i * step + step / 2)}" y="${H - 6}" text-anchor="middle">${esc(monthName(i))}</text>
    </g>`;
  });
  return `<svg class="months" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${out}</svg>`;
}
