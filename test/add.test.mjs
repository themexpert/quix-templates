import { test } from 'node:test';
import { existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { addTemplate } from '../lib/add.mjs';
import { fixture, readJson, writeJson, R2 } from '../test-support/helpers.mjs';

async function thumb() {
  const p = join(mkdtempSync(join(tmpdir(), 'qt-th-')), 't.jpg');
  await sharp({ create: { width: 10, height: 10, channels: 3, background: '#888' } }).jpeg().toFile(p);
  return p;
}
const payload = (extra = {}) => ({
  groups: [], title: 'Gamma', type: 'section',
  data: [{ slug: 'section', children: [{ slug: 'image', ...extra, children: [] }] }],
});
const exportFile = (dir, v) => { writeJson(dir, 'export.json', v); return join(dir, 'export.json'); };
const base = async (dir, v) => ({
  file: exportFile(dir, v), type: 'section', title: 'Gamma Hero!', license: 'pro', thumb: await thumb(),
});

test('add writes file, catalogue entry and index', async () => {
  const dir = fixture();
  const { slug, errors } = await addTemplate(dir, await base(dir, payload({
    src: 'https://getquix.net/images/a/b.jpg', base_domain: 'https://getquix.net/',
  })), R2);
  assert.equal(slug, 'gamma-hero');
  assert.deepEqual(errors, []);
  assert.ok(existsSync(join(dir, 'blocks/gamma-hero.json')));
  assert.ok(existsSync(join(dir, 'thumbs/gamma-hero.jpg')));
  const cat = readJson(dir, 'meta/catalogue.json').templates['gamma-hero'];
  assert.equal(cat.license, 'pro');
  assert.equal(cat.legacy_id, null);
  assert.equal(cat.min_version, '4.0.0');
  const saved = JSON.stringify(readJson(dir, 'blocks/gamma-hero.json'));
  assert.ok(saved.includes(`${R2}/images/a/b.jpg`) && !saved.includes('getquix.net'));
  assert.ok(readJson(dir, 'index.json').items.some((i) => i.id === 'gamma-hero'));
});

test('add refuses a duplicate slug', async () => {
  const dir = fixture();
  const o = await base(dir, payload());
  await addTemplate(dir, o, R2);
  await assert.rejects(addTemplate(dir, o, R2), /already exists/);
});

test('add refuses non-R2 remote images and writes nothing', async () => {
  const dir = fixture();
  const o = await base(dir, payload({ src: 'https://example.com/x.png' }));
  await assert.rejects(addTemplate(dir, o, R2), /example\.com\/x\.png/);
  assert.ok(!existsSync(join(dir, 'blocks/gamma-hero.json')));
});

test('add refuses a payload without data', async () => {
  const dir = fixture();
  const o = await base(dir, { title: 'x' });
  await assert.rejects(addTemplate(dir, o, R2), /data/);
});

test('add gives a new layout category its own catid inside the bundle', async () => {
  const dir = fixture();
  const opts = { ...(await base(dir, payload())), type: 'layout', title: 'Delta', 'category-title': 'Brand New' };
  const { slug, errors } = await addTemplate(dir, opts, R2);
  assert.deepEqual(errors, []);
  const entry = readJson(dir, 'meta/catalogue.json').templates[slug];
  assert.ok(entry.catid && entry.catid !== '5', `catid ${entry.catid}`);
  const item = readJson(dir, 'index.json').items.find((i) => i.id === slug);
  assert.equal(item.parent_category, '5');
});
