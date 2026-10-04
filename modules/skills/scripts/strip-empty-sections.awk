# Strip "### Heading" blocks that have no non-empty bullet underneath.
# Used by .github/workflows/release.yml to keep empty placeholder sections
# (left over from scripts/prepare-release.mjs) out of GitHub release notes.

/^### / {
  if (header_pending) flush()
  current_header = $0
  current_body = ""
  has_bullet = 0
  header_pending = 1
  next
}

{
  if (header_pending) {
    current_body = current_body $0 "\n"
    if ($0 ~ /^- [^[:space:]]/) has_bullet = 1
  } else {
    print
  }
}

END {
  if (header_pending) flush()
}

function flush() {
  if (has_bullet) {
    print current_header
    printf "%s", current_body
  }
  header_pending = 0
}
