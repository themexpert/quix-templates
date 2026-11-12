import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildIndex, writeIndex } from '../lib/index.mjs';
import { fixture, R2 } from '../test-support/helpers.mjs';

test('builds item per catalogue entry', () => {
  const idx = buildIndex(fixture(), R2);
  assert.equal(idx.items.length, 2);
  const a = idx.items.find((i) => i.id === 'a');
  const b = idx.items.find((i) => i.id === 'b');
  assert.equal(a.path, 'layouts/a.json');
  assert.equal(b.path, 'blocks/b.json');
  assert.equal(a.images, 'https://r2.test/thumbs/a.jpg');
  assert.equal(a.alias, 'a');
  assert.equal(idx.items[0].id, 'b', 'featured first');
});

test('hash matches index bytes', () => {
  const dir = fixture();
  writeIndex(dir, R2);
  const bytes = readFileSync(join(dir, 'index.json'));
  const hash = JSON.parse(readFileSync(join(dir, 'index-hash.json'), 'utf8'));
  assert.equal(hash.success, true);
  assert.equal(hash.data, createHash('sha1').update(bytes).digest('hex'));
});

test('missing file for catalogue entry throws', () => {
  const dir = fixture();
  rmSync(join(dir, 'layouts/a.json'));
  rmSync(join(dir, 'blocks/b.json'));
  const cat = JSON.parse(readFileSync(join(dir, 'meta/catalogue.json'), 'utf8'));
  cat.templates.c = { ...cat.templates.a };
  delete cat.templates.a;
  delete cat.templates.b;
  assert.throws(() => {
    writeCat(dir, cat);
    buildIndex(dir, R2);
  }, /no file for "c"/);
});

function writeCat(dir, cat) {
  writeFileSync(join(dir, 'meta/catalogue.json'), JSON.stringify(cat));
}

test('layouts carry the bundle parent_category, blocks the generic one', () => {
  const dir = fixture();
  const idx = buildIndex(dir, R2);
  const a = idx.items.find((i) => i.id === 'a');
  const b = idx.items.find((i) => i.id === 'b');
  assert.equal(a.parent_category, '5');
  assert.equal(b.parent_category, '1');
});
