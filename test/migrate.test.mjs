import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { slugFor, rewriteImageUrls, isStub } from '../lib/migrate.mjs';

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
