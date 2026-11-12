import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildIndex, dirFor, readCatalogue } from './index.mjs';

const LEGACY_PREFIXES = [
  'https://getquix.net/images/',
  'http://getquix.net/images/',
  'https://quix.b-cdn.net/images/',
];
const TYPES = ['layout', 'section', 'header', 'footer'];
const LICENSES = ['free', 'pro'];

const readJson = (root, file, fallback) => {
  const p = join(root, file);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback;
};

function* walk(nodes) {
  for (const node of nodes || []) {
    yield node;
    yield* walk(node.children);
  }
}

// JSON.parse silently drops repeated keys, so scan the raw text of "templates".
function duplicateSlugs(raw) {
  const seen = new Set();
  const dups = new Set();
  let depth = 0;
  let inTemplates = false;
  let i = 0;
  while (i < raw.length) {
    const c = raw[i];
    if (c === '"') {
      let j = i + 1;
      while (raw[j] !== '"') j += raw[j] === '\\' ? 2 : 1;
      const str = raw.slice(i + 1, j);
      let k = j + 1;
      while (/\s/.test(raw[k])) k++;
      if (raw[k] === ':') {
        if (depth === 1 && str === 'templates') inTemplates = true;
        else if (inTemplates && depth === 2) {
          if (seen.has(str)) dups.add(str);
          seen.add(str);
        }
      }
      i = j + 1;
      continue;
    }
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (inTemplates && depth === 1) inTemplates = false;
    }
    i++;
  }
  return [...dups];
}

const strip = ({ generated, ...rest }) => rest;

export async function validate(root, { r2Base, checkRemote = false }) {
  const errors = [];
  const cat = readCatalogue(root);
  for (const slug of duplicateSlugs(readFileSync(join(root, 'meta/catalogue.json'), 'utf8'))) {
    errors.push(`duplicate slug "${slug}" in meta/catalogue.json`);
  }
  const pro = new Set(readJson(root, 'pro-elements.json', []));
  const allow = new Set(readJson(root, 'allowlist.json', []));
  const remoteUrls = new Set();
  const expected = new Set();
  const imagePrefix = `${r2Base}/images/`;

  for (const [slug, meta] of Object.entries(cat.templates)) {
    if (!LICENSES.includes(meta.license)) errors.push(`invalid license "${meta.license}" for "${slug}"`);
    if (!TYPES.includes(meta.type)) errors.push(`invalid type "${meta.type}" for "${slug}"`);

    const file = `${dirFor(meta.type)}/${slug}.json`;
    expected.add(file);
    if (checkRemote) remoteUrls.add(`${r2Base}/thumbs/${slug}.jpg`);
    if (!existsSync(join(root, file))) continue; // reported via buildIndex below

    const text = readFileSync(join(root, file), 'utf8');
    const unescaped = text.replaceAll('\\/', '/');
    for (const prefix of LEGACY_PREFIXES) {
      if (unescaped.includes(prefix)) errors.push(`legacy host ${prefix} in ${file}`);
    }
    if (checkRemote) {
      for (const m of unescaped.matchAll(/https?:\/\/[^"\s\\)]+/g)) {
        if (m[0].startsWith(imagePrefix)) remoteUrls.add(m[0]);
      }
    }

    if (meta.license === 'free' && !allow.has(slug)) {
      const used = new Set();
      for (const node of walk(JSON.parse(text).data)) {
        if (node.slug && pro.has(node.slug)) used.add(node.slug);
      }
      for (const s of [...used].sort()) errors.push(`free template "${slug}" uses pro element ${s}`);
    }
  }

  for (const dir of ['layouts', 'blocks']) {
    if (!existsSync(join(root, dir))) continue;
    for (const f of readdirSync(join(root, dir)).filter((n) => n.endsWith('.json'))) {
      if (!expected.has(`${dir}/${f}`)) errors.push(`orphan file ${dir}/${f}`);
    }
  }

  try {
    const fresh = buildIndex(root, r2Base);
    const current = readJson(root, 'index.json', null);
    if (!current || JSON.stringify(strip(current)) !== JSON.stringify(strip(fresh))) {
      errors.push('index.json is out of date, run npm run build');
    }
  } catch (e) {
    errors.push(e.message);
  }

  if (checkRemote) {
    for (const url of remoteUrls) {
      let ok = false;
      try {
        ok = (await fetch(url, { method: 'HEAD' })).ok;
      } catch {}
      if (!ok) errors.push(`missing on R2: ${url}`);
    }
  }
  return errors;
}
