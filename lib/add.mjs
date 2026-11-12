import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dirFor, readCatalogue, writeIndex } from './index.mjs';
import { rewriteImageUrls } from './migrate.mjs';
import { validate } from './validate.mjs';
import { screenshot } from './shot.mjs';

export const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const TYPES = ['layout', 'section', 'header', 'footer'];
const IMAGE_URL = /https?:\/\/[^"'\s\\()<>]+\.(?:jpe?g|png|gif|webp|svg|avif|ico|mp4|webm)\b/gi;

// Absolute image URLs (and base_domain values) that are not on R2.
export function foreignImages(json, r2Base) {
  const found = new Set();
  for (const m of json.replaceAll('\\/', '/').matchAll(IMAGE_URL)) {
    if (!m[0].startsWith(`${r2Base}/`)) found.add(m[0]);
  }
  for (const m of json.replaceAll('\\/', '/').matchAll(/"base_domain"\s*:\s*"([^"]+)"/g)) {
    if (m[1].replace(/\/$/, '') !== r2Base) found.add(`base_domain ${m[1]}`);
  }
  return [...found];
}

export async function addTemplate(root, opts, r2Base) {
  r2Base = r2Base.replace(/\/$/, '');
  for (const k of ['file', 'type', 'title', 'license']) {
    if (!opts[k]) throw new Error(`--${k} is required`);
  }
  if (!TYPES.includes(opts.type)) throw new Error(`--type must be one of ${TYPES.join(', ')}`);
  if (!['free', 'pro'].includes(opts.license)) throw new Error('--license must be free or pro');
  if (!opts.shot && !opts.thumb) throw new Error('give --shot <url> or --thumb <path.jpg>');

  const slug = opts.slug || slugify(opts.title);
  if (!slug) throw new Error('could not derive a slug, pass --slug');
  const cat = readCatalogue(root);
  if (cat.templates[slug]) throw new Error(`slug "${slug}" already exists in the catalogue`);

  const raw = readFileSync(opts.file, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${opts.file} is not valid JSON`);
  }
  if (!parsed || typeof parsed !== 'object' || !('data' in parsed)) {
    throw new Error(`${opts.file} has no top-level "data" key, export it from My Templates`);
  }
  const { json } = rewriteImageUrls(raw, r2Base);
  const foreign = foreignImages(json, r2Base);
  if (foreign.length) {
    throw new Error(
      `images not on R2 (use images from the library):\n${foreign.map((u) => `  ${u}`).join('\n')}`,
    );
  }

  // thumbnail first, so a failed screenshot leaves the repo untouched
  mkdirSync(join(root, 'thumbs'), { recursive: true });
  const thumbPath = join(root, 'thumbs', `${slug}.jpg`);
  if (opts.thumb) copyFileSync(opts.thumb, thumbPath);
  else await screenshot(opts.shot, opts.type, thumbPath);

  const dir = join(root, dirFor(opts.type));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${slug}.json`), JSON.stringify(JSON.parse(json), null, 2));

  const tags = (opts.tags ? opts.tags.split(',') : [])
    .map((t) => t.trim())
    .filter(Boolean)
    .map((title) => {
      let tag = cat.itemTags.find((x) => x.title.toLowerCase() === title.toLowerCase());
      if (!tag) {
        const id = String(Math.max(0, ...cat.itemTags.map((x) => Number(x.id) || 0)) + 1);
        tag = { id, title, alias: slugify(title) };
        cat.itemTags.push(tag);
      }
      return { id: tag.id, title: tag.title, alias: tag.alias };
    });
  const alias = opts['category-alias'] || (opts['category-title'] ? slugify(opts['category-title']) : '');
  const known = Object.values(cat.templates).find((t) => t.category_alias === alias && alias);
  cat.templates[slug] = {
    legacy_id: null,
    type: opts.type,
    title: opts.title,
    category_title: opts['category-title'] || known?.category_title || '',
    category_alias: alias,
    catid: known?.catid ?? '',
    tags,
    pack: opts.pack || '',
    license: opts.license,
    min_version: opts['min-version'] || '4.0.0',
    featured: '0',
    previewurl: '',
  };
  writeFileSync(join(root, 'meta/catalogue.json'), JSON.stringify(cat, null, 2));

  writeIndex(root, r2Base);
  const errors = await validate(root, { r2Base, checkRemote: false });
  return { slug, errors };
}
