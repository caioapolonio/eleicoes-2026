import { formatRankingDelta, rankStateChanges, type StateChange } from '../lib/round-comparison'
import { candidateColor, placeName, electionRoot, type Result } from '../lib/tse'

const CANDIDATES = [
  { number: '13', name: 'Lula' },
  { number: '22', name: 'Flávio' },
]
const TOP_STATES = 7
const percent = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') => {
  const node = document.createElement(tag)
  node.textContent = text
  if (className) node.className = className
  return node
}

export function swingRanking(host: HTMLElement, onSelect: (uf: string) => void) {
  const expanded = new Set<string>()
  let current = new Map<string, Result>()
  let national: Result | undefined
  let stale = new Set<string>()

  function row(change: StateChange, name: string, scale: number) {
    const button = el('button', '', 'live-swing-row')
    button.type = 'button'
    button.dataset.uf = change.uf
    const progress = current.get(change.uf)?.progress
    const detail = `${placeName(change.uf)}. ${name}: ${percent(change.firstPercent)} no primeiro turno, ${percent(change.secondPercent)} no segundo. Variação de ${formatRankingDelta(change.deltaPp)} pontos percentuais. ${percent(progress ?? 0)} das seções totalizadas.${stale.has(change.uf) ? ' Falha na última atualização; exibindo dados anteriores.' : ''}`
    button.setAttribute('aria-label', detail)
    button.title = detail
    const uf = el('span', change.uf.toUpperCase(), 'live-swing-uf')
    const track = el('span', '', 'live-swing-track')
    track.setAttribute('aria-hidden', 'true')
    const fill = el('span', '', 'live-swing-fill')
    fill.style.width = `${scale > 0 ? (Math.abs(change.deltaPp) / scale) * 100 : 0}%`
    track.append(fill)
    const value = el('strong', formatRankingDelta(change.deltaPp), 'live-swing-value')
    if (change.deltaPp <= 0) button.classList.add('no-growth')
    if (stale.has(change.uf)) uf.append(el('span', '*', 'live-swing-stale'))
    button.append(uf, track, value)
    button.addEventListener('click', () => onSelect(change.uf))
    return button
  }
  function draw() {
    const focusedCandidate = host.contains(document.activeElement)
      ? (document.activeElement as HTMLElement).dataset.expandCandidate
      : undefined
    const rankings = CANDIDATES.map((candidate) => ({
      ...candidate,
      rows: rankStateChanges(current, candidate.number),
    }))
    // One shared scale makes a point of change the same bar length for both candidates.
    const scale = Math.max(0, ...rankings.flatMap((c) => c.rows.map((r) => Math.abs(r.deltaPp))))
    host.replaceChildren(
      ...rankings.map((candidate) => {
        const article = el('article', '', 'live-swing-candidate')
        article.dataset.candidate = candidate.number
        article.style.setProperty('--swing-color', candidateColor(candidate.number))
        const heading = el('h3')
        const portrait = national?.raw.carg
          .flatMap((c) => c.agr.flatMap((a) => a.par.flatMap((p) => p.cand)))
          .find((c) => c.n === candidate.number)
        if (portrait && /^\d+$/.test(portrait.sqcand)) {
          const img = el('img')
          img.alt = ''
          img.width = 28
          img.height = 28
          img.loading = 'lazy'
          img.src = `${electionRoot({ election: national!.raw.ele, cycle: 'ele2026', office: '1', uf: 'br' })}/fotos/br/${portrait.sqcand}.jpeg`
          img.addEventListener('error', () => img.remove(), { once: true })
          heading.append(img)
        } else heading.append(el('span', '', 'live-swing-avatar'))
        heading.append(el('span', `Onde ${candidate.name} cresceu`))
        article.append(heading)
        const positive = candidate.rows.filter((r) => r.deltaPp > 0)
        const initial = positive.slice(0, TOP_STATES)
        const shown = expanded.has(candidate.number) ? candidate.rows : initial
        if (!candidate.rows.length) {
          article.append(
            el(
              'p',
              'Aguardando votos divulgados para comparar os estados.',
              'note live-swing-empty',
            ),
          )
        } else if (!positive.length && !expanded.has(candidate.number)) {
          article.append(
            el(
              'p',
              'Nenhum estado com crescimento nos resultados disponíveis.',
              'note live-swing-empty',
            ),
          )
        }
        const list = el('div', '', 'live-swing-list')
        list.id = `swing-list-${candidate.number}`
        list.append(...shown.map((r) => row(r, candidate.name, scale)))
        article.append(list)
        const remaining = candidate.rows.length - initial.length
        if (remaining > 0) {
          const label = expanded.has(candidate.number)
            ? 'Mostrar menos'
            : initial.length
              ? `+ ${remaining} ${remaining === 1 ? 'estado com mudança menor' : 'estados com mudança menor'}`
              : `Ver variação nos ${remaining} estados`
          const toggle = el('button', label, 'live-swing-toggle')
          toggle.type = 'button'
          toggle.dataset.expandCandidate = candidate.number
          toggle.setAttribute('aria-expanded', String(expanded.has(candidate.number)))
          toggle.setAttribute('aria-controls', list.id)
          toggle.addEventListener('click', () => {
            if (expanded.has(candidate.number)) expanded.delete(candidate.number)
            else expanded.add(candidate.number)
            draw()
          })
          article.append(toggle)
        }
        return article
      }),
    )
    if (focusedCandidate)
      host
        .querySelector<HTMLButtonElement>(`[data-expand-candidate="${focusedCandidate}"]`)
        ?.focus({ preventScroll: true })
    const count = rankings[0]?.rows.length ?? 0
    const status = document.getElementById('swing-ranking-status')
    if (status)
      status.textContent = `${count} de 27 UFs com votos divulgados${stale.size ? ' · * dados anteriores em estados com falha de atualização' : ''}`
  }
  draw()
  return (results: Map<string, Result>, result?: Result, staleStates = new Set<string>()) => {
    current = results
    national = result
    stale = staleStates
    draw()
  }
}
