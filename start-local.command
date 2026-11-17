#!/bin/sh
set -eu

cd "$(dirname "$0")"
export PATH="$PWD/.tooling/bin:$PATH"
export NODE_ENV=development

exec npm run dev -- --port 4321
