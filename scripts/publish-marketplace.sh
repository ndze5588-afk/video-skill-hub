#!/bin/sh
# Pushes dist-marketplace/ to the public marketplace repo named by hub.repo in data/skills.json.
# Run `node scripts/build.mjs` first.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
repo=$(node -e 'console.log(require(process.argv[1]).hub.repo)' "$root/data/skills.json")
case "$repo" in *"<"*) echo "Set hub.repo in data/skills.json first." >&2; exit 1 ;; esac

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
git clone --quiet "git@github.com:$repo.git" "$work"
# Replace everything except .git with the freshly built marketplace.
find "$work" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -R "$root/dist-marketplace/." "$work/"
cd "$work"
git add -A
if git diff --cached --quiet; then
  echo "Marketplace already up to date."
else
  git commit --quiet -m "Update marketplace"
  git push --quiet
  echo "Pushed marketplace to $repo."
fi
