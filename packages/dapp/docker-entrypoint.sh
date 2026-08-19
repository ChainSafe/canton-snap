#!/bin/sh
set -eu

if [ -z "${VITE_MIDDLEWARE_URL:-}" ]; then
  echo "ERROR: VITE_MIDDLEWARE_URL is not set" >&2
  exit 1
fi

if [ -z "${VITE_NETWORK:-}" ]; then
  echo "ERROR: VITE_NETWORK is not set" >&2
  exit 1
fi

# Escape characters that are special in sed replacement strings (\ & |)
escape_sed() {
  printf '%s' "$1" | sed -e 's/[\\&|]/\\&/g'
}

ESC_URL=$(escape_sed "$VITE_MIDDLEWARE_URL")
ESC_NETWORK=$(escape_sed "$VITE_NETWORK")

ESC_NON_CUSTODIAL=$(escape_sed "${VITE_ENABLE_NON_CUSTODIAL:-}")

# VITE_SNAP_ID / VITE_SIWE_DOMAIN / VITE_SIWE_URI are intentionally absent:
# they are baked at image build time to their code-side defaults (published
# snap id, page origin) — see the Dockerfile for why runtime injection cannot
# express "value or fallback".
find /usr/share/nginx/html \( -name '*.js' -o -name '*.html' -o -name '*.css' -o -name '*.map' \) \
  -exec sed -i \
    -e "s|__VITE_MIDDLEWARE_URL__|${ESC_URL}|g" \
    -e "s|__VITE_NETWORK__|${ESC_NETWORK}|g" \
    -e "s|__VITE_ENABLE_NON_CUSTODIAL__|${ESC_NON_CUSTODIAL}|g" \
  {} +
