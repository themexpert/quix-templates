import { test } from 'node:test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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

test('flags index-hash.json that does not match index.json', async () => {
  const dir = built();
  // same content, different bytes: the content check passes, the hash does not
  writeFileSync(join(dir, 'index.json'), `${readFileSync(join(dir, 'index.json'), 'utf8')}\n`);
  let errors = await validate(dir, opts);
  assert.ok(errors.includes('index-hash.json does not match index.json, run npm run build'), errors.join('\n'));
  assert.ok(!errors.some((e) => /out of date/.test(e)), errors.join('\n'));

  writeIndex(dir, R2);
  writeJson(dir, 'index-hash.json', { success: true, data: 'stale' });
  errors = await validate(dir, opts);
  assert.ok(errors.includes('index-hash.json does not match index.json, run npm run build'), errors.join('\n'));
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

test('flags legacy getquix.net images, including escaped slashes', async () => {
  const dir = built();
  const item = readJson(dir, 'blocks/b.json');
  item.data[0].children[0].children[0].image = 'https://getquix.net/images/x.jpg';
  writeJson(dir, 'blocks/b.json', item);
  let errors = await validate(dir, opts);
  assert.ok(errors.some((e) => /legacy host.*b\.json/.test(e)), errors.join('\n'));

  const dir2 = built();
  const p = join(dir2, 'blocks/b.json');
  writeFileSync(p, readFileSync(p, 'utf8').replace('"title"', '"u":"https:\\/\\/getquix.net\\/images\\/x.jpg","title"'));
  errors = await validate(dir2, opts);
  assert.ok(errors.some((e) => /legacy host.*b\.json/.test(e)), errors.join('\n'));
});

test('flags duplicate slug', async () => {
  const dir = built();
  const p = join(dir, 'meta/catalogue.json');
  const raw = readFileSync(p, 'utf8');
  const entry = JSON.stringify(readJson(dir, 'meta/catalogue.json').templates.b);
  writeFileSync(p, raw.replace('"templates": {', `"templates": {\n "b": ${entry},`));
  const errors = await validate(dir, opts);
  assert.ok(errors.some((e) => /duplicate slug "b"/.test(e)), errors.join('\n'));
});

test('remote check HEADs JSON-escaped R2 image urls', async () => {
  const dir = built();
  const p = join(dir, 'blocks/b.json');
  writeFileSync(p, readFileSync(p, 'utf8').replace('"title"', '"u":"https:\\/\\/r2.test\\/images\\/x.jpg","title"'));
  const realFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url) => {
    seen.push(url);
    return { ok: !url.endsWith('/images/x.jpg') };
  };
  try {
    const errors = await validate(dir, { r2Base: R2, checkRemote: true });
    assert.ok(seen.includes('https://r2.test/images/x.jpg'), seen.join('\n'));
    assert.ok(errors.some((e) => /missing on R2: https:\/\/r2\.test\/images\/x\.jpg/.test(e)), errors.join('\n'));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('remote check HEADs whole R2 image urls that contain spaces', async () => {
  const dir = built();
  const p = join(dir, 'blocks/b.json');
  writeFileSync(
    p,
    readFileSync(p, 'utf8').replace(
      '"title"',
      '"u":"https:\\/\\/r2.test\\/images\\/health & medical\\/team-1.jpg","css":"url(https://r2.test/images/bg.png) no-repeat","title"',
    ),
  );
  const realFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url) => {
    seen.push(url);
    return { ok: true };
  };
  try {
    await validate(dir, { r2Base: R2, checkRemote: true });
    assert.ok(seen.includes('https://r2.test/images/health & medical/team-1.jpg'), seen.join('\n'));
    assert.ok(seen.includes('https://r2.test/images/bg.png'), seen.join('\n'));
    assert.ok(!seen.some((u) => u.endsWith('/images/health')), seen.join('\n'));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('remote check skips images and thumbs committed in the repo', async () => {
  const dir = built();
  const p = join(dir, 'blocks/b.json');
  writeFileSync(p, readFileSync(p, 'utf8').replace('"title"', '"u":"https:\\/\\/r2.test\\/images\\/new\\/x.jpg","title"'));
  mkdirSync(join(dir, 'images/new'), { recursive: true });
  writeFileSync(join(dir, 'images/new/x.jpg'), 'jpg');
  mkdirSync(join(dir, 'thumbs'), { recursive: true });
  writeFileSync(join(dir, 'thumbs/b.jpg'), 'jpg');
  const realFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url) => {
    seen.push(url);
    return { ok: false };
  };
  try {
    const errors = await validate(dir, { r2Base: R2, checkRemote: true });
    assert.ok(!seen.includes('https://r2.test/images/new/x.jpg'), seen.join('\n'));
    assert.ok(!seen.includes('https://r2.test/thumbs/b.jpg'), seen.join('\n'));
    assert.ok(seen.includes('https://r2.test/thumbs/a.jpg'), seen.join('\n'));
    assert.ok(!errors.some((e) => /new\/x\.jpg|thumbs\/b\.jpg/.test(e)), errors.join('\n'));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('walks a block whose data is a single node object', async () => {
  const dir = built();
  const item = readJson(dir, 'blocks/b.json');
  item.data = { ...item.data[0] };
  item.data.children[0].children.push({ slug: 'countdown', children: [] });
  writeJson(dir, 'blocks/b.json', item);
  const errors = await validate(dir, opts);
  assert.ok(errors.some((e) => /free template "b" uses pro element countdown/.test(e)), errors.join('\n'));
});

test('flags doubled-slash legacy urls and getquix base_domain', async () => {
  for (const value of [
    { image: 'https://getquix.net//images/x.jpg' },
    { media: { source: 'images/a.svg', base_domain: 'https://getquix.net/' } },
  ]) {
    const dir = built();
    const item = readJson(dir, 'blocks/b.json');
    Object.assign(item.data[0].children[0].children[0], value);
    writeJson(dir, 'blocks/b.json', item);
    const errors = await validate(dir, opts);
    assert.ok(errors.some((e) => /legacy host.*b\.json/.test(e)), errors.join('\n'));
  }
});
