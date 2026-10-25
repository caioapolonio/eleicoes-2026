import firstRound from '../../data/analysis/ufs.json' with { type: 'json' }
import { STATES, type Result } from './tse'

// Final 1st-round state shares, including every candidate in the valid-vote denominator.
// The 54 shares were checked against the official EA20 state files (e006257) on 25/10/2026.
const firstShares = new Map(
  firstRound.map((row) => [
    row.state.toLowerCase(),
    {
      '13': row.pct_lula,
      '22': row.pct_flavio,
    } as Record<string, number>,
  ]),
)

export interface RoundComparison {
  firstPercent: number
  secondPercent: number | null
  deltaPp: number | null
}
export function compareRounds(
  uf: string,
  candidate: string,
  result?: Result,
): RoundComparison | undefined {
  const firstPercent = firstShares.get(uf)?.[candidate]
  if (firstPercent == null) return
  // Never compare a municipality, a zone or a governor against a presidential state total.
  if (
    result &&
    (result.raw.tpabr !== 'uf' ||
      result.raw.cdabr !== uf ||
      !result.raw.carg.some((office) => office.cd === '1'))
  )
    return
  const current = result?.candidates.find((c) => c.number === candidate)?.percent
  const secondPercent =
    result?.disclosed &&
    result.started &&
    (result.valid ?? 0) > 0 &&
    current != null &&
    current >= 0 &&
    current <= 100
      ? current
      : null
  return {
    firstPercent,
    secondPercent,
    deltaPp:
      secondPercent == null ? null : Math.round((secondPercent - firstPercent) * 100) / 100 + 0,
  }
}

export function formatDelta(delta: number | null): string {
  if (delta == null) return 'Variação: —'
  const rounded = Math.round(delta * 100) / 100 + 0
  const amount = Math.abs(rounded).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return rounded === 0 ? 'Sem variação · 0,00 p.p.' : `${rounded > 0 ? '↑ +' : '↓ −'}${amount} p.p.`
}

export function firstRoundSource(uf: string): string | undefined {
  if (!STATES[uf]) return
  return `https://resultados.tse.jus.br/oficial/ele2026/6257/dados/${uf}/${uf}-c0001-e006257-u.json`
}

export interface StateChange {
  uf: string
  firstPercent: number
  secondPercent: number
  deltaPp: number
}
export function rankStateChanges(results: Map<string, Result>, candidate: string): StateChange[] {
  return Object.keys(STATES)
    .flatMap((uf) => {
      const comparison = compareRounds(uf, candidate, results.get(uf))
      return comparison?.deltaPp == null || comparison.secondPercent == null
        ? []
        : [
            {
              uf,
              firstPercent: comparison.firstPercent,
              secondPercent: comparison.secondPercent,
              deltaPp: comparison.deltaPp,
            },
          ]
    })
    .sort((a, b) => b.deltaPp - a.deltaPp || a.uf.localeCompare(b.uf))
}

/** Compact values like the reference, preserving very small changes instead of showing +0.0. */
export function formatRankingDelta(delta: number): string {
  const amount = Math.abs(delta)
  const digits = amount > 0 && amount < 0.05 ? 2 : 1
  return `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${amount.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`
}
