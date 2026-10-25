import { firstRoundSource } from '../lib/round-comparison'
import { swingRanking } from './swing-ranking'
import { sectionExplorer } from './sections'
import {
  CONFIG_URL,
  DISCLOSURE_AT,
  POLL_MS,
  STATES,
  TseClient,
  candidateColor,
  discoverContests,
  leader,
  mapLimited,
  municipalitiesUrl,
  placeName,
  progressUrl,
  resultUrl,
  tseNumber,
  type Candidate,
  type Catalog,
  type Contest,
  type ElectionConfig,
  type MunicipalityConfig,
  type ProgressFile,
  type Result,
  type Totals,
} from '../lib/tse'
import { createLiveMap, type LiveMapMetric } from '../charts/live-map'

const nf = new Intl.NumberFormat('pt-BR')
const pf = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const count = (n: number | null | undefined) => (n == null ? '—' : nf.format(n))
const pct = (n: number | null | undefined) => (n == null ? '—' : `${pf.format(n)}%`)
const clock = () => new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') => {
  const el = document.createElement(tag)
  el.textContent = text
  if (className) el.className = className
  return el
}
const link = (text: string, href: string) => {
  const a = node('a', text)
  a.href = href
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  return a
}
const stamp = (r: Result) => `Arquivo do TSE: ${r.raw.dg} às ${r.raw.hg} (Brasília)`

function progressBar(result: Result) {
  const box = node('div', '', 'live-progress')
  const label = node('div', '', 'live-progress-label')
  label.append(
    node('strong', `${pct(result.progress)} das seções totalizadas`),
    node('span', `${count(result.counted)} de ${count(result.sections)}`),
  )
  const bar = node('progress')
  bar.max = 100
  bar.value = result.progress ?? 0
  bar.setAttribute('aria-label', 'Seções totalizadas')
  box.append(label, bar)
  return box
}
function candidatesView(result: Result, compact = false) {
  const list = node('div', '', compact ? 'live-candidates compact' : 'live-candidates')
  // Stable order avoids moving the candidates as their vote totals change.
  for (const [index, c] of [...result.candidates]
    .sort((a, b) => Number(a.number) - Number(b.number))
    .entries()) {
    const item = node('article', '', 'live-candidate')
    item.dataset.candidate = c.number
    const color =
      result.raw.carg[0].cd === '1'
        ? candidateColor(c.number)
        : index === 0
          ? 'var(--seq-high)'
          : 'var(--reg-sudeste)'
    item.style.setProperty('--candidate-color', color)
    const heading = node('div', '', 'live-candidate-heading')
    const name = node('h3', c.name)
    const party = node('span', `${c.party} · ${c.number}`, 'note')
    heading.append(name, party)
    if (c.elected && (result.raw.cdabr === 'br' || result.raw.carg[0].cd !== '1')) {
      heading.append(node('span', 'Eleito · TSE', 'live-elected'))
    }
    const values = node('div', '', 'live-candidate-values')
    values.append(node('strong', pct(c.percent)), node('span', `${count(c.votes)} votos`, 'note'))
    const track = node('div', '', 'live-vote-track')
    const fill = node('div')
    fill.style.width = `${Math.min(100, Math.max(0, c.percent ?? 0))}%`
    track.append(fill)
    item.append(heading, values, track)
    if (!compact) item.append(node('p', `Vice: ${c.vice || 'Não informado'}`, 'note'))
    list.append(item)
  }
  return list
}
function statsView(result: Result) {
  const stats = node('dl', '', 'live-stats')
  for (const [label, key, percentKey] of [
    ['Eleitores aptos', 'te', ''],
    ['Comparecimento', 'c', 'pc'],
    ['Abstenção', 'a', 'pa'],
    ['Votos válidos', 'vv', 'pvv'],
    ['Brancos', 'vb', 'pvb'],
    ['Nulos', 'tvn', 'ptvn'],
  ]) {
    const totals = ['te', 'c', 'a'].includes(key) ? result.raw.e : result.raw.v
    const item = node('div')
    const value = !result.disclosed && totals === result.raw.v ? null : tseNumber(totals[key])
    item.append(node('dt', label), node('dd', count(value)))
    if (percentKey && result.started && (totals !== result.raw.v || result.disclosed)) {
      item.append(node('span', pct(tseNumber(totals[percentKey])), 'note'))
    }
    stats.append(item)
  }
  return stats
}
function resultView(host: HTMLElement, result: Result, compact = false) {
  const message = !result.disclosed
    ? 'O TSE ainda não liberou a divulgação dos votos nesta abrangência.'
    : !result.started
      ? 'Aguardando o início da apuração. Os zeros são do arquivo oficial de preparação.'
      : result.final
        ? 'Totalização final informada pelo TSE.'
        : result.raw.and === 'f'
          ? 'Seções totalizadas. Aguardando a totalização final do TSE.'
          : 'Resultado parcial. A apuração continua.'
  host.replaceChildren(
    progressBar(result),
    candidatesView(result, compact),
    statsView(result),
    node('p', message, 'note'),
  )
  host.setAttribute('aria-busy', 'false')
}

const sectionLabels: Record<string, string> = {
  ts: 'Total de seções',
  st: 'Seções totalizadas',
  snt: 'Seções não totalizadas',
  si: 'Seções instaladas',
  sni: 'Seções não instaladas',
  sa: 'Seções apuradas',
  sna: 'Seções não apuradas',
}
const voterLabels: Record<string, string> = {
  te: 'Total de eleitores aptos',
  est: 'Eleitores em seções totalizadas',
  esnt: 'Eleitores em seções não totalizadas',
  esi: 'Eleitores em seções instaladas',
  esni: 'Eleitores em seções não instaladas',
  esa: 'Eleitores em seções apuradas',
  esna: 'Eleitores em seções não apuradas',
  c: 'Comparecimento',
  a: 'Abstenção',
}
const voteLabels: Record<string, string> = {
  tv: 'Total de votos',
  vvc: 'Votos em candidaturas',
  vv: 'Votos válidos',
  vnom: 'Votos nominais',
  vl: 'Votos de legenda',
  van: 'Votos anulados',
  vansj: 'Votos anulados sub judice',
  vb: 'Votos em branco',
  tvn: 'Total de votos nulos',
  vn: 'Votos nulos',
  vnt: 'Votos nulos técnicos',
  vsan: 'Votos de seções anuladas',
  vscv: 'Votos de seções cujos votos não foram computados',
}
function totalsView(
  title: string,
  totals: Totals,
  labels: Record<string, string>,
  disclosed = true,
) {
  const details = node('details', '', 'live-totals')
  details.append(node('summary', title))
  const dl = node('dl', '', 'live-detail-list')
  for (const [key, label] of Object.entries(labels)) {
    if (!(key in totals)) continue
    const row = node('div')
    const percentKey = key === 'tvn' ? 'ptvn' : `p${key}`
    const percent = tseNumber(totals[percentKey])
    row.append(
      node('dt', label),
      node(
        'dd',
        `${disclosed ? count(tseNumber(totals[key])) : '—'}${disclosed && percent != null ? ` (${pct(percent)})` : ''}`,
      ),
    )
    dl.append(row)
  }
  details.append(dl)
  return details
}

export function startDashboard() {
  if (!document.getElementById('live-dashboard')) return
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
  const client = new TseClient()
  const setSectionScope = sectionExplorer(client)
  let catalog: Catalog | undefined
  let config: MunicipalityConfig | undefined
  let selectedContest: Contest | undefined
  let national: Result | undefined
  let abroad: Result | undefined
  let selected: Result | undefined
  let selectionVersion = 0
  let updating = false
  let lastCycle = 0
  let failuresInARow = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let drawMap: Awaited<ReturnType<typeof createLiveMap>> | undefined
  const states = new Map<string, Result>()
  const cities = new Map<string, Result>()
  const governors = new Map<string, Result>()
  const errors = new Map<string, string>()
  const cityVersions = new Map<string, string>()
  const cityProgress = new Map<string, ProgressFile['abr'][number]>()
  const ufSelect = $<HTMLSelectElement>('live-uf')
  const munSelect = $<HTMLSelectElement>('live-municipality')
  const zoneSelect = $<HTMLSelectElement>('live-zone')
  const refreshButton = $<HTMLButtonElement>('refresh-live')
  const search = $<HTMLInputElement>('abroad-search')
  const metric = $<HTMLSelectElement>('map-metric')
  const sort = $<HTMLSelectElement>('states-sort')
  const renderSwing = swingRanking($('swing-rankings'), (uf) => {
    void choose(uf)
    $('place-title').scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      block: 'center',
    })
  })
  const errorMessage = (error: unknown) =>
    error instanceof Error ? error.message : 'Falha na consulta ao TSE.'
  const isPresident = () => selectedContest?.office === '1'
  const selectedMunicipality = () =>
    config?.abr.find((a) => a.cd === ufSelect.value)?.mu.find((m) => m.cd === munSelect.value)
  const scopeName = () =>
    `${isPresident() ? 'Presidente' : 'Governador'} · ${selectedMunicipality()?.nm ?? placeName(ufSelect.value)}${zoneSelect.value ? ` · Zona ${Number(zoneSelect.value)}` : ''}`

  async function attempt<T>(url: string, task: () => Promise<T>): Promise<T | undefined> {
    try {
      const value = await task()
      errors.delete(url)
      return value
    } catch (error) {
      errors.set(url, errorMessage(error))
      return undefined
    }
  }
  function unavailable(
    host: HTMLElement,
    text = 'Não foi possível consultar este resultado. A próxima atualização tentará novamente.',
  ) {
    host.replaceChildren(node('p', text, 'live-unavailable'))
    host.setAttribute('aria-busy', 'false')
  }
  function setOptions(
    select: HTMLSelectElement,
    empty: string,
    values: { value: string; label: string }[],
  ) {
    select.replaceChildren(
      new Option(empty, ''),
      ...values.map((v) => new Option(v.label, v.value)),
    )
    select.disabled = values.length === 0
  }
  function renderLegend() {
    const legend = $('map-legend')
    legend.replaceChildren()
    if (metric.value === 'progress') {
      legend.append(
        node('span', '0%'),
        node('span', '', 'live-progress-ramp'),
        node('span', '100%'),
      )
    } else {
      for (const c of national?.candidates ?? []) {
        const label = node('span', '', 'live-legend-item')
        const swatch = node('i', '', 'swatch')
        swatch.style.background = candidateColor(c.number)
        label.append(swatch, node('span', c.name))
        legend.append(label)
      }
      const label = node('span', '', 'live-legend-item')
      const swatch = node('i', '', 'swatch')
      swatch.style.background = 'var(--muted-mark)'
      label.append(swatch, node('span', 'Sem liderança'))
      legend.append(label)
    }
  }
  function renderMap() {
    drawMap?.(states, ufSelect.value, metric.value as LiveMapMetric)
    renderLegend()
  }
  function tableHeading(table: HTMLTableElement, location: string, candidates: Candidate[]) {
    const tr = node('tr')
    for (const title of [
      location,
      ...candidates.map((c) => c.name),
      'Votos válidos',
      'Seções totalizadas',
    ]) {
      const th = node('th', title)
      th.scope = 'col'
      tr.append(th)
    }
    table.tHead!.replaceChildren(tr)
  }
  function tableRow(
    label: string,
    r: Result | undefined,
    candidates: Candidate[],
    action: () => void,
    progress?: ProgressFile['abr'][number],
  ) {
    const tr = node('tr')
    const th = node('th')
    th.scope = 'row'
    const button = node('button', label, 'live-table-place')
    button.type = 'button'
    button.addEventListener('click', action)
    th.append(button)
    if (r && errors.has(r.url))
      th.append(node('span', 'Falha na consulta; exibindo dados anteriores', 'live-row-error'))
    tr.append(th)
    for (const c of candidates) {
      const candidate = r?.candidates.find((x) => x.number === c.number)
      const td = node('td')
      td.dataset.candidate = c.number
      // EA15 progress has no vote counts: never infer votes from section progress.
      td.append(
        node('strong', pct(candidate?.percent)),
        node('span', count(candidate?.votes), 'note'),
      )
      if (leader(r)?.number === c.number) td.classList.add('live-leading')
      tr.append(td)
    }
    tr.append(node('td', count(r?.valid)))
    const p = node('td', pct(r?.progress ?? tseNumber(progress?.s.pst)))
    p.append(
      node(
        'span',
        `${count(r?.counted ?? tseNumber(progress?.s.st))} / ${count(r?.sections ?? tseNumber(progress?.s.ts))}`,
        'note',
      ),
    )
    tr.append(p)
    return tr
  }
  function renderStates() {
    const table = $<HTMLTableElement>('states-table')
    const candidates = national?.candidates ?? []
    tableHeading(table, 'Estado', candidates)
    const items = Object.entries(STATES).sort(([a, x], [b, y]) => {
      if (sort.value === 'progress')
        return (states.get(b)?.progress ?? -1) - (states.get(a)?.progress ?? -1)
      if (sort.value === 'votes') return (states.get(b)?.valid ?? -1) - (states.get(a)?.valid ?? -1)
      return x.name.localeCompare(y.name, 'pt-BR')
    })
    table.tBodies[0].replaceChildren(
      ...items.map(([uf, s]) =>
        tableRow(s.name, states.get(uf), candidates, () => void choose(uf)),
      ),
    )
    $('states-status').textContent =
      `${states.size} de 27 abrangências consultadas${Object.keys(STATES).some((uf) => catalog && errors.has(resultUrl(catalog.president, uf))) ? ' · Há falhas de atualização' : ''}`
    renderMap()
    renderSwing(
      states,
      national,
      new Set(
        Object.keys(STATES).filter((uf) => catalog && errors.has(resultUrl(catalog.president, uf))),
      ),
    )
  }
  function renderAbroad() {
    const table = $<HTMLTableElement>('abroad-table')
    const candidates = national?.candidates ?? abroad?.candidates ?? []
    tableHeading(table, 'Localidade', candidates)
    const normalize = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
    const q = normalize(search.value)
    const all = config?.abr.find((a) => a.cd === 'zz')?.mu ?? []
    const places = all
      .filter((m) => normalize(m.nm).includes(q))
      .sort((a, b) => a.nm.localeCompare(b.nm, 'pt-BR'))
    table.tBodies[0].replaceChildren(
      ...places.map((m) =>
        tableRow(
          m.nm,
          cities.get(m.cd),
          candidates,
          () => void choose('zz', m.cd),
          cityProgress.get(m.cd),
        ),
      ),
    )
    $('abroad-count').textContent = `${places.length} de ${all.length} localidades`
    $('abroad-status').textContent = !all.length
      ? 'Aguardando a configuração de localidades do TSE.'
      : `Resultados consultados: ${cities.size} de ${all.length} localidades.${errors.size ? ' As consultas com falha serão repetidas automaticamente.' : ''}`
  }
  function renderData(result: Result) {
    $('data-scope').textContent = scopeName()
    const host = $('complete-data')
    const meta = node('details', '', 'live-totals')
    meta.append(node('summary', 'Situação e candidaturas'))
    const dl = node('dl', '', 'live-detail-list')
    const entries = [
      [
        'Situação',
        result.final
          ? 'Totalização final'
          : result.raw.and === 'n'
            ? 'Não iniciada'
            : result.raw.and === 'f'
              ? 'Seções totalizadas'
              : 'Parcial',
      ],
      [
        'Última totalização',
        result.raw.dt ? `${result.raw.dt} ${result.raw.ht} (Brasília)` : 'Ainda não iniciada',
      ],
      ['Geração do arquivo', `${result.raw.dg} ${result.raw.hg} (Brasília)`],
      ['Divulgação dos votos', result.disclosed ? 'Liberada pelo TSE' : 'Ainda não liberada'],
      [
        'Definição matemática',
        result.raw.md === 'e' ? 'Eleito definido pelo TSE' : 'Sem definição informada',
      ],
      ...result.candidates.map((c) => [
        `${c.fullName} (${c.party})`,
        `Coligação/partido: ${c.coalition}. Vice: ${c.vice || 'Não informado'}. Situação: ${c.status || 'Não informada'}${c.elected ? ' · Eleito informado pelo TSE' : ''}.`,
      ]),
      ...(result.raw.mntf ? [['Motivo de totalização pendente', result.raw.mntf]] : []),
      ...(result.raw.mnae?.length
        ? [['Sem atribuição de eleitos', result.raw.mnae.join('; ')]]
        : []),
    ]
    for (const [label, value] of entries) {
      const row = node('div')
      row.append(node('dt', label), node('dd', value))
      dl.append(row)
    }
    meta.append(dl)
    host.replaceChildren(
      totalsView('Seções eleitorais', result.raw.s, sectionLabels),
      totalsView('Eleitorado e participação', result.raw.e, voterLabels),
      totalsView('Todos os tipos de voto', result.raw.v, voteLabels, result.disclosed),
      meta,
    )
    $('raw-json').textContent = JSON.stringify(result.raw, null, 2)
    $<HTMLButtonElement>('download-json').disabled = false
  }
  function renderSelected() {
    $('place-title').textContent = scopeName()
    if (!selected) return
    resultView($('place-result'), selected, true)
    $('place-time').textContent =
      `${stamp(selected)}${errors.has(selected.url) ? ' · Falha na atualização; dados anteriores' : ''}`
    $<HTMLAnchorElement>('place-source').href = selected.url
    renderData(selected)
    renderSources()
  }
  function renderSources() {
    if (!catalog) return
    const files = [
      ['Configuração de eleições (EA11)', CONFIG_URL],
      ['Municípios, localidades do exterior e zonas (EA12)', municipalitiesUrl(catalog.president)],
      ['Acompanhamento nacional (EA14)', progressUrl(catalog.president)],
      ['Acompanhamento das localidades do exterior (EA15)', progressUrl(catalog.president, 'zz')],
      ['Resultado presidencial nacional (EA20)', resultUrl(catalog.president)],
      ['Resultado do exterior (EA20)', resultUrl(catalog.president, 'zz')],
      ...(selected ? [['Resultado selecionado (EA20)', selected.url]] : []),
      ...(selected &&
      selected.raw.tpabr === 'uf' &&
      isPresident() &&
      firstRoundSource(ufSelect.value)
        ? [
            [
              'Primeiro turno do estado selecionado (base da comparação)',
              firstRoundSource(ufSelect.value)!,
            ],
          ]
        : []),
      ...(ufSelect.value !== 'br' && selectedContest
        ? [
            [
              'Acompanhamento da abrangência selecionada (EA15)',
              progressUrl(selectedContest, ufSelect.value),
            ],
          ]
        : []),
      [
        'Documentação técnica e outros arquivos do TSE',
        'https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados',
      ],
    ]
    $('live-sources').replaceChildren(
      ...files.map(([title, url]) => {
        const li = node('li')
        li.append(link(title, url))
        return li
      }),
    )
  }
  async function choose(uf: string, municipality = '', zone = '', contest = catalog?.president) {
    if (!contest) return
    const version = ++selectionVersion
    selectedContest = contest
    setSectionScope(
      catalog && uf !== 'br' && municipality && zone
        ? { catalog, uf, municipality, zone }
        : undefined,
    )
    const scopeChanged = ufSelect.value !== uf || !isPresident()
    ufSelect.value = uf
    const municipalities = config?.abr.find((a) => a.cd === uf)?.mu ?? []
    setOptions(
      munSelect,
      'Todos',
      municipalities.map((m) => ({ value: m.cd, label: m.nm })),
    )
    munSelect.value = municipality
    setOptions(
      zoneSelect,
      'Todas',
      municipalities
        .find((m) => m.cd === municipality)
        ?.z.map((z) => ({ value: z, label: `Zona ${Number(z)}` })) ?? [],
    )
    zoneSelect.value = zone
    selected = undefined
    $('complete-data').replaceChildren()
    $('raw-json').textContent = 'Consultando o resultado selecionado…'
    $<HTMLButtonElement>('download-json').disabled = true
    $('place-result').replaceChildren(node('p', 'Consultando o TSE…', 'note'))
    $('place-result').setAttribute('aria-busy', 'true')
    $('place-time').textContent = ''
    $('place-title').textContent = scopeName()
    $('data-scope').textContent = scopeName()
    $<HTMLAnchorElement>('place-source').href = resultUrl(contest, uf, municipality, zone)
    renderMap()
    const url = resultUrl(contest, uf, municipality, zone)
    const result = await attempt(url, () => client.result(contest, uf, municipality, zone))
    if (version !== selectionVersion) return
    selected = result
    if (result) renderSelected()
    else unavailable($('place-result'), errors.get(url))
    if (scopeChanged) renderSources()
  }
  async function refreshSelection() {
    if (!selectedContest) return
    const version = selectionVersion
    const contest = selectedContest
    const uf = ufSelect.value,
      mun = munSelect.value,
      zone = zoneSelect.value
    const result = await attempt(resultUrl(contest, uf, mun, zone), () =>
      client.result(contest, uf, mun, zone),
    )
    if (version !== selectionVersion) return
    if (result) selected = result
    if (selected) renderSelected()
    else unavailable($('place-result'))
  }
  async function refreshCities() {
    if (!catalog) return
    const contest = catalog.president
    const municipalities = config?.abr.find((a) => a.cd === 'zz')?.mu ?? []
    const url = progressUrl(contest, 'zz')
    const progress = await attempt(url, async () => {
      const file = await client.get<ProgressFile>(url)
      if (
        file.ele !== contest.election ||
        file.t !== '2' ||
        file.f !== 'o' ||
        !Array.isArray(file.abr)
      ) {
        throw new Error('O acompanhamento recebido não é deste segundo turno oficial.')
      }
      return file
    })
    if (!progress) {
      renderAbroad()
      return
    }
    for (const row of progress.abr) if (row.tpabr === 'mun') cityProgress.set(row.cdabr, row)
    const changed = municipalities.filter((m) => {
      const p = cityProgress.get(m.cd)
      const version = p ? `${p.dt}/${p.ht}/${p.s.st}/${p.and}` : ''
      return !cities.has(m.cd) || !p || cityVersions.get(m.cd) !== version
    })
    let done = 0
    await mapLimited(changed, async (m) => {
      if (Date.now() < client.blockedUntil || document.hidden) return
      const r = await attempt(resultUrl(contest, 'zz', m.cd), () =>
        client.result(contest, 'zz', m.cd),
      )
      if (r) {
        cities.set(m.cd, r)
        const p = cityProgress.get(m.cd)
        // CDN files arrive independently: only acknowledge an update when EA20 has caught up.
        if (p && r.raw.dt === p.dt && r.raw.ht === p.ht && r.counted === tseNumber(p.s.st)) {
          cityVersions.set(m.cd, `${p.dt}/${p.ht}/${p.s.st}/${p.and}`)
        }
      }
      if (++done % 24 === 0) renderAbroad()
    })
    renderAbroad()
  }
  function renderGovernors() {
    if (!catalog) return
    $('governor-results').replaceChildren(
      ...catalog.governors.map((contest) => {
        const card = node('article', '', 'live-governor')
        card.append(node('h3', placeName(contest.uf)))
        const r = governors.get(contest.uf)
        if (r) {
          card.append(
            candidatesView(r, true),
            node('p', `${pct(r.progress)} das seções totalizadas`, 'note'),
            node('p', `${stamp(r)}${errors.has(r.url) ? ' · Falha na atualização' : ''}`, 'note'),
          )
          card.append(link('Arquivo oficial', r.url))
        } else card.append(node('p', 'Resultado temporariamente indisponível.', 'note'))
        const button = node('button', 'Explorar esta disputa')
        button.type = 'button'
        button.addEventListener('click', () => {
          void choose(contest.uf, '', '', contest)
          $('place-title').scrollIntoView({
            behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
            block: 'center',
          })
        })
        card.append(button)
        return card
      }),
    )
  }
  function schedule() {
    if (timer) clearTimeout(timer)
    if (document.hidden) return
    const cooldown = client.blockedUntil - Date.now()
    const delay = Math.max(POLL_MS * Math.min(10, 2 ** failuresInARow), cooldown)
    timer = setTimeout(() => void refresh(), delay)
  }
  function connectionStatus() {
    const blocked = Date.now() < client.blockedUntil
    const text = blocked
      ? 'Consultas pausadas pelo limite do TSE'
      : errors.size
        ? national
          ? 'Há consultas com falha'
          : 'Não foi possível conectar ao TSE'
        : national?.final
          ? 'Totalização final · TSE'
          : national?.started
            ? 'Apuração em andamento · TSE'
            : 'Aguardando a apuração · TSE'
    $('connection-status').textContent = text
    $('live-dashboard').dataset.connection = errors.size
      ? 'error'
      : national?.started
        ? 'live'
        : 'waiting'
    const notice = $('live-notice')
    notice.hidden = false
    if (blocked)
      notice.textContent =
        'O TSE limitou as consultas. A atualização será retomada automaticamente após a pausa de 10 minutos. Os dados anteriores continuam visíveis, com o horário de geração.'
    else if (errors.size)
      notice.textContent = `${errors.size} consulta(s) sem atualização. Os resultados já recebidos permanecem visíveis. Tentaremos novamente automaticamente; você também pode consultar a fonte oficial.`
    else if (Date.now() < DISCLOSURE_AT)
      notice.textContent =
        'O TSE prevê o início da divulgação às 17h de Brasília de 25/10. Até a publicação, os arquivos podem mostrar zero votos.'
    else if (!national?.started)
      notice.textContent =
        'Aguardando os primeiros resultados do TSE. A consulta automática continua a cada 30 segundos.'
    else notice.hidden = true
  }
  async function refresh() {
    if (updating || document.hidden || Date.now() - lastCycle < 5000) return
    if (Date.now() < client.blockedUntil) {
      connectionStatus()
      schedule()
      return
    }
    updating = true
    refreshButton.disabled = true
    refreshButton.textContent = 'Atualizando…'
    lastCycle = Date.now()
    try {
      if (!catalog) {
        const c = await client.get<ElectionConfig>(CONFIG_URL, 900_000)
        catalog = discoverContests(c)
        selectedContest = catalog.president
      }
      const contest = catalog.president
      if (!config)
        config = await attempt(municipalitiesUrl(contest), async () => {
          const file = await client.get<MunicipalityConfig>(municipalitiesUrl(contest), 900_000)
          if (file.f !== 'o' || !Array.isArray(file.abr)) {
            throw new Error(
              'O cadastro de localidades do TSE não está disponível no formato oficial.',
            )
          }
          return file
        })
      const [br, zz] = await Promise.all([
        attempt(resultUrl(contest), () => client.result(contest)),
        attempt(resultUrl(contest, 'zz'), () => client.result(contest, 'zz')),
      ])
      if (br) national = br
      if (zz) abroad = zz
      if (national) {
        resultView($('national-result'), national)
        $('national-time').textContent =
          `${stamp(national)}${errors.has(national.url) ? ' · Dados anteriores' : ''}`
      } else unavailable($('national-result'))
      if (abroad) {
        resultView($('abroad-result'), abroad)
        $('abroad-time').textContent =
          `${stamp(abroad)}${errors.has(abroad.url) ? ' · Dados anteriores' : ''}`
      } else unavailable($('abroad-result'))
      await mapLimited(Object.keys(STATES), async (uf) => {
        if (Date.now() < client.blockedUntil) return
        const result = await attempt(resultUrl(contest, uf), () => client.result(contest, uf))
        if (result) states.set(uf, result)
      })
      renderStates()
      if (!selected && selectionVersion === 0) await choose('br')
      else await refreshSelection()
      await mapLimited(catalog.governors, async (c) => {
        if (Date.now() < client.blockedUntil) return
        const r = await attempt(resultUrl(c), () => client.result(c))
        if (r) governors.set(c.uf, r)
      })
      renderGovernors()
      renderSources()
      await refreshCities()
      failuresInARow = br ? 0 : Math.min(4, failuresInARow + 1)
      errors.delete(CONFIG_URL)
      $('last-checked').textContent =
        `Última consulta: ${clock()} (Brasília) · intervalo de 30 s após cada ciclo`
    } catch (error) {
      errors.set(CONFIG_URL, errorMessage(error))
      failuresInARow = Math.min(4, failuresInARow + 1)
      if (!national) unavailable($('national-result'), errorMessage(error))
    } finally {
      updating = false
      refreshButton.disabled = false
      refreshButton.textContent = 'Atualizar agora'
      connectionStatus()
      schedule()
    }
  }

  ufSelect.addEventListener('change', () => void choose(ufSelect.value))
  munSelect.addEventListener(
    'change',
    () => void choose(ufSelect.value, munSelect.value, '', selectedContest),
  )
  zoneSelect.addEventListener(
    'change',
    () => void choose(ufSelect.value, munSelect.value, zoneSelect.value, selectedContest),
  )
  metric.addEventListener('change', renderMap)
  sort.addEventListener('change', renderStates)
  search.addEventListener('input', renderAbroad)
  refreshButton.addEventListener('click', () => void refresh())
  document.addEventListener('visibilitychange', () => {
    if (timer) clearTimeout(timer)
    if (!document.hidden) {
      if (Date.now() - lastCycle >= POLL_MS) void refresh()
      else schedule()
    }
  })
  $('download-json').addEventListener('click', () => {
    if (!selected) return
    const blob = new Blob([JSON.stringify(selected.raw, null, 2)], {
      type: 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = node('a')
    a.href = url
    a.download = `tse-2turno-${selected.raw.ele}-${ufSelect.value}${munSelect.value}${zoneSelect.value ? `-z${zoneSelect.value}` : ''}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  })
  createLiveMap($('live-map'), (uf) => void choose(uf))
    .then((draw) => {
      drawMap = draw
      $('map-loading').remove()
      renderMap()
    })
    .catch((error) => {
      $('map-loading').textContent =
        `${errorMessage(error)} Use a lista de estados para consultar os resultados.`
    })
  void refresh()
}
