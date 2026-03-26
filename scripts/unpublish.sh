#!/usr/bin/env bash
set -euo pipefail

# ─── Unpublish all versions of @interactkit packages from npm ─────
# Prompts for an npm access token, then removes every published version.
#
# Usage:
#   ./scripts/unpublish.sh

PACKAGES=(
  "@interactkit/sdk"
  "@interactkit/cli"
  "@interactkit/http"
  "@interactkit/websocket"
)

read -rsp "▸ Enter npm access token: " NPM_TOKEN
echo ""

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > "$ROOT/.npmrc.publish"
trap 'rm -f "$ROOT/.npmrc.publish"' EXIT

for pkg in "${PACKAGES[@]}"; do
  echo "── $pkg ──"
  versions=$(npm view "$pkg" versions --json 2>/dev/null || echo "[]")

  if [[ "$versions" == "[]" ]]; then
    echo "  No versions found, skipping."
    echo ""
    continue
  fi

  # Parse JSON array of versions
  for version in $(echo "$versions" | node -p "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).join('\n')"); do
    echo "  Unpublishing $pkg@$version..."
    npm unpublish "$pkg@$version" --force --userconfig "$ROOT/.npmrc.publish" 2>&1 || echo "  Failed to unpublish $version"
  done
  echo ""
done

# Reset .autodeploy hashes so next publish treats everything as new
echo "▸ Resetting .autodeploy hashes..."
find "$ROOT" -name .autodeploy -not -path '*/node_modules/*' -exec sh -c 'echo "" > "$1"' _ {} \;

# Reset all package versions to 0.2.0
echo "▸ Resetting package versions to 0.2.0..."
find "$ROOT" -name .autodeploy -not -path '*/node_modules/*' -printf '%h\n' | while read -r dir; do
  pkgjson="$dir/package.json"
  if [[ -f "$pkgjson" ]]; then
    node -e "
      const fs = require('fs');
      const p = JSON.parse(fs.readFileSync('$pkgjson', 'utf-8'));
      p.version = '0.2.0';
      fs.writeFileSync('$pkgjson', JSON.stringify(p, null, 2) + '\n');
    "
    name=$(node -p "require('$pkgjson').name")
    echo "  $name → 0.2.0"
  fi
done

echo ""
echo "▸ Done. All versions removed, hashes reset, versions set to 0.2.0."
