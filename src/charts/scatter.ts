import {
  Delaunay,
  axisBottom,
  axisLeft,
  extent,
  max,
  pointer,
  scaleLinear,
  scaleLog,
  select,
} from 'd3'
import { fmt } from '../lib/format'
import { regionColor, type MunicipalityRow } from '../lib/data'
import { measure, tooltip, type Svg } from '../lib/chart-kit'

type Plotted = MunicipalityRow & { renda: number }

// Income (log) against Flávio's margin over Lula, one dot per municipality.
// With `focus` set, that region keeps its color and the rest turn gray.
export function incomeScatter(
  box: HTMLElement,
  width: number,
  rows: MunicipalityRow[],
  focus: string | null,
) {
  const data = rows.filter((r): r is Plotted => r.renda != null && r.renda > 0)
  const height = Math.round(Math.min(500, Math.max(320, width * 0.55)))
  const svg: Svg = select(box).append('svg').attr('width', '100%')
  svg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height)

  const lim = max(data, (d) => Math.abs(d.margem_pp)) ?? 0
  const y = scaleLinear([-lim, lim], [0, 0]).nice()
  const yTicks = y.ticks(6)
  const m = { top: 12, right: 12, bottom: 30, left: measure(svg, yTicks.map(fmt.ppAxis)) + 10 }
  y.range([height - m.bottom, m.top])
  const [lo, hi] = extent(data, (d) => d.renda) as [number, number]
  const x = scaleLog([lo / 1.05, hi * 1.05], [m.left, width - m.right])
  const xTicks = x.ticks().filter((t) => [1, 2, 5].includes(Number(String(t)[0])))

  svg
    .append('g')
    .attr('class', 'grid-lines')
    .selectAll('line')
    .data(yTicks)
    .join('line')
    .attr('x1', m.left)
    .attr('x2', width - m.right)
    .attr('y1', (d) => y(d))
    .attr('y2', (d) => y(d))
  svg
    .append('g')
    .attr('class', 'grid-lines')
    .selectAll('line')
    .data(xTicks)
    .join('line')
    .attr('x1', (d) => x(d))
    .attr('x2', (d) => x(d))
    .attr('y1', m.top)
    .attr('y2', height - m.bottom)
  svg
    .append('g')
    .attr('transform', `translate(${m.left},0)`)
    .call(
      axisLeft(y)
        .tickValues(yTicks)
        .tickSize(0)
        .tickPadding(8)
        .tickFormat((d) => fmt.ppAxis(+d)),
    )
    .attr('font-size', null)
    .attr('font-family', null)
    .call((g) => g.select('.domain').remove())
  svg
    .append('g')
    .attr('transform', `translate(0,${height - m.bottom})`)
    .call(
      axisBottom(x)
        .tickValues(xTicks)
        .tickSize(0)
        .tickPadding(10)
        .tickFormat((d) => fmt.money(+d)),
    )
    .attr('font-size', null)
    .attr('font-family', null)
    .call((g) => g.select('.domain').remove())
  svg
    .append('line')
    .attr('class', 'ref')
    .attr('x1', m.left)
    .attr('x2', width - m.right)
    .attr('y1', y(0))
    .attr('y2', y(0))

  // Gray points first so the focused region sits on top
  const ordered = focus
    ? [...data.filter((d) => d.regiao !== focus), ...data.filter((d) => d.regiao === focus)]
    : data
  svg
    .append('g')
    .selectAll('circle')
    .data(ordered)
    .join('circle')
    .attr('cx', (d) => x(d.renda))
    .attr('cy', (d) => y(d.margem_pp))
    .attr('r', 2.2)
    .style('fill', (d) =>
      !focus || d.regiao === focus ? regionColor(d.regiao) : 'var(--muted-mark)',
    )
    .style('fill-opacity', (d) => (!focus || d.regiao === focus ? 0.6 : 0.45))
  svg
    .append('text')
    .attr('x', m.left + 6)
    .attr('y', m.top + 10)
    .text('Flávio à frente ↑')
  svg
    .append('text')
    .attr('x', m.left + 6)
    .attr('y', height - m.bottom - 8)
    .text('Lula à frente ↓')

  const hl = svg.append('circle').attr('class', 'hl').attr('r', 5).style('visibility', 'hidden')
  const tt = tooltip(box)
  const pickable = focus ? data.filter((d) => d.regiao === focus) : data
  const delaunay = Delaunay.from(
    pickable,
    (d) => x(d.renda),
    (d) => y(d.margem_pp),
  )
  svg
    .append('rect')
    .attr('x', m.left)
    .attr('y', m.top)
    .attr('width', width - m.left - m.right)
    .attr('height', height - m.top - m.bottom)
    .style('fill', 'transparent')
    .on('pointermove', (event) => {
      const [px, py] = pointer(event, svg.node())
      const d = pickable[delaunay.find(px, py)]
      if (!d || Math.hypot(x(d.renda) - px, y(d.margem_pp) - py) > 32) {
        hl.style('visibility', 'hidden')
        tt.hide()
        return
      }
      hl.attr('cx', x(d.renda))
        .attr('cy', y(d.margem_pp))
        .style('fill', regionColor(d.regiao))
        .style('visibility', 'visible')
      tt.show(event, `${d.municipio} (${d.uf})`, [
        { color: regionColor(d.regiao), text: d.regiao },
        { text: `Renda per capita: ${fmt.money(d.renda)}` },
        { color: 'var(--flavio)', text: `Flávio: ${fmt.pct(d.pct_flavio)}` },
        { color: 'var(--lula)', text: `Lula: ${fmt.pct(d.pct_lula)}` },
        { text: `${fmt.int(d.votos_validos)} votos válidos` },
      ])
    })
    .on('pointerleave', () => {
      hl.style('visibility', 'hidden')
      tt.hide()
    })
}
