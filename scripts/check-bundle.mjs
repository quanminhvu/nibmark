#!/usr/bin/env node
// Kiểm tra bản build của main và preload chỉ còn require() tới `electron` và module có sẵn của Node.
// Bản đóng gói không kèm node_modules, nên mọi require() khác sẽ làm app lỗi ngay khi mở
// ("Cannot find module …"), dù chạy từ thư mục dự án vẫn bình thường.
import { readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'

const files = ['out/main/index.js', 'out/preload/index.js']
const builtins = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]))
let failed = false

for (const file of files) {
  let code
  try {
    code = readFileSync(file, 'utf8')
  } catch {
    console.error(`✗ ${file} not found. Run "npm run build" first.`)
    process.exit(1)
  }
  const external = [...code.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)]
    .map((m) => m[1])
    .filter((name) => name !== 'electron' && !builtins.has(name) && !name.startsWith('.'))
  if (external.length) {
    failed = true
    console.error(`✗ ${file} requires packages that are not bundled: ${[...new Set(external)].join(', ')}`)
  } else {
    console.log(`✓ ${file} only requires electron and Node built-ins`)
  }
}

process.exit(failed ? 1 : 0)
