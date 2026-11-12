import { createHash } from 'node:crypto';

// Matches the three legacy image hosts, with plain or JSON-escaped slashes.
const LEGACY = /https?:(?:\\?\/){2}(?:getquix\.net|quix\.b-cdn\.net)(?:\\?\/)images(?:\\?\/)((?:[^"'\s\\)?#<>]|\\\/)+)/g;

export function slugFor(item, used = new Set()) {
  let slug = item.alias;
  if (used.has(slug)) slug = `${item.alias}-${item.id}`;
  used.add(slug);
  return slug;
}

export function rewriteImageUrls(json, r2Base) {
  const paths = [];
  const out = json.replace(LEGACY, (match, rest) => {
    const rel = `images/${rest.replaceAll('\\/', '/')}`;
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
