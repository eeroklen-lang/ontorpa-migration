#!/bin/sh
# Fetches the public UiPath dev corpus listed in docs/corpus/public-corpus.json into samples/public/,
# one folder per repo (<owner>__<repo>), each pinned to the listed commit. Only the project folder
# is checked out. Folders that already exist are skipped, so the script can be re-run after a failure.
#
# Usage, from the repo root:  sh scripts/fetch-public-corpus.sh [manifest] [target folder]
set -u

manifest="${1:-docs/corpus/public-corpus.json}"
target="${2:-samples/public}"
mkdir -p "$target"

# Git Bash on Windows would otherwise rewrite sparse-checkout patterns such as /src/ into Windows paths.
export MSYS_NO_PATHCONV=1
export GIT_TERMINAL_PROMPT=0

failed=0
# One line per project: repo, commit, project folder (tab-separated; the folder may be empty or contain spaces)
node -e '
  const manifest = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  for (const p of manifest.projects) console.log([p.repo, p.commit, p.project].join("\t"));
' "$manifest" > "$target/.manifest.tsv" || exit 1

while IFS="$(printf '\t')" read -r repo commit project; do
  dir="$target/$(echo "$repo" | sed 's#/#__#')"
  if [ -d "$dir" ]; then
    echo "skip   $repo (already fetched)"
    continue
  fi
  echo "fetch  $repo${project:+ ($project)}"
  if git init -q "$dir" &&
    git -C "$dir" config core.longpaths true &&
    git -C "$dir" remote add origin "https://github.com/$repo" &&
    { [ -z "$project" ] || git -C "$dir" sparse-checkout set --no-cone "/$project/"; } &&
    git -C "$dir" fetch -q --depth 1 --filter=blob:none origin "$commit" &&
    git -C "$dir" checkout -q FETCH_HEAD; then
    :
  else
    echo "FAILED $repo" >&2
    rm -rf "$dir"
    failed=$((failed + 1))
  fi
done < "$target/.manifest.tsv"
rm -f "$target/.manifest.tsv"

if [ "$failed" -gt 0 ]; then
  echo "$failed projects failed; re-run to retry them" >&2
  exit 1
fi
