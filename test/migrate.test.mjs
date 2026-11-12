import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { slugFor, rewriteImageUrls, isStub, dropDevMedia } from '../lib/migrate.mjs';

const R2 = 'https://r2.test';

test('rewrites all legacy hosts', () => {
  const input = JSON.stringify({
    a: 'http://getquix.net/images/a.jpg',
    b: 'https://getquix.net/images/b.png',
    c: 'https://quix.b-cdn.net/images/c.webp',
  });
  const { json, paths } = rewriteImageUrls(input, R2);
  assert.equal(
    json,
    JSON.stringify({
      a: `${R2}/images/a.jpg`,
      b: `${R2}/images/b.png`,
      c: `${R2}/images/c.webp`,
    }),
  );
  assert.deepEqual(paths, ['images/a.jpg', 'images/b.png', 'images/c.webp']);
});

test('rewrites JSON-escaped urls', () => {
  const input = '{"u":"https:\\/\\/getquix.net\\/images\\/a.jpg"}';
  const { json, paths } = rewriteImageUrls(input, R2);
  assert.equal(json, '{"u":"https:\\/\\/r2.test\\/images\\/a.jpg"}');
  assert.deepEqual(paths, ['images/a.jpg']);
});

test('slug collision gets legacy id', () => {
  const used = new Set();
  assert.equal(slugFor({ alias: 'hero', id: '12' }, used), 'hero');
  assert.equal(slugFor({ alias: 'hero', id: '321' }, used), 'hero-321');
});

test('rejects stub payload', () => {
  const stub = '{"title":"Go Pro Layout"}';
  const hash = createHash('sha1').update(stub).digest('hex');
  assert.equal(isStub(stub, hash), true);
  assert.equal(isStub('{"type":"layout","data":[]}', hash), false);
});

test('rewrites escaped urls with nested folders', () => {
  const input = '{"u":"https:\\/\\/getquix.net\\/images\\/layout-pack\\/e\\/a.jpg"}';
  const { json, paths } = rewriteImageUrls(input, R2);
  assert.equal(json, '{"u":"https:\\/\\/r2.test\\/images\\/layout-pack\\/e\\/a.jpg"}');
  assert.deepEqual(paths, ['images/layout-pack/e/a.jpg']);
});

test('collects file names with spaces and parentheses', () => {
  const input =
    '{"a":"https:\\/\\/getquix.net\\/images\\/buildx\\/drill (1).png","b":"https://getquix.net/images/x/Frame-1-(2).jpg","c":"url(https://getquix.net/images/y/z.png) no-repeat"}';
  const { json, paths } = rewriteImageUrls(input, R2);
  assert.deepEqual(paths, ['images/buildx/drill (1).png', 'images/x/Frame-1-(2).jpg', 'images/y/z.png']);
  assert.ok(json.includes('r2.test\\/images\\/buildx\\/drill (1).png'));
  assert.ok(json.includes('url(https://r2.test/images/y/z.png) no-repeat'));
});

test('handles doubled slashes after the host', () => {
  const input =
    '{"a":"https:\\/\\/getquix.net\\/\\/images\\/p\\/a.jpg","b":"https://getquix.net//images/q/b.png","c":"https://quix.b-cdn.net//images/c.webp"}';
  const { json, paths } = rewriteImageUrls(input, R2);
  assert.deepEqual(paths, ['images/p/a.jpg', 'images/q/b.png', 'images/c.webp']);
  assert.ok(json.includes('"https:\\/\\/r2.test\\/images\\/p\\/a.jpg"'));
  assert.ok(json.includes('"https://r2.test/images/q/b.png"'));
  assert.ok(json.includes('"https://r2.test/images/c.webp"'));
});

test('rewrites base_domain, plain and escaped', () => {
  const plain = '{"x":{"source":"images/a.svg","type":"svg","base_domain":"https://getquix.net/"}}';
  const esc = '{"x":{"base_domain":"http:\\/\\/getquix.net\\/","source":"images\\/b.png"}}';
  const other = '{"base_domain":"https://my.site/","source":"images/z.png"}';
  assert.ok(rewriteImageUrls(plain, R2).json.includes('"base_domain":"https://r2.test/"'));
  assert.ok(rewriteImageUrls(esc, R2).json.includes('"base_domain":"https:\\/\\/r2.test\\/"'));
  assert.equal(rewriteImageUrls(other, R2).json, other);
});

test('collects relative image sources only for getquix base_domain', () => {
  const input = JSON.stringify({
    a: { source: 'images/layout-pack/c/tel.svg', type: 'svg', base_domain: 'https://getquix.net/' },
    b: { base_domain: 'https://getquix.net/', source: 'qxio-ios-arrow-thin-right', type: 'icon' },
    c: { source: 'images/other.png', base_domain: 'https://my.site/' },
    d: { source: 'images/layout-pack/c/tel.svg', base_domain: 'http://getquix.net/' },
  });
  assert.deepEqual(rewriteImageUrls(input, R2).paths, ['images/layout-pack/c/tel.svg']);
});

test('collapses repeated slashes inside the image path', () => {
  const input = JSON.stringify({
    a: 'https://getquix.net/images//buildx/blog-1.jpg',
    b: 'https://getquix.net/images/primer//w-2.jpg',
  });
  const { json, paths } = rewriteImageUrls(input, R2);
  assert.equal(json, JSON.stringify({ a: `${R2}/images/buildx/blog-1.jpg`, b: `${R2}/images/primer/w-2.jpg` }));
  assert.deepEqual(paths, ['images/buildx/blog-1.jpg', 'images/primer/w-2.jpg']);

  const escaped = '{"u":"https:\\/\\/getquix.net\\/images\\/\\/buildx\\/\\/blog-1.jpg"}';
  assert.equal(rewriteImageUrls(escaped, R2).json, '{"u":"https:\\/\\/r2.test\\/images\\/buildx\\/blog-1.jpg"}');
});

test('drops media that point at a local dev site', () => {
  const input =
    '{"a":{"type":"image","base_domain":"http:\\/\\/layout-bundle.test\\/","source":"images\\/layout.png"},' +
    '"b":{"base_domain":"http:\\/\\/try_quix4_j4.test\\/","source":""},' +
    '"c":{"base_domain":"http://localhost:8080/","source":"images/x.jpg"},' +
    '"d":{"base_domain":"https:\\/\\/r2.test\\/","source":"images\\/ok.jpg"},' +
    '"e":{"base_domain":"","source":"images\\/rel.jpg"},' +
    '"f":{"source":"qxif-play-circle","base_domain":"http:\\/\\/try_quix4_j4.test\\/","type":"svg"},' +
    '"g":{"base_domain":"http:\\/\\/try_quix4_j4.test\\/","source":"qxif-star","type":"svg"}}';
  const { json, dropped } = dropDevMedia(input, R2);
  const out = JSON.parse(json);
  assert.deepEqual(out.a, { type: 'image', base_domain: '', source: '' });
  assert.deepEqual(out.b, { base_domain: '', source: '' });
  assert.deepEqual(out.c, { base_domain: '', source: '' });
  assert.deepEqual(out.d, { base_domain: 'https://r2.test/', source: 'images/ok.jpg' });
  assert.deepEqual(out.e, { base_domain: '', source: 'images/rel.jpg' });
  assert.deepEqual(out.f, { source: 'qxif-play-circle', base_domain: '', type: 'svg' });
  assert.deepEqual(out.g, { base_domain: '', source: 'qxif-star', type: 'svg' });
  assert.deepEqual(dropped, ['http://layout-bundle.test/images/layout.png', 'http://localhost:8080/images/x.jpg']);
});
