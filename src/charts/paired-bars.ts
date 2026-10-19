import { axisBottom, max, scaleLinear, select } from 'd3'
import { CANDIDATES, type CandidateKey } from '../lib/data'
import { measure, tooltip, type Svg, type TipRow } from '../lib/chart-kit'

interface Options<Row> {
  label: (row: Row) => string
  value: (row: Row, candidate: CandidateKey) => number
  format: (value: number) => string
  tip: (row: Row) => { head: string; rows: TipRow[] }
}

// Two horizontal bars per row (Flávio, Lula) on one shared scale.
export function pairedBars<Row>(box: HTMLElement, width: number, rows: Row[], o: Options<Row>) {
  const barH = 10
  const inner = 2
  const rowGap = 18
  const rowH = barH * 2 + inner
  const svg: Svg = select(box).append('svg').attr('width', '100%')
  const labelW = measure(svg, rows.map(o.label))
  const valueW = measure(
    svg,
    rows.flatMap((r) => CANDIDATES.map((c) => o.format(o.value(r, c.key)))),
    'val',
  )
  const m = { top: 4, right: valueW + 10, bottom: 26, left: labelW + 12 }
  const height = m.top + rows.length * (rowH + rowGap) - rowGap + m.bottom
  svg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height)

  const top = max(rows, (r) => max(CANDIDATES, (c) => o.value(r, c.key))) ?? 0
  const x = scaleLinear([0, top], [m.left, width - m.right]).nice()
  const ticks = x.ticks(Math.max(2, Math.floor((width - m.left - m.right) / 70)))
  const plotBottom = height - m.bottom

  svg
    .append('g')
    .attr('class', 'grid-lines')
    .selectAll('line')
    .data(ticks)
    .join('line')
    .attr('x1', (d) => x(d))
    .attr('x2', (d) => x(d))
    .attr('y1', 0)
    .attr('y2', plotBottom)
  svg
    .append('g')
    .attr('transform', `translate(0,${plotBottom})`)
    .call(
      axisBottom(x)
        .tickValues(ticks)
        .tickSize(0)
        .tickPadding(10)
        .tickFormat((d) => o.format(+d)),
    )
    .attr('font-size', null)
    .attr('font-family', null)
    .call((g) => g.select('.domain').remove())

  const row = svg
    .append('g')
    .selectAll('g')
    .data(rows)
    .join('g')
    .attr('transform', (_, i) => `translate(0,${m.top + i * (rowH + rowGap)})`)
  row
    .append('text')
    .attr('x', m.left - 12)
    .attr('y', rowH / 2)
    .attr('dy', '0.35em')
    .attr('text-anchor', 'end')
    .text(o.label)
  CANDIDATES.forEach((c, j) => {
    const y = j * (barH + inner)
    row
      .append('rect')
      .attr('x', m.left)
      .attr('y', y)
      .attr('height', barH)
      .attr('rx', 3)
      .attr('width', (d) => Math.max(0, x(o.value(d, c.key)) - m.left))
      .style('fill', c.color)
    row
      .append('text')
      .attr('class', 'val')
      .attr('x', (d) => x(o.value(d, c.key)) + 6)
      .attr('y', y + barH / 2)
      .attr('dy', '0.35em')
      .text((d) => o.format(o.value(d, c.key)))
  })

  const tt = tooltip(box)
  row
    .append('rect')
    .attr('x', 0)
    .attr('y', -rowGap / 2)
    .attr('width', width)
    .attr('height', rowH + rowGap)
    .style('fill', 'transparent')
    .on('pointermove', (event, d) => {
      const t = o.tip(d)
      tt.show(event, t.head, t.rows)
    })
    .on('pointerleave', () => tt.hide())
}
