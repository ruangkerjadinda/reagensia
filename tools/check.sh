#!/usr/bin/env bash
# Syntax-check ES modules by copying to a .mjs temp and running node --check.
tmp="${TMPDIR:-/tmp}/reagensia-check"
mkdir -p "$tmp"
fail=0
for f in "$@"; do
  cp "$f" "$tmp/$(basename "$f" .js).mjs"
  if node --check "$tmp/$(basename "$f" .js).mjs" 2>&1 | head -5 | grep -q .; then
    echo "FAIL $f"; node --check "$tmp/$(basename "$f" .js).mjs" 2>&1 | head -8; fail=1
  else
    echo "ok   $f"
  fi
done
exit $fail
