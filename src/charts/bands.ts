import { axisBottom, axisLeft, extent, line, scaleLinear, select } from 'd3'
import { fmt } from '../lib/format'
import { CANDIDATES, type BandRow } from '../lib/data'
import { measure, tooltip, type Svg } from '../lib/chart-kit'

// One line per candidate across the ten vote-weighted bands of a census variable.
export function bandLines(
  box: HTMLElement,
  width: number,
  data: BandRow[],
  format: (v: number) => string,
  yMax: number,
) {
  const height = 230
  const svg: Svg = select(box).append('svg').attr('width', '100%')
  svg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height)
  const y = scaleLinear([0, yMax], [0, 0])
  const yTicks = y.ticks(4)
  const endW = measure(
    svg,
    CANDIDATES.map((c) => c.short),
    'end',
  )
  const m = { top: 10, right: endW + 12, bottom: 28, left: measure(svg, yTicks.map(fmt.pct0)) + 10 }
  y.range([height - m.bottom, m.top])
  const [lo, hi] = extent(data, (d) => d.x_mediana) as [number, number]
  const x = scaleLinear([lo, hi], [m.left + 6, width - m.right])
  const xTicks = x.ticks(Math.max(3, Math.floor((width - m.left - m.right) / 60)))

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
    .attr('transform', `translate(${m.left},0)`)
    .call(
      axisLeft(y)
        .tickValues(yTicks)
        .tickSize(0)
        .tickPadding(8)
        .tickFormat((d) => fmt.pct0(+d)),
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
        .tickSize(4)
        .tickPadding(6)
        .tickFormat((d) => format(+d)),
    )
    .attr('font-size', null)
    .attr('font-family', null)
    .call((g) => g.select('.domain').attr('d', `M${m.left},0H${width - m.right}`))
    .call((g) => g.selectAll('.domain, .tick line').style('stroke', 'var(--axis)'))

  for (const c of CANDIDATES) {
    const key = `pct_${c.key}` as const
    svg
      .append('path')
      .datum(data)
      .attr('class', 'line')
      .style('stroke', c.color)
      .attr(
        'd',
        line<BandRow>(
          (d) => x(d.x_mediana),
          (d) => y(d[key]),
        ),
      )
    svg
      .append('g')
      .selectAll('circle')
      .data(data)
      .join('circle')
      .attr('class', 'dot')
      .attr('cx', (d) => x(d.x_mediana))
      .attr('cy', (d) => y(d[key]))
      .attr('r', 4)
      .style('fill', c.color)
  }

  // Name each line at its end, nudging the two labels apart when they would touch
  const last = data[data.length - 1]
  const ends = CANDIDATES.map((c) => ({ c, y: y(last[`pct_${c.key}`]) })).sort((a, b) => a.y - b.y)
  if (ends[1].y - ends[0].y < 14) {
    const mid = (ends[0].y + ends[1].y) / 2
    ends[0].y = mid - 7
    ends[1].y = mid + 7
  }
  for (const end of ends) {
    svg
      .append('text')
      .attr('class', 'end')
      .attr('x', x(last.x_mediana) + 8)
      .attr('y', end.y)
      .attr('dy', '0.35em')
      .text(end.c.short)
  }

  const tt = tooltip(box)
  const rule = svg
    .append('line')
    .attr('class', 'rule')
    .attr('y1', m.top)
    .attr('y2', height - m.bottom)
    .style('visibility', 'hidden')
  const xs = data.map((d) => x(d.x_mediana))
  const left = (i: number) => (i === 0 ? m.left : (xs[i - 1] + xs[i]) / 2)
  const right = (i: number) =>
    i === data.length - 1 ? width - m.right + 6 : (xs[i] + xs[i + 1]) / 2
  svg
    .append('g')
    .selectAll('rect')
    .data(data)
    .join('rect')
    .attr('x', (_, i) => left(i))
    .attr('width', (_, i) => Math.max(0, right(i) - left(i)))
    .attr('y', m.top)
    .attr('height', height - m.top - m.bottom)
    .style('fill', 'transparent')
    .on('pointermove', (event, d) => {
      rule.attr('x1', x(d.x_mediana)).attr('x2', x(d.x_mediana)).style('visibility', 'visible')
      tt.show(event, `Faixa ${d.faixa}: ${format(d.x_min)} a ${format(d.x_max)}`, [
        ...CANDIDATES.map((c) => ({
          color: c.color,
          text: `${c.short}: ${fmt.pct(d[`pct_${c.key}`])}`,
        })),
        { text: `${fmt.int(d.municipios)} municípios · ${fmt.int(d.valid_votes)} votos válidos` },
      ])
    })
    .on('pointerleave', () => {
      rule.style('visibility', 'hidden')
      tt.hide()
    })
}
