import { cpSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const R2 = 'https://r2.test';
const here = dirname(fileURLToPath(import.meta.url));

export function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'qt-'));
  cpSync(join(here, '..', 'test', 'fixtures', 'base'), dir, { recursive: true });
  return dir;
}

export const readJson = (dir, f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
export const writeJson = (dir, f, v) => writeFileSync(join(dir, f), JSON.stringify(v, null, 2));
