import { createHash } from 'node:crypto';

// Matches the three legacy image hosts, with plain or JSON-escaped slashes.
const LEGACY = /https?:(?:\\?\/){2}(?:getquix\.net|quix\.b-cdn\.net)(?:\\?\/)+images(?:\\?\/)((?:[^"'\\()?#<>]|\\\/|\([^()"'\\]*\))+)/g;

export function slugFor(item, used = new Set()) {
  let slug = item.alias;
  if (used.has(slug)) slug = `${item.alias}-${item.id}`;
  used.add(slug);
  return slug;
}

const BASE_DOMAIN = /("base_domain"\s*:\s*")https?:(?:\\?\/){2}getquix\.net(?:\\?\/)(")/g;

function* mediaNodes(v) {
  if (Array.isArray(v)) for (const x of v) yield* mediaNodes(x);
  else if (v && typeof v === 'object') {
    yield v;
    for (const x of Object.values(v)) yield* mediaNodes(x);
  }
}

export function rewriteImageUrls(json, r2Base) {
  const paths = [];
  // relative media sources are fetched from base_domain by the builder
  for (const n of mediaNodes(JSON.parse(json))) {
    if (typeof n.source === 'string' && /^images\//.test(n.source) && /^https?:\/\/getquix\.net\/?$/.test(n.base_domain || '')) {
      if (!paths.includes(n.source)) paths.push(n.source);
    }
  }
  json = json.replace(BASE_DOMAIN, (m, a, b) => {
    const sep = m.includes('\\/') ? '\\/' : '/';
    return `${a}${r2Base.replaceAll('/', sep)}${sep}${b}`;
  });
  const out = json.replace(LEGACY, (match, rest) => {
    // getquix.net served "images//a.jpg" and "a//b.jpg"; R2 keys are exact
    rest = rest.replace(/^(?:\\?\/)+/, '').replace(/(\\?\/)(?:\\?\/)+/g, '$1');
    // file names may contain spaces; cut trailing prose after the extension
    const clean = rest.replaceAll('\\/', '/');
    const ext = /^(.*?\.(?:jpe?g|png|gif|webp|svg|avif|ico|mp4|webm))(?![A-Za-z0-9])/i.exec(clean);
    const rel = `images/${ext ? ext[1] : clean}`;
    if (!paths.includes(rel)) paths.push(rel);
    // keep the escaping style the payload already uses
    const sep = match.includes('\\/') ? '\\/' : '/';
    return `${r2Base.replaceAll('/', sep)}${sep}images${sep}${rest}`;
  });
  return { json: out, paths };
}

export const sha1 = (s) => createHash('sha1').update(s).digest('hex');

export function isStub(payload, stubHash) {
  return sha1(payload) === stubHash;
}
