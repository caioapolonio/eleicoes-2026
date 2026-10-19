import { axisBottom, max, scaleLinear, select } from 'd3'
import { fmt } from '../lib/format'
import { CANDIDATES, type StateRow } from '../lib/data'
import { measure, tooltip, type Svg } from '../lib/chart-kit'

// Diverging bars: Flávio's lead to the right, Lula's to the left.
export function stateMargins(box: HTMLElement, width: number, rows: StateRow[]) {
  const barH = 12
  const step = 19
  const svg: Svg = select(box).append('svg').attr('width', '100%')
  const labelW = measure(
    svg,
    rows.map((r) => r.state),
  )
  const valueW =
    measure(
      svg,
      rows.map((r) => fmt.pp(r.margem_pp)),
      'val',
    ) + 6
  const m = { top: 24, right: valueW, bottom: 26, left: labelW + 10 + valueW }
  const height = m.top + rows.length * step + m.bottom
  svg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height)

  const lim = max(rows, (r) => Math.abs(r.margem_pp)) ?? 0
  const x = scaleLinear([-lim, lim], [m.left, width - m.right]).nice()
  const x0 = x(0)
  const ticks = x.ticks(Math.max(2, Math.floor((width - m.left - m.right) / 60)))
  const plotBottom = height - m.bottom
  const color = (r: StateRow) => (r.margem_pp >= 0 ? 'var(--flavio)' : 'var(--lula)')

  svg
    .append('g')
    .attr('class', 'grid-lines')
    .selectAll('line')
    .data(ticks)
    .join('line')
    .attr('x1', (d) => x(d))
    .attr('x2', (d) => x(d))
    .attr('y1', m.top - 6)
    .attr('y2', plotBottom)
  svg
    .append('g')
    .attr('transform', `translate(0,${plotBottom})`)
    .call(
      axisBottom(x)
        .tickValues(ticks)
        .tickSize(0)
        .tickPadding(10)
        .tickFormat((d) => fmt.ppAxis(+d)),
    )
    .attr('font-size', null)
    .attr('font-family', null)
    .call((g) => g.select('.domain').remove())
  svg
    .append('text')
    .attr('x', x0 - 8)
    .attr('y', 10)
    .attr('text-anchor', 'end')
    .text('← Lula à frente')
  svg
    .append('text')
    .attr('x', x0 + 8)
    .attr('y', 10)
    .text('Flávio à frente →')

  const row = svg
    .append('g')
    .selectAll('g')
    .data(rows)
    .join('g')
    .attr('transform', (_, i) => `translate(0,${m.top + i * step})`)
  row
    .append('text')
    .attr('x', labelW)
    .attr('y', barH / 2)
    .attr('dy', '0.35em')
    .attr('text-anchor', 'end')
    .text((d) => d.state)
  row
    .append('rect')
    .attr('y', 0)
    .attr('height', barH)
    .attr('rx', 3)
    .attr('x', (d) => Math.min(x0, x(d.margem_pp)))
    .attr('width', (d) => Math.abs(x(d.margem_pp) - x0))
    .style('fill', color)
  row
    .append('text')
    .attr('class', 'val')
    .attr('y', barH / 2)
    .attr('dy', '0.35em')
    .attr('x', (d) => (d.margem_pp >= 0 ? x(d.margem_pp) + 5 : x(d.margem_pp) - 5))
    .attr('text-anchor', (d) => (d.margem_pp >= 0 ? 'start' : 'end'))
    .text((d) => fmt.pp(d.margem_pp))
  svg
    .append('line')
    .attr('class', 'ref')
    .attr('x1', x0)
    .attr('x2', x0)
    .attr('y1', m.top - 6)
    .attr('y2', plotBottom)

  const tt = tooltip(box)
  row
    .append('rect')
    .attr('x', 0)
    .attr('y', -(step - barH) / 2)
    .attr('width', width)
    .attr('height', step)
    .style('fill', 'transparent')
    .on('pointermove', (event, d) =>
      tt.show(event, `${d.state} · ${d.region}`, [
        ...CANDIDATES.map((c) => ({
          color: c.color,
          text: `${c.short}: ${fmt.pct(d[`pct_${c.key}`])}`,
        })),
        { text: `Margem: ${fmt.pp(d.margem_pp)} p.p.` },
      ]),
    )
    .on('pointerleave', () => tt.hide())
}
