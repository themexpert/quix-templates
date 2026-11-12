#!/usr/bin/env bash
# Upload template images and thumbnails to Cloudflare R2.
#
# Needs: R2_ACCOUNT_ID, R2_BUCKET, and the R2 API token's S3 keys as
# R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY (or AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY).
# IMAGES_DIR defaults to migration/images (skipped when absent, e.g. in CI); point it at a full copy of
# getquix.net/images/ to upload every image, not only the referenced ones.
set -euo pipefail

: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID is not set}"
: "${R2_BUCKET:?R2_BUCKET is not set}"
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID is not set}}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY is not set}}"
export AWS_DEFAULT_REGION=auto

cd "$(dirname "$0")/.."
endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
images_dir="${IMAGES_DIR:-migration/images}"

if [ -d "$images_dir" ]; then
  aws s3 sync "$images_dir" "s3://${R2_BUCKET}/images" --endpoint-url "$endpoint" \
    --exclude "*index.html" --exclude "*.DS_Store" --exclude "*__MACOSX/*" --exclude "._*" --exclude "*/._*" \
    --cache-control "public, max-age=31536000, immutable" --only-show-errors
fi

# images committed in this repo (new templates, stand-ins for images missing
# upstream) win over the bulk copy
if [ -d images ]; then
  aws s3 sync images "s3://${R2_BUCKET}/images" --endpoint-url "$endpoint" \
    --cache-control "public, max-age=86400" --only-show-errors
fi

# getquix.net matched file names case-insensitively, R2 does not. Old pages and
# templates that use a differently-cased name get a server-side copy under it.
if [ -f meta/image-aliases.json ]; then
  node -e 'for (const [alias, target] of Object.entries(require("./meta/image-aliases.json"))) console.log(`${target}\t${alias}`)' |
    while IFS=$'\t' read -r target alias; do
      aws s3 cp "s3://${R2_BUCKET}/images/${target}" "s3://${R2_BUCKET}/images/${alias}" \
        --endpoint-url "$endpoint" --only-show-errors
    done
fi

if [ -d migration/thumbs ]; then
  aws s3 sync migration/thumbs "s3://${R2_BUCKET}/thumbs" --endpoint-url "$endpoint" \
    --cache-control "public, max-age=86400" --only-show-errors
fi
if [ -d thumbs ]; then
  aws s3 sync thumbs "s3://${R2_BUCKET}/thumbs" --endpoint-url "$endpoint" \
    --cache-control "public, max-age=86400" --only-show-errors
fi
echo "uploaded images and thumbnails to ${R2_BUCKET}"
