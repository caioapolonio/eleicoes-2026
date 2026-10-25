/** TSE 2026: EA11/12 configuration, EA14/15 progress and EA20 results. */
export const TSE_BASE = 'https://resultados.tse.jus.br/oficial'
export const CONFIG_URL = `${TSE_BASE}/comum/config/ele-c.json`
export const POLL_MS = 30_000
export const DISCLOSURE_AT = Date.parse('2026-10-25T17:00:00-03:00')

export const STATES: Record<string, { name: string; ibge: string }> = {
  ac: { name: 'Acre', ibge: '12' },
  al: { name: 'Alagoas', ibge: '27' },
  ap: { name: 'Amapá', ibge: '16' },
  am: { name: 'Amazonas', ibge: '13' },
  ba: { name: 'Bahia', ibge: '29' },
  ce: { name: 'Ceará', ibge: '23' },
  df: { name: 'Distrito Federal', ibge: '53' },
  es: { name: 'Espírito Santo', ibge: '32' },
  go: { name: 'Goiás', ibge: '52' },
  ma: { name: 'Maranhão', ibge: '21' },
  mt: { name: 'Mato Grosso', ibge: '51' },
  ms: { name: 'Mato Grosso do Sul', ibge: '50' },
  mg: { name: 'Minas Gerais', ibge: '31' },
  pa: { name: 'Pará', ibge: '15' },
  pb: { name: 'Paraíba', ibge: '25' },
  pr: { name: 'Paraná', ibge: '41' },
  pe: { name: 'Pernambuco', ibge: '26' },
  pi: { name: 'Piauí', ibge: '22' },
  rj: { name: 'Rio de Janeiro', ibge: '33' },
  rn: { name: 'Rio Grande do Norte', ibge: '24' },
  rs: { name: 'Rio Grande do Sul', ibge: '43' },
  ro: { name: 'Rondônia', ibge: '11' },
  rr: { name: 'Roraima', ibge: '14' },
  sc: { name: 'Santa Catarina', ibge: '42' },
  sp: { name: 'São Paulo', ibge: '35' },
  se: { name: 'Sergipe', ibge: '28' },
  to: { name: 'Tocantins', ibge: '17' },
}
export const placeName = (uf: string) =>
  uf === 'br' ? 'Brasil e exterior' : uf === 'zz' ? 'Exterior' : (STATES[uf]?.name ?? uf)

interface Office {
  cd: string
  ds: string
}
export interface Election {
  cd: string
  t: string
  nm: string
  abr: { cd: string; cp: Office[] }[]
}
export interface ElectionConfig {
  pl: { cd: string; c: string; dt: string; e: Election[] }[]
}
export interface Contest {
  election: string
  cycle: string
  office: string
  uf: string
}
export interface Catalog {
  president: Contest
  governors: Contest[]
  pleito: string
}
export interface Municipality {
  cd: string
  cdi: string
  nm: string
  z: string[]
  c: string
}
export interface MunicipalityConfig {
  f: string
  abr: { cd: string; mu: Municipality[] }[]
}
export type Totals = Record<string, string>
export interface ProgressRow {
  cdabr: string
  tpabr: string
  and: string
  dt: string
  ht: string
  s: Totals
  e: Totals
}
export interface ProgressFile {
  ele: string
  t: string
  f: string
  abr: ProgressRow[]
}
export interface RawCandidate {
  n: string
  sqcand: string
  nm: string
  nmu: string
  vap: string
  pvap: string
  e: string
  st: string
  dvt?: string
  vs?: { nmu: string; sgp: string }[]
}
export interface RawResult extends ProgressRow {
  ele: string
  t: string
  f: string
  dg: string
  hg: string
  idg: string
  dv?: string
  tf: string
  md?: string
  esae?: string
  mnae?: string[]
  mntf?: string
  v: Totals
  carg: {
    cd: string
    nmn: string
    agr: { nm: string; com: string; par: { sg: string; cand: RawCandidate[] }[] }[]
  }[]
}
export interface Candidate {
  number: string
  name: string
  fullName: string
  party: string
  coalition: string
  vice: string
  votes: number | null
  percent: number | null
  elected: boolean
  status: string
}
export interface Result {
  raw: RawResult
  url: string
  candidates: Candidate[]
  progress: number | null
  sections: number | null
  counted: number | null
  valid: number | null
  disclosed: boolean
  started: boolean
  final: boolean
}

/** Empty / unknown values are missing, never silently turned into zero. */
export function tseNumber(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  if (String(value).trim() === '') return null
  const number = Number(String(value).replace(',', '.'))
  return Number.isFinite(number) && number >= 0 ? number : null
}

export function discoverContests(config: ElectionConfig): Catalog {
  const pleito = config.pl?.find(
    (p) =>
      p.c === 'ele2026' &&
      p.dt === '25/10/2026' &&
      p.e.some((e) => e.t === '2' && e.abr.some((a) => a.cp?.some((c) => c.cd === '1'))),
  )
  if (!pleito)
    throw new Error('A configuração do TSE ainda não contém o segundo turno presidencial de 2026.')
  const contests = (office: string): Contest[] =>
    pleito.e.flatMap((e) =>
      e.t !== '2'
        ? []
        : e.abr
            .filter((a) => a.cp?.some((c) => c.cd === office))
            .map((a) => ({
              election: e.cd,
              cycle: pleito.c,
              office,
              uf: a.cd.toLowerCase(),
            })),
    )
  const president = contests('1').find((c) => c.uf === 'br')
  if (!president) throw new Error('Eleição presidencial não disponível no TSE.')
  return { president, governors: contests('3'), pleito: pleito.cd }
}

function code(value: string, length: number): string {
  if (!/^\d+$/.test(value) || value.length > length) throw new Error('Código eleitoral inválido.')
  return value.padStart(length, '0')
}
export function electionRoot(contest: Contest): string {
  if (contest.cycle !== 'ele2026') throw new Error('Ciclo eleitoral inválido.')
  code(contest.election, 6)
  return `${TSE_BASE}/${contest.cycle}/${contest.election}`
}
export function resultUrl(contest: Contest, uf = contest.uf, municipality = '', zone = ''): string {
  if (uf !== 'br' && uf !== 'zz' && !STATES[uf]) throw new Error('UF inválida.')
  if (zone && !municipality) throw new Error('Zona sem município.')
  const area = uf + (municipality ? code(municipality, 5) : '') + (zone ? `-z${code(zone, 4)}` : '')
  return `${electionRoot(contest)}/dados/${uf}/${area}-c${code(contest.office, 4)}-e${code(contest.election, 6)}-u.json`
}
export const municipalitiesUrl = (contest: Contest) =>
  `${electionRoot(contest)}/config/mun-e${code(contest.election, 6)}-cm.json`
export const progressUrl = (contest: Contest, uf = 'br') => {
  if (uf !== 'br' && uf !== 'zz' && !STATES[uf]) throw new Error('UF inválida.')
  return `${electionRoot(contest)}/dados/${uf}/${uf}-e${code(contest.election, 6)}-ab.json`
}

export function parseResult(raw: RawResult, contest: Contest, url: string): Result {
  if (raw.ele !== contest.election || raw.t !== '2' || raw.f !== 'o') {
    throw new Error('O arquivo recebido não é um resultado oficial deste segundo turno.')
  }
  const office = raw.carg?.find((c) => c.cd === contest.office)
  if (!office || !raw.s || !raw.e || !raw.v || !['n', 'p', 'f'].includes(raw.and)) {
    throw new Error('O TSE retornou um resultado com estrutura inesperada.')
  }
  const disclosed = raw.dv !== 'n'
  const valid = disclosed ? tseNumber(raw.v.vv) : null
  const counted = tseNumber(raw.s.st)
  return {
    raw,
    url,
    disclosed,
    valid,
    counted,
    sections: tseNumber(raw.s.ts),
    progress: tseNumber(raw.s.pst),
    started: raw.and !== 'n' || (counted ?? 0) > 0,
    final: raw.tf === 's',
    candidates: office.agr.flatMap((a) =>
      a.par.flatMap((p) =>
        p.cand.map((c) => ({
          number: c.n,
          name: c.nmu,
          fullName: c.nm,
          party: p.sg,
          coalition: a.nm,
          vice: c.vs?.map((v) => `${v.nmu} (${v.sgp})`).join(', ') ?? '',
          votes: disclosed ? tseNumber(c.vap) : null,
          percent: disclosed && (valid ?? 0) > 0 ? tseNumber(c.pvap) : null,
          elected: c.e === 's',
          status: c.st,
        })),
      ),
    ),
  }
}

export function leader(result?: Result): Candidate | undefined {
  if (!result?.disclosed || !result.started || !(result.valid && result.valid > 0)) return
  const sorted = [...result.candidates].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))
  return (sorted[0]?.votes ?? 0) > (sorted[1]?.votes ?? 0) ? sorted[0] : undefined
}
export const candidateColor = (number: string) =>
  number === '13' ? 'var(--lula)' : number === '22' ? 'var(--flavio)' : 'var(--seq-high)'

export class TseHttpError extends Error {
  constructor(
    public status: number,
    public retryAt: number,
  ) {
    super(
      status === 404
        ? 'Arquivo ainda não publicado pelo TSE.'
        : `TSE indisponível (HTTP ${status}).`,
    )
  }
}

/** Bounded requests, browser conditional revalidation, timeout and an IP-wide cooldown. */
export class TseClient {
  private cache = new Map<string, { value: unknown; at: number }>()
  private missing = new Map<string, number>()
  private pending = new Map<string, Promise<unknown>>()
  private nextAt = 0
  blockedUntil = 0
  constructor(
    private fetcher: (
      ...args: Parameters<typeof fetch>
    ) => ReturnType<typeof fetch> = globalThis.fetch.bind(globalThis),
    private gap = 150,
  ) {}

  async get<T>(url: string, maxAge = 0): Promise<T> {
    const now = Date.now()
    if (now < this.blockedUntil) throw new TseHttpError(429, this.blockedUntil)
    const cached = this.cache.get(url)
    if (cached && now - cached.at < maxAge) return cached.value as T
    const missingUntil = this.missing.get(url) ?? 0
    if (now < missingUntil) throw new TseHttpError(404, missingUntil)
    const inflight = this.pending.get(url)
    if (inflight) return inflight as Promise<T>
    const request = this.request<T>(url)
    this.pending.set(url, request)
    try {
      return await request
    } finally {
      this.pending.delete(url)
    }
  }

  private async request<T>(url: string): Promise<T> {
    const slot = Math.max(Date.now(), this.nextAt)
    this.nextAt = slot + this.gap
    if (slot > Date.now()) await new Promise((r) => setTimeout(r, slot - Date.now()))
    if (Date.now() < this.blockedUntil) throw new TseHttpError(429, this.blockedUntil)
    const response = await this.fetcher(url, {
      cache: 'no-cache',
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      const retryAt =
        Date.now() + (response.status === 403 || response.status === 429 ? 610_000 : 300_000)
      if (response.status === 403 || response.status === 429) this.blockedUntil = retryAt
      if (response.status === 404) this.missing.set(url, retryAt)
      throw new TseHttpError(response.status, retryAt)
    }
    const value: unknown = await response.json()
    this.cache.set(url, { value, at: Date.now() })
    return value as T
  }

  async result(contest: Contest, uf = contest.uf, municipality = '', zone = '') {
    const url = resultUrl(contest, uf, municipality, zone)
    return parseResult(await this.get<RawResult>(url, 5_000), contest, url)
  }
}

export async function mapLimited<T>(items: T[], task: (item: T) => Promise<void>, concurrency = 3) {
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) await task(items[cursor++])
    }),
  )
}

export interface Section {
  ns: string
  nsp?: string
  nsa?: string[]
  da?: string
  ha?: string
}
export interface SectionConfig {
  f: string
  cdp: string
  dg: string
  hg: string
  abr: { cd: string; mu: { cd: string; nm: string; zon: { cd: string; sec: Section[] }[] }[] }[]
}
export interface SectionAuxiliary {
  f: string
  dg: string
  hg: string
  st: string
  hashes: { hash: string; dr: string; hr: string; st: string; arq: { nm: string; tp: string }[] }[]
}
function ballotRoot(catalog: Catalog, uf: string) {
  if (uf !== 'zz' && !STATES[uf]) throw new Error('Selecione uma UF ou o exterior.')
  code(catalog.pleito, 6)
  return `${TSE_BASE}/${catalog.president.cycle}/arquivo-urna/${catalog.pleito}`
}
export const sectionsUrl = (catalog: Catalog, uf: string) =>
  `${ballotRoot(catalog, uf)}/config/${uf}/${uf}-p${code(catalog.pleito, 6)}-cs.json`
export const sectionDirectory = (
  catalog: Catalog,
  uf: string,
  municipality: string,
  zone: string,
  section: string,
) =>
  `${ballotRoot(catalog, uf)}/dados/${uf}/${code(municipality, 5)}/${code(zone, 4)}/${code(section, 4)}`
export const sectionAuxUrl = (
  catalog: Catalog,
  uf: string,
  municipality: string,
  zone: string,
  section: string,
) =>
  `${sectionDirectory(catalog, uf, municipality, zone, section)}/p${code(catalog.pleito, 6)}-${uf}-m${code(municipality, 5)}-z${code(zone, 4)}-s${code(section, 4)}-aux.json`
