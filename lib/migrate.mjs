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

// Media whose base_domain is the template author's local dev site
// (*.test, *.local, localhost) never existed publicly: the builder would try to
// download base_domain + source on insert and fail. Clear both, which is what
// every user saw anyway (no image). The R2 base itself is never dropped.
const DEV_MEDIA = /"base_domain"(\s*:\s*)"(https?:(?:\\?\/){2}([^"\\/:]+)(?::\d+)?(?:\\?\/)*)"(\s*,\s*"source"\s*:\s*)"([^"]*)"/g;
const DEV_HOST = /(?:^localhost$|\.test$|\.local$|\.localhost$)/i;

const DEV_BASE = /"base_domain"(\s*:\s*)"https?:(?:\\?\/){2}([^"\\/:]+)[^"]*"/g;
// a file path ("images/a.jpg"), not an icon name ("qxif-star")
const isFilePath = (s) => /\\?\/|\.[a-z0-9]{2,5}$/i.test(s);

export function dropDevMedia(json, r2Base) {
  const r2Host = new URL(r2Base).hostname;
  const isDev = (host) => host !== r2Host && DEV_HOST.test(host);
  const dropped = [];
  let out = json.replace(DEV_MEDIA, (m, sep, base, host, mid, source) => {
    if (!isDev(host) || !isFilePath(source)) return m;
    dropped.push(`${base.replaceAll('\\/', '/')}${source.replaceAll('\\/', '/')}`);
    return `"base_domain"${sep}""${mid}""`;
  });
  // any other dev base_domain (icons, empty sources, source before base_domain)
  out = out.replace(DEV_BASE, (m, sep, host) => (isDev(host) ? `"base_domain"${sep}""` : m));
  return { json: out, dropped };
}
