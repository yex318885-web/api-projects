#!/bin/sh
set -eu

# 无外部依赖，直接组装运行时产物
mkdir -p dist
cp server.js run.sh dist/
cp -R public dist/public
chmod 755 dist/run.sh
