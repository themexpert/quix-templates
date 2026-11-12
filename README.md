# quix-templates

Template library for the Quix page builder for Joomla.

- `layouts/<slug>.json`, `blocks/<slug>.json` are the template payloads.
- `meta/catalogue.json` is the hand-edited metadata for every template.
- `index.json` and `index-hash.json` are generated. Do not edit them.
- `pro-elements.json` lists Pro element slugs; `allowlist.json` lists free templates allowed to use them.
- Images live on Cloudflare R2.

## Commands

```
export R2_PUBLIC_BASE=https://<public r2 host>
npm run build              # regenerate index.json and index-hash.json
npm run validate           # check the repo
npm run validate -- --remote   # also HEAD every R2 image
npm test
```
