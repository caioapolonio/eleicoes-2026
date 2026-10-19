// Copies the municipal table into public/ and downloads the IBGE municipal mesh for the map.
// Run after analyze.py (see `bun run data`).
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

const MESH_URL =
  'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/json&qualidade=minima&intrarregiao=municipio'
const OUT = new URL('../public/data/', import.meta.url)

await mkdir(OUT, { recursive: true })
await copyFile(
  new URL('../data/analysis/municipios.json', import.meta.url),
  new URL('municipios.json', OUT),
)
console.log('copied municipios.json')

const meshPath = new URL('municipios.topo.json', OUT)
if (existsSync(meshPath)) {
  console.log('municipios.topo.json already present; delete it to download again')
} else {
  const response = await fetch(MESH_URL)
  if (!response.ok) throw new Error(`IBGE mesh request failed: ${response.status}`)
  let body = new Uint8Array(await response.arrayBuffer())
  // IBGE sometimes sends gzipped bodies without a Content-Encoding header
  if (body[0] === 0x1f && body[1] === 0x8b) body = gunzipSync(body)
  const topology = JSON.parse(new TextDecoder().decode(body))
  if (topology.type !== 'Topology' || !topology.objects.BRMU) {
    throw new Error('Unexpected IBGE mesh format')
  }
  await writeFile(meshPath, body)
  console.log(
    `downloaded municipios.topo.json (${topology.objects.BRMU.geometries.length} municípios)`,
  )
}
