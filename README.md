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

## Adding a template

1. Build the section or layout on a dev site, using images from the library (they live on R2).
2. Export it from My Templates (the JSON export).
3. Run:
   ```
   export R2_PUBLIC_BASE=https://<public r2 host>
   npm run add -- --file export.json --type section --title "Hero Dark" --license free \
     --category-title Hero --tags "Startup,SaaS" --shot https://your-dev-site/page
   ```
   Use `--thumb thumb.jpg` instead of `--shot` to supply your own image. `--shot` needs `npx playwright install chromium` once. Layouts are shot full page, blocks capture the first `.qx-section`. Optional: `--pack`, `--category-alias`, `--min-version` (default 4.0.0), `--slug`.
   The command writes `blocks/<slug>.json` or `layouts/<slug>.json`, `thumbs/<slug>.jpg`, the catalogue entry, and regenerates the index, then validates. It refuses images that are not on R2.
4. Open a PR. On merge the raw files are live immediately and R2 is updated within minutes.
