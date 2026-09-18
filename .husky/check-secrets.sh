#!/usr/bin/env sh
# Scan the exact staged blobs and emit only rule IDs plus filenames.

exec node scripts/security/scan-secrets.mjs --staged
