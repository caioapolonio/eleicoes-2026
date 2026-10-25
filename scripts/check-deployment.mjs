import assert from 'node:assert/strict'
import { setTimeout } from 'node:timers/promises'

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:8080')
let ready = false
for (let attempt = 0; attempt < 20; attempt++) {
  try {
    const response = await fetch(base, { signal: AbortSignal.timeout(2_000) })
    if (response.ok) {
      ready = true
      break
    }
  } catch {
    /* nginx may still be starting */
  }
  await setTimeout(500)
}
assert.ok(ready, `Deployment did not become ready: ${base}`)

const assets = new Set()
for (const path of ['/', '/segundo-turno/']) {
  const response = await fetch(new URL(path, base))
  assert.equal(response.status, 200, `${path} should be served by nginx`)
  assert.match(response.headers.get('content-type') ?? '', /text\/html/)
  const html = await response.text()
  assert.match(html, /<html\b[^>]*\blang="pt-BR"(?:\s|>)/)
  if (path === '/segundo-turno/') assert.match(html, /id="live-dashboard"/)
  for (const match of html.matchAll(/(?:src|href)="(\/_astro\/[^"?#]+)[^" ]*"/g))
    assets.add(match[1])
}
assert.ok(assets.size > 0, 'Production bundles must be referenced by the HTML')
for (const path of assets) {
  const response = await fetch(new URL(path, base))
  assert.equal(response.status, 200, `Missing production asset: ${path}`)
  assert.match(
    response.headers.get('cache-control') ?? '',
    /immutable/,
    `Missing asset cache: ${path}`,
  )
}
for (const path of ['/data/municipios.json', '/data/municipios.topo.json']) {
  const response = await fetch(new URL(path, base))
  assert.equal(response.status, 200, `Missing map data: ${path}`)
  assert.ok(await response.json(), `Invalid JSON: ${path}`)
}
const missing = await fetch(new URL('/this-route-does-not-exist/', base))
assert.equal(missing.status, 404, 'Unknown routes must not return a successful fallback')
console.log(
  `Deployment checks passed: both pages, ${assets.size} production assets, map data and 404.`,
)
