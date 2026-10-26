#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -ne 0 ]; then
  echo "Usage: ./release.sh (retry or start the automated main-branch release)" >&2
  exit 1
fi
gh workflow run publish.yml --repo priyankark/lighthouse-mcp --ref main
echo "Release pipeline started. Track it with: gh run list --workflow publish.yml"
