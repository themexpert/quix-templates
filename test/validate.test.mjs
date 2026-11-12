import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../lib/validate.mjs';
import { writeIndex } from '../lib/index.mjs';
import { fixture, readJson, writeJson, R2 } from '../test-support/helpers.mjs';

const opts = { r2Base: R2, checkRemote: false };
const withProNode = (dir) => {
  const item = readJson(dir, 'blocks/b.json');
  item.data[0].children[0].children.push({ slug: 'countdown', children: [] });
  writeJson(dir, 'blocks/b.json', item);
};
const built = () => {
  const dir = fixture();
  writeIndex(dir, R2);
  return dir;
};

test('passes on a clean repo', async () => {
  assert.deepEqual(await validate(built(), opts), []);
});

test('flags legacy host', async () => {
  const dir = built();
  const item = readJson(dir, 'blocks/b.json');
  item.data[0].children[0].children[0].image = 'https://quix.b-cdn.net/images/x.jpg';
  writeJson(dir, 'blocks/b.json', item);
  const errors = await validate(dir, opts);
  assert.ok(errors.some((e) => /legacy host.*b\.json/.test(e)), errors.join('\n'));
});

test('flags free template with pro element', async () => {
  const dir = built();
  withProNode(dir);
  const errors = await validate(dir, opts);
  assert.ok(errors.some((e) => /free template "b" uses pro element countdown/.test(e)), errors.join('\n'));
});

test('allowlist exempts', async () => {
  const dir = built();
  withProNode(dir);
  writeJson(dir, 'allowlist.json', ['b']);
  const errors = await validate(dir, opts);
  assert.ok(!errors.some((e) => /pro element/.test(e)), errors.join('\n'));
});

test('flags orphan file', async () => {
  const dir = built();
  writeJson(dir, 'blocks/z.json', { groups: [], title: 'Z', type: 'section', data: [] });
  const errors = await validate(dir, opts);
  assert.ok(errors.some((e) => /orphan file blocks\/z\.json/.test(e)), errors.join('\n'));
});

test('flags stale index', async () => {
  const dir = built();
  const idx = readJson(dir, 'index.json');
  idx.items[0].title = 'Changed';
  writeJson(dir, 'index.json', idx);
  const errors = await validate(dir, opts);
  assert.ok(errors.some((e) => /index\.json is out of date/.test(e)), errors.join('\n'));
});

test('flags bad licence', async () => {
  const dir = fixture();
  const cat = readJson(dir, 'meta/catalogue.json');
  cat.templates.a.license = 'true';
  writeJson(dir, 'meta/catalogue.json', cat);
  writeIndex(dir, R2);
  const errors = await validate(dir, opts);
  assert.ok(errors.some((e) => /invalid license/.test(e)), errors.join('\n'));
});
