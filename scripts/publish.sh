#!/usr/bin/env bash
set -euo pipefail

# ─── InteractKit npm publish script ───────────────────────────────────
# Finds all packages with a .autodeploy marker and publishes them to npm.
#
# Usage:
#   ./scripts/publish.sh              # publish all .autodeploy packages
#   ./scripts/publish.sh --dry-run    # preview what would be published
#
# To mark a package for publishing, add an empty .autodeploy file to its directory.
# Prompts for an npm granular access token (with 2FA bypass) on each run.
#
# Prerequisites:
#   - npm org access to @interactkit scope
#   - Granular access token with publish permissions and "Bypass 2FA" enabled

DRY_RUN=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)  DRY_RUN="--dry-run"; shift ;;
    *)          echo "Unknown flag: $1"; exit 1 ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -z "$DRY_RUN" ]]; then
  read -rsp "▸ Enter npm access token: " NPM_TOKEN
  echo ""
  echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > "$ROOT/.npmrc.publish"
  trap 'rm -f "$ROOT/.npmrc.publish"' EXIT
fi

# Find all directories containing .autodeploy marker
mapfile -t PACKAGES < <(find "$ROOT" -name .autodeploy -not -path '*/node_modules/*' -printf '%h\n' | sort)

if [[ ${#PACKAGES[@]} -eq 0 ]]; then
  echo "No packages with .autodeploy marker found."
  exit 1
fi

echo ""
echo "▸ Checking ${#PACKAGES[@]} packages${DRY_RUN:+ (dry run)}"
echo ""

PUBLISHED=0
SKIPPED=0
BUMPED=0

for dir in "${PACKAGES[@]}"; do
  name=$(node -p "require('$dir/package.json').name")
  version=$(node -p "require('$dir/package.json').version")

  echo "── $name@$version ──────────────────────────────────"

  # Hash source files to detect changes (stored in .autodeploy after publish)
  content_hash=$(find "$dir" -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/.git/*' -not -path '*/.next/*' -not -name '.autodeploy' -not -name 'package.json' -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1)
  prev_hash=$(cat "$dir/.autodeploy" 2>/dev/null || echo "")

  if [[ "$content_hash" == "$prev_hash" ]]; then
    echo "  No changes, skipping."
    SKIPPED=$((SKIPPED + 1))
    echo ""
    continue
  fi

  # Bump patch version until we find one not taken on npm
  while npm view "$name@$version" version &>/dev/null; do
    next=$(node -p "const [a,b,c]='$version'.split('.'); [a,b,+c+1].join('.')")
    echo "  $version is taken, bumping to $next"
    version="$next"
    BUMPED=1
  done

  # Write bumped version back to package.json if it changed
  if [[ "$BUMPED" -eq 1 ]]; then
    node -e "
      const fs = require('fs');
      const f = '$dir/package.json';
      const p = JSON.parse(fs.readFileSync(f, 'utf-8'));
      p.version = '$version';
      fs.writeFileSync(f, JSON.stringify(p, null, 2) + '\n');
    "
    BUMPED=0
  fi

  # Build
  echo "  Building..."
  (cd "$dir" && pnpm build)

  # Publish
  echo "  Publishing $name@$version..."
  if [[ -z "$DRY_RUN" ]]; then
    (cd "$dir" && npm publish --access public --userconfig "$ROOT/.npmrc.publish")
    # Store content hash after successful publish
    echo "$content_hash" > "$dir/.autodeploy"
  else
    (cd "$dir" && npm publish --access public --dry-run)
  fi

  PUBLISHED=$((PUBLISHED + 1))
  echo "  Done."
  echo ""
done

echo "▸ Finished. ${PUBLISHED} published, ${SKIPPED} skipped (no changes)."
