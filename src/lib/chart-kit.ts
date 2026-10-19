import { max, pointer, type Selection } from 'd3'

export type Svg = Selection<SVGSVGElement, unknown, null, undefined>

export interface TipRow {
  text: string
  color?: string
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

export function swatch(color: string) {
  const node = el('span', 'swatch')
  node.style.background = color
  return node
}

// Widest rendered width of the given labels, measured with the chart's own text styles.
export function measure(svg: Svg, texts: string[], className = '') {
  const g = svg.append('g').attr('class', className).style('visibility', 'hidden')
  const width = max(texts, (t) => g.append('text').text(t).node()!.getComputedTextLength()) ?? 0
  g.remove()
  return Math.ceil(width)
}

export function tooltip(box: HTMLElement) {
  const tip = el('div', 'tip')
  tip.hidden = true
  box.append(tip)
  return {
    show(event: Event, head: string, rows: TipRow[]) {
      tip.replaceChildren(el('div', 'tip-head', head))
      for (const row of rows) {
        const line = el('div', 'tip-row')
        if (row.color) line.append(swatch(row.color))
        line.append(el('span', '', row.text))
        tip.append(line)
      }
      tip.hidden = false
      const [px, py] = pointer(event, box)
      let left = px + 14
      if (left + tip.offsetWidth > box.clientWidth) left = px - 14 - tip.offsetWidth
      let top = py - tip.offsetHeight - 10
      if (top < 0) top = py + 14
      tip.style.left = `${Math.max(0, left)}px`
      tip.style.top = `${top}px`
    },
    hide() {
      tip.hidden = true
    },
  }
}

// Draws into `box` now and again whenever its width changes. `sync` catches up after the box
// was revealed (an observer can miss that in a throttled tab); `redraw` forces a fresh draw.
export function mount(box: HTMLElement, draw: (box: HTMLElement, width: number) => void) {
  let lastWidth = 0
  const sync = () => {
    const width = Math.floor(box.clientWidth)
    if (!width || width === lastWidth) return
    lastWidth = width
    box.replaceChildren()
    draw(box, width)
  }
  new ResizeObserver(sync).observe(box)
  sync()
  return {
    sync,
    redraw() {
      lastWidth = 0
      sync()
    },
  }
}

export type Mounted = ReturnType<typeof mount>
