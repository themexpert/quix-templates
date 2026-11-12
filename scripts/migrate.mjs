// One-off migration of the template library from getquix.net.
// Every raw response is cached under migration/raw/, so a re-run (e.g. with the
// real R2_PUBLIC_BASE) works fully offline.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { dirFor, writeIndex } from '../lib/index.mjs';
import { validate } from '../lib/validate.mjs';
import { isStub, rewriteImageUrls, sha1, slugFor } from '../lib/migrate.mjs';

const r2Base = (process.env.R2_PUBLIC_BASE || '').replace(/\/$/, '');
if (!r2Base) {
  console.error('R2_PUBLIC_BASE is not set.');
  process.exit(1);
}

const root = process.cwd();
const HOST = 'https://getquix.net';
const ITEM = `${HOST}/index.php?option=com_quixblocks&view=item&format=json&code=1`;
const CATALOGUE = `${HOST}/index.php?option=com_quixblocks&view=category&format=json`;
const UA = { 'User-Agent': 'curl/8.7.1' };
const mig = join(root, 'migration');
const raw = join(mig, 'raw');

const ensure = (file) => mkdirSync(dirname(file), { recursive: true });
const safeDecode = (p) => {
  try {
    return decodeURIComponent(p);
  } catch {
    return p;
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(url) {
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      last = e;
      if (/HTTP 40[34]/.test(e.message)) break; // no point retrying
      await sleep(500 * attempt);
    }
  }
  throw new Error(`${url}: ${last.message}`);
}

async function cachedText(file, url, validJson = false) {
  if (existsSync(file)) return readFileSync(file, 'utf8');
  const text = (await request(url)).toString('utf8');
  if (validJson) JSON.parse(text); // never cache an error page
  ensure(file);
  writeFileSync(file, text);
  return text;
}

async function pool(items, limit, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

// 1. catalogue
const catalogue = JSON.parse(await cachedText(join(raw, 'catalogue.json'), CATALOGUE));
const allItems = catalogue.items;
console.log(`catalogue: ${allItems.length} items`);

// 2. stub hash: a Pro item fetched without auth=1
const firstPro = allItems.find((i) => i.license === 'pro');
const stubHash = sha1(await cachedText(join(raw, 'stub.json'), `${ITEM}&id=${firstPro.id}`));

// 3. item payloads
const payloads = new Map();
let stubs = 0;
const skipped = []; // items the source server cannot serve as JSON
await pool(allItems, 4, async (item) => {
  const pro = item.license === 'pro';
  const url = `${ITEM}&id=${item.id}${pro ? '&auth=1' : ''}`;
  let text;
  try {
    text = await cachedText(join(raw, 'items', `${item.id}.json`), url, true);
  } catch (e) {
    skipped.push({ id: item.id, alias: item.alias, title: item.title, error: e.message.slice(0, 120) });
    return;
  }
  if (pro && isStub(text, stubHash)) stubs++;
  payloads.set(item.id, text);
});
const items = allItems.filter((i) => payloads.has(i.id));
if (stubs) {
  console.error(`ABORT: ${stubs} Pro payload(s) are the Go Pro stub.`);
  process.exit(1);
}

// 4. rewrite + write payloads and catalogue
for (const dir of ['layouts', 'blocks']) rmSync(join(root, dir), { recursive: true, force: true });
writeFileSync(join(root, 'allowlist.json'), '[]');
const used = new Set();
const imagePaths = new Set(['images/sample.png']); // hard-coded by the builder
const templates = {};
const slugs = new Map();
for (const item of items) {
  const slug = slugFor(item, used);
  slugs.set(item.id, slug);
  const { json, paths } = rewriteImageUrls(payloads.get(item.id), r2Base);
  paths.forEach((p) => imagePaths.add(safeDecode(p)));
  const file = join(root, dirFor(item.type), `${slug}.json`);
  ensure(file);
  writeFileSync(file, json);
  templates[slug] = {
    legacy_id: item.id,
    type: item.type,
    title: item.title,
    category_title: item.category_title,
    category_alias: item.category_alias,
    catid: item.catid,
    tags: item.tags,
    pack: '',
    license: item.license,
    min_version: item.min_version,
    featured: item.featured,
    previewurl: item.previewurl?.startsWith('/') ? HOST + item.previewurl : item.previewurl || '',
  };
}
ensure(join(root, 'meta/catalogue.json'));
writeFileSync(
  join(root, 'meta/catalogue.json'),
  JSON.stringify(
    { itemTags: catalogue.itemTags, layout_category: catalogue.layout_category, templates },
    null,
    2,
  ),
);

// 5. thumbnails (index points at <r2>/thumbs/<slug>.jpg)
const missingThumbs = [];
await pool(items, 4, async (item) => {
  const slug = slugs.get(item.id);
  const out = join(mig, 'thumbs', `${slug}.jpg`);
  if (existsSync(out)) return;
  try {
    const buf = await request(item.images);
    ensure(out);
    if (/\.jpe?g(\?|$)/i.test(item.images)) writeFileSync(out, buf);
    else await sharp(buf).resize({ width: 600, withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(out);
  } catch (e) {
    missingThumbs.push({ slug, url: item.images, error: e.message });
  }
});

// 6. referenced images
const missingImages = [];
await pool([...imagePaths], 4, async (rel) => {
  const out = join(mig, rel);
  if (existsSync(out)) return;
  let err;
  for (const host of [HOST, 'https://quix.b-cdn.net']) {
    try {
      const buf = await request(`${host}/${rel.split('/').map(encodeURIComponent).join('/')}`);
      ensure(out);
      writeFileSync(out, buf);
      return;
    } catch (e) {
      err = e;
    }
  }
  missingImages.push({ path: rel, error: err.message });
});

// 7. allowlist the free templates that legitimately use Pro elements
const errors = await validate(root, { r2Base, checkRemote: false });
const allowlisted = [
  ...new Set(
    errors.map((e) => /^free template "(.+)" uses pro element /.exec(e)?.[1]).filter(Boolean),
  ),
].sort();
writeFileSync(join(root, 'allowlist.json'), JSON.stringify(allowlisted, null, 2));
writeIndex(root, r2Base);

const report = {
  items: items.length,
  catalogueItems: allItems.length,
  skipped,
  stubs,
  images: imagePaths.size - missingImages.length,
  missingImages: missingImages.sort((a, b) => a.path.localeCompare(b.path)),
  missingThumbs: missingThumbs.sort((a, b) => a.slug.localeCompare(b.slug)),
  allowlisted,
};
writeFileSync(join(mig, 'report.json'), JSON.stringify(report, null, 2));
console.log(
  `${items.length} items, ${stubs} stub, ${report.images} images, ` +
    `${missingImages.length} missing images, ${missingThumbs.length} missing thumbs, ` +
    `${allowlisted.length} allowlisted, report written`,
);
