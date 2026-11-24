// Checks that text stays readable: every text colour token in site/styles.css must reach
// WCAG AA (4.5:1) against the page background and the card surface, in both themes.
// Text tinted with a direction colour is checked the way the CSS mixes it, on its tinted pill.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'site', 'styles.css'), 'utf8');
const block = (selector) => {
  const start = css.indexOf(`${selector} {`);
  return css.slice(start, css.indexOf('\n}', start));
};
const tokens = (text) => Object.fromEntries([...text.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
const light = tokens(block(':root'));
const dark = { ...light, ...tokens(block(":root[data-theme='dark']")) };

// sRGB <-> OKLab, for color-mix(in oklab, …)
const lin = (x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
const gam = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const toLab = (hex) => {
  const [r, g, b] = rgb(hex).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
};
const toHex = ([L, a, b]) => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const out = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return '#' + out.map((x) => Math.round(gam(Math.min(1, Math.max(0, x))) * 255).toString(16).padStart(2, '0')).join('');
};
const mix = (a, b, t) => toHex(toLab(a).map((v, i) => v * t + toLab(b)[i] * (1 - t)));
const luminance = (hex) => {
  const [r, g, b] = rgb(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

let bad = 0;
const check = (theme, label, fg, bg, min = 4.5) => {
  const r = contrast(fg, bg);
  if (r < min) {
    console.log(`✗ ${theme}: ${label} ${fg} on ${bg} is ${r.toFixed(2)}:1, needs ${min}:1`);
    bad++;
  }
};
for (const [theme, t] of [['light', light], ['dark', dark]]) {
  const grounds = { page: t.bg, card: t['surface-solid'] };
  for (const [where, ground] of Object.entries(grounds)) {
    for (const k of ['ink', 'ink-2', 'ink-3', 'accent', 'gold', 'good', 'bad']) check(theme, `--${k} on the ${where}`, t[k], ground);
    for (const [k, v] of Object.entries(t).filter(([k]) => k.startsWith('p-'))) {
      const text = mix(v, t['tint-to'], parseFloat(t['tint-mix']) / 100);
      check(theme, `text tinted --${k} on the ${where}`, text, ground);
      check(theme, `text tinted --${k} on its pill`, text, mix(v, ground, 0.14));
    }
  }
}
if (bad) process.exit(1);
console.log('✓ 两种主题下的文字颜色都够清楚（WCAG AA 4.5:1）');
