import {
  geoConicEqualArea,
  geoPath,
  interpolateLab,
  piecewise,
  quantile,
  scaleDiverging,
  scaleSequentialLog,
  select,
} from 'd3'
import { feature, mesh } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import { fmt } from '../lib/format'
import { regionColor, type MunicipalityRow } from '../lib/data'
import { el, tooltip, type Svg } from '../lib/chart-kit'

export type MapMetric = 'margem' | 'renda'
type Props = { codarea: string }
export type MunicipalTopology = Topology<{ BRMU: GeometryCollection<Props> }>

interface ColorEncoding {
  color: (v: number) => string
  value: (r: MunicipalityRow) => number | null
  colorAt: (t: number) => string // along the legend, 0 → 1
  position: (v: number) => number // where a value sits on the legend, 0 → 1
  ticks: number[]
  tickFormat: (v: number) => string
}

const token = (node: Element, name: string) => getComputedStyle(node).getPropertyValue(name).trim()

function encoding(box: HTMLElement, rows: MunicipalityRow[], metric: MapMetric): ColorEncoding {
  if (metric === 'margem') {
    // Symmetric around zero, capped at the 98th percentile so a few extremes don't wash out the rest
    const top = quantile(rows, 0.98, (r) => Math.abs(r.margem_pp)) ?? 1
    const lim = Math.ceil(top / 10) * 10
    const interpolate = piecewise(interpolateLab, [
      token(box, '--lula'),
      token(box, '--midpoint'),
      token(box, '--flavio'),
    ])
    const scale = scaleDiverging([-lim, 0, lim], interpolate).clamp(true)
    return {
      color: scale,
      value: (r) => r.margem_pp,
      colorAt: interpolate,
      position: (v) => (v + lim) / (2 * lim),
      ticks: [-lim, 0, lim],
      tickFormat: (v) => (v === 0 ? '0' : `${v < 0 ? 'Lula' : 'Flávio'} +${fmt.int(Math.abs(v))}`),
    }
  }
  // Clamped to the 2nd–98th percentiles: most municipalities sit in a narrow band of income
  const incomes = rows.flatMap((r) => (r.renda == null ? [] : [r.renda]))
  const lo = quantile(incomes, 0.02) ?? 1
  const hi = quantile(incomes, 0.98) ?? 1
  const interpolate = interpolateLab(token(box, '--seq-low'), token(box, '--seq-high'))
  const scale = scaleSequentialLog([lo, hi], interpolate).clamp(true)
  return {
    color: scale,
    value: (r) => r.renda,
    colorAt: interpolate,
    position: (v) => Math.log(v / lo) / Math.log(hi / lo),
    ticks: [500, 1000, 2000, 4000].filter((t) => t >= lo && t <= hi),
    tickFormat: fmt.money,
  }
}

function drawLegend(host: HTMLElement, enc: ColorEncoding, caption: string) {
  const bar = el('div', 'map-legend-bar')
  const stops = Array.from({ length: 11 }, (_, i) => `${enc.colorAt(i / 10)} ${i * 10}%`)
  bar.style.background = `linear-gradient(to right, ${stops.join(', ')})`
  const labels = el('div', 'map-legend-ticks')
  for (const tick of enc.ticks) {
    const at = enc.position(tick)
    const label = el('span', '', enc.tickFormat(tick))
    label.style.left = `${at * 100}%`
    // Keep the end labels inside the bar's width
    label.style.transform =
      at < 0.05 ? 'none' : at > 0.95 ? 'translateX(-100%)' : 'translateX(-50%)'
    labels.append(label)
  }
  const legend = el('div', 'map-legend')
  legend.append(el('span', 'map-legend-caption', caption), bar, labels)
  host.replaceChildren(legend)
}

// Municipal choropleth of Flávio's margin over Lula or of per-capita income.
export function municipalMap(
  box: HTMLElement,
  width: number,
  rows: MunicipalityRow[],
  topology: MunicipalTopology,
  metric: MapMetric,
  legendHost: HTMLElement,
) {
  const byCode = new Map(rows.map((r) => [r.ibge_code, r]))
  const municipalities = feature(topology, topology.objects.BRMU) as FeatureCollection<
    Geometry,
    Props
  >
  // The first two digits of an IBGE municipal code are its state
  const state = (g: { properties?: unknown }) => (g.properties as Props).codarea.slice(0, 2)
  const stateBorders = mesh(
    topology,
    topology.objects.BRMU,
    (a, b) => a !== b && state(a) !== state(b),
  )
  const outline = mesh(topology, topology.objects.BRMU, (a, b) => a === b)

  const mapWidth = Math.min(width, 760)
  const projection = geoConicEqualArea()
    .parallels([-2, -22])
    .rotate([54, 0])
    .fitWidth(mapWidth, municipalities)
  const path = geoPath(projection)
  const height = Math.ceil(path.bounds(municipalities)[1][1]) + 2

  const enc = encoding(box, rows, metric)
  drawLegend(
    legendHost,
    enc,
    metric === 'margem'
      ? 'Margem de Flávio sobre Lula (p.p.)'
      : 'Renda domiciliar per capita média',
  )

  const svg: Svg = select(box).append('svg').attr('width', '100%')
  svg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height)
  const g = svg.append('g').attr('transform', `translate(${(width - mapWidth) / 2},0)`)
  const fill = (f: Feature<Geometry, Props>) => {
    const row = byCode.get(f.properties.codarea)
    const v = row ? enc.value(row) : null
    return v == null ? 'var(--muted-mark)' : enc.color(v)
  }
  // A stroke in the fill color closes the hairline gaps between neighbours
  const shapes = g
    .append('g')
    .selectAll('path')
    .data(municipalities.features)
    .join('path')
    .attr('d', path)
    .style('fill', fill)
    .style('stroke', fill)
    .style('stroke-width', 0.3)
  g.append('path')
    .attr('d', path(stateBorders))
    .style('fill', 'none')
    .style('stroke', 'var(--panel)')
    .style('stroke-width', 0.8)
  g.append('path')
    .attr('d', path(outline))
    .style('fill', 'none')
    .style('stroke', 'var(--axis)')
    .style('stroke-width', 0.8)
  const hl = g
    .append('path')
    .attr('class', 'hl')
    .style('fill', 'none')
    .style('visibility', 'hidden')

  const tt = tooltip(box)
  shapes
    .on('pointermove', (event, f) => {
      const row = byCode.get(f.properties.codarea)
      if (!row) return
      hl.attr('d', path(f)).style('visibility', 'visible')
      tt.show(event, `${row.municipio} (${row.uf})`, [
        { color: regionColor(row.regiao), text: row.regiao },
        ...(row.renda == null ? [] : [{ text: `Renda per capita: ${fmt.money(row.renda)}` }]),
        { color: 'var(--flavio)', text: `Flávio: ${fmt.pct(row.pct_flavio)}` },
        { color: 'var(--lula)', text: `Lula: ${fmt.pct(row.pct_lula)}` },
        { text: `Margem: ${fmt.pp(row.margem_pp)} p.p.` },
      ])
    })
    .on('pointerleave', () => {
      hl.style('visibility', 'hidden')
      tt.hide()
    })
}
