// Checks that every local file referenced from site/index.html, site/*.js and site/styles.css exists.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = join(dirname(fileURLToPath(import.meta.url)), '..', 'site');
const files = ['index.html', 'styles.css', ...readdirSync(site).filter((f) => f.endsWith('.js'))];
const refs = [
  /(?:href|src|content)="(\.\/[^"#?]+)"/g, // html attributes
  /url\(['"]?(\.\/[^'")]+)['"]?\)/g, // css
  /(?:import|from|fetch)\s*\(?\s*['"](\.\/[^'"]+)['"]/g, // js imports and fetches
];
let missing = 0;
for (const f of files) {
  const text = readFileSync(join(site, f), 'utf8');
  for (const re of refs)
    for (const [, ref] of text.matchAll(re)) {
      if (!existsSync(join(site, ref))) {
        console.log(`✗ site/${f} → ${ref} 不存在`);
        missing++;
      }
    }
}
if (missing) process.exit(1);
console.log('✓ 页面引用的本地文件都在');
