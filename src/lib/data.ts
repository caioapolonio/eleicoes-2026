// Tables written by analyze.py. Every statistic is weighted by valid votes.
import resumoJson from '../../data/analysis/resumo.json'
import regioesJson from '../../data/analysis/regioes.json'
import ufsJson from '../../data/analysis/ufs.json'
import faixasJson from '../../data/analysis/faixas.json'
import correlacoesJson from '../../data/analysis/correlacoes.json'
import modelosJson from '../../data/analysis/modelos.json'

export type CandidateKey = 'flavio' | 'lula'

interface VoteShare {
  valid_votes: number
  pct_flavio: number
  pct_lula: number
}

export interface Summary extends VoteShare {
  escopo: string
  municipios: number
  vitorias_flavio: number
  vitorias_lula: number
}

export interface RegionRow extends VoteShare {
  region: string
  municipios: number
  margem_pp: number
  vitorias_flavio: number
  vitorias_lula: number
}

export interface StateRow extends RegionRow {
  state: string
}

export type BandVariable = 'renda' | 'pretos_pardos' | 'alfabetizacao'

export interface BandRow extends VoteShare {
  variavel: BandVariable
  rotulo: string
  faixa: number
  x_min: number
  x_max: number
  x_mediana: number
  municipios: number
}

export interface CorrelationRow {
  escopo: string
  variavel: BandVariable
  rotulo: string
  municipios: number
  r_flavio: number
  r_lula: number
}

export interface ModelRow {
  modelo: string
  municipios: number
  r2_flavio: number
  r2_lula: number
}

// Served from public/data/municipios.json and fetched on the client
export interface MunicipalityRow {
  ibge_code: string
  municipio: string
  uf: string
  regiao: string
  votos_validos: number
  pct_flavio: number
  pct_lula: number
  margem_pp: number
  renda: number | null
  pretos_pardos: number | null
  alfabetizacao: number | null
}

export const summary = (resumoJson as Summary[])[0]
export const regions = regioesJson as RegionRow[]
export const states = ufsJson as StateRow[]
export const bands = faixasJson as BandRow[]
export const correlations = correlacoesJson as CorrelationRow[]
export const models = modelosJson as ModelRow[]

export const CANDIDATES = [
  { key: 'flavio', name: 'Flávio Bolsonaro', short: 'Flávio', color: 'var(--flavio)' },
  { key: 'lula', name: 'Lula', short: 'Lula', color: 'var(--lula)' },
] as const satisfies readonly { key: CandidateKey; name: string; short: string; color: string }[]

export const REGIONS = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'] as const

export const regionColor = (region: string) =>
  `var(--reg-${region.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')})`
