import { createHash } from 'node:crypto';

// Matches the three legacy image hosts, with plain or JSON-escaped slashes.
const LEGACY = /https?:(?:\\?\/){2}(?:getquix\.net|quix\.b-cdn\.net)(?:\\?\/)images(?:\\?\/)((?:[^"'\\()?#<>]|\\\/|\([^()"'\\]*\))+)/g;

export function slugFor(item, used = new Set()) {
  let slug = item.alias;
  if (used.has(slug)) slug = `${item.alias}-${item.id}`;
  used.add(slug);
  return slug;
}

export function rewriteImageUrls(json, r2Base) {
  const paths = [];
  const out = json.replace(LEGACY, (match, rest) => {
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
