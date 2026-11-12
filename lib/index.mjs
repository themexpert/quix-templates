import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const dirFor = (type) => (type === 'layout' ? 'layouts' : 'blocks');

export function readCatalogue(root) {
  return JSON.parse(readFileSync(join(root, 'meta/catalogue.json'), 'utf8'));
}

// getquix.net served layout_category as {id} (older data: [{id}]). The builder
// groups layouts into bundles by item.parent_category === layout_category.id.
export function layoutCategoryId(cat) {
  const lc = Array.isArray(cat.layout_category) ? cat.layout_category[0] : cat.layout_category;
  return String(lc?.id ?? '');
}

export function buildIndex(root, r2Base) {
  const cat = readCatalogue(root);
  const bundle = layoutCategoryId(cat);
  const items = Object.entries(cat.templates).map(([slug, meta]) => {
    const path = `${dirFor(meta.type)}/${slug}.json`;
    if (!existsSync(join(root, path))) {
      throw new Error(`no file for "${slug}" (expected ${path})`);
    }
    const parent_category = meta.parent_category || (meta.type === 'layout' ? bundle : '1');
    return { ...meta, parent_category, id: slug, alias: slug, path, images: `${r2Base}/thumbs/${slug}.jpg` };
  });
  items.sort(
    (x, y) =>
      Number(y.featured === '1') - Number(x.featured === '1') || x.title.localeCompare(y.title),
  );
  return {
    generated: new Date().toISOString(),
    itemTags: cat.itemTags,
    layout_category: cat.layout_category,
    items,
  };
}

export function writeIndex(root, r2Base) {
  const index = JSON.stringify(buildIndex(root, r2Base), null, 2);
  writeFileSync(join(root, 'index.json'), index);
  const hash = createHash('sha1').update(Buffer.from(index)).digest('hex');
  writeFileSync(join(root, 'index-hash.json'), JSON.stringify({ success: true, data: hash }));
  return { index, hash };
}
