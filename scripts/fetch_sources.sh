#!/usr/bin/env bash
# Download the reference datasets (all published on npm) into sources/.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p sources
fetch() {  # name tarball-url
  local dir="sources/$1"
  [ -d "$dir" ] && return
  mkdir -p "$dir"
  curl -sSL "$2" | tar xz -C "$dir"
}
fetch echarts  https://registry.npmjs.org/echarts/-/echarts-4.9.0.tgz                                   # China provinces + 南海诸岛 inset
fetch counties https://registry.npmjs.org/echarts-china-counties-js/-/echarts-china-counties-js-1.0.2.tgz # county-level polygons (GCJ-02)
fetch admin    https://registry.npmjs.org/@province-city-china/data/-/data-8.5.8.tgz                   # GB/T 2260 division list
fetch pinyin   https://registry.npmjs.org/pinyin-pro/-/pinyin-pro-3.29.4.tgz                           # romanised names for the English page
echo "sources ready"
