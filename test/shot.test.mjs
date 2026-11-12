import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { screenshot } from '../lib/shot.mjs';

// A Quix-like page: a header collection (red) above the page content (blue),
// with an element still hidden by its entrance animation class.
const html = `<!doctype html><html><body style="margin:0">
<div class='qx quix' data-qx='1' data-type='header'><section class='qx-section' style="height:120px;background:#f00"></section></div>
<div class='qx quix' data-qx='2' data-type='page'>
  <section class='qx-section' style="height:400px;background:#00f"></section>
  <section class='qx-section' style="height:400px;background:#00f"><div class="qx-opacity-0" style="height:400px;background:#00f"></div></section>
  <section class='qx-section' style="height:1000px;background:#00f"></section>
</div>
<div id="system-debug" style="position:fixed;left:0;right:0;bottom:0;height:300px;background:#f00"></div>
</body></html>`;

const page = () => {
  const dir = mkdtempSync(join(tmpdir(), 'qt-shot-'));
  writeFileSync(join(dir, 'p.html'), html);
  return { dir, url: pathToFileURL(join(dir, 'p.html')).href };
};

const meanRgb = async (file) => {
  const { channels } = await sharp(file).stats();
  return channels.slice(0, 3).map((c) => Math.round(c.mean));
};

test('section shot captures the page content, not header collections', { timeout: 60_000 }, async () => {
  const { dir, url } = page();
  const out = join(dir, 's.jpg');
  await screenshot(url, 'section', out);
  const meta = await sharp(out).metadata();
  assert.equal(meta.width, 700);
  assert.ok(meta.height > 600, `whole page content, got ${meta.height}`); // both sections, not just the first
  const [r, , b] = await meanRgb(out);
  assert.ok(b > 200 && r < 40, `blue page content, got r=${r} b=${b}`);
});

test('layout shot is a 920x1000 crop from the top of the page content', { timeout: 60_000 }, async () => {
  const { dir, url } = page();
  const out = join(dir, 'l.jpg');
  await screenshot(url, 'layout', out);
  const meta = await sharp(out).metadata();
  assert.deepEqual([meta.width, meta.height], [920, 1000]);
  const [r, , b] = await meanRgb(out);
  assert.ok(b > 200 && r < 40, `blue page content, got r=${r} b=${b}`);
});
