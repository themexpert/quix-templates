# quix-templates

Template library for the Quix page builder for Joomla.

- `layouts/<slug>.json`, `blocks/<slug>.json` are the template payloads.
- `meta/catalogue.json` is the hand-edited metadata for every template.
- `index.json` and `index-hash.json` are generated. Do not edit them.
- `pro-elements.json` lists Pro element slugs; `allowlist.json` lists free templates allowed to use them.
- Images and thumbnails live on Cloudflare R2 (`https://quix-templates.themexpert.com/images/...`, `/thumbs/<slug>.jpg`). New ones can be committed under `images/` and `thumbs/`; they are uploaded on merge.

## Commands

```
export R2_PUBLIC_BASE=https://quix-templates.themexpert.com
npm run build              # regenerate index.json and index-hash.json
npm run validate           # check the repo
npm run validate -- --remote   # also HEAD every R2 image
npm test
```

## Adding a template

1. Build the section or layout on a dev site, using images from the library (they live on R2). For a new image, put it in this repo under `images/<folder>/<name>` and use `https://quix-templates.themexpert.com/images/<folder>/<name>` in the builder (it goes live when the PR merges).
2. Export it from My Templates (the JSON export).
3. Run:
   ```
   export R2_PUBLIC_BASE=https://quix-templates.themexpert.com
   npm run add -- --file export.json --type section --title "Hero Dark" --license free \
     --category-title Hero --tags "Startup,SaaS" --shot https://your-dev-site/page
   ```
   `--shot` takes the URL of the published dev-site page the template was built on (build each section on a page of its own). It captures only the page's own Quix content: header/footer/module collections and floating bars are left out, and lazy images and entrance animations are loaded first. Layouts become a 920x1000 crop from the top, sections/headers/footers a 700px wide image. Use `--thumb thumb.jpg` instead to supply your own image. `--shot` needs `npx playwright install chromium` once. Optional: `--pack`, `--category-alias`, `--min-version` (default 4.0.0), `--slug`.
   The command writes `blocks/<slug>.json` or `layouts/<slug>.json`, `thumbs/<slug>.jpg`, the catalogue entry, and regenerates the index, then validates. It refuses images that are not on R2.
4. Open a PR. CI runs the tests and checks every image exists on R2 or in the PR. On merge the raw files are live immediately and the `sync to r2` workflow uploads the PR's images, thumbnails and template files to R2 within minutes.

## Publishing (maintainers)

The `sync to r2` workflow does this on every push to `main`. It needs repo secrets `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and variables `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_PUBLIC_BASE`.

To upload images by hand (needs the `aws` CLI and the same values exported):

```
IMAGES_DIR=/path/to/getquix/images scripts/upload-media.sh
```
