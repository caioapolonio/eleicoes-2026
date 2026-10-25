import {
  compareRounds,
  formatDelta,
  firstRoundSource,
  rankStateChanges,
  formatRankingDelta,
} from '../src/lib/round-comparison'
import { STATES } from '../src/lib/tse'
import { describe, expect, test, setSystemTime } from 'bun:test'
import { rejects } from 'node:assert/strict'
import preparation from './fixtures/presidente-2t-preparacao.json'
import {
  discoverContests,
  resultUrl,
  parseResult,
  leader,
  TseClient,
  TseHttpError,
  tseNumber,
  sectionsUrl,
  sectionAuxUrl,
  type Contest,
  type ElectionConfig,
  type RawResult,
} from '../src/lib/tse'
const contest: Contest = { election: '6258', cycle: 'ele2026', office: '1', uf: 'br' }
const raw = () => structuredClone(preparation) as RawResult
const url = resultUrl(contest)
const parse = (r: RawResult) => parseResult(r, contest, url)

describe('official election identity and URLs', () => {
  test('discovers only the presidential and governor second rounds, alongside supplementary elections', () => {
    const config: ElectionConfig = {
      pl: [
        {
          cd: '3221',
          c: 'ele2026',
          dt: '25/10/2026',
          e: [
            {
              cd: '9999',
              t: '1',
              nm: 'Suplementar',
              abr: [{ cd: 'sp', cp: [{ cd: '11', ds: 'Prefeito' }] }],
            },
            {
              cd: '6258',
              t: '2',
              nm: 'Federal',
              abr: [{ cd: 'br', cp: [{ cd: '1', ds: 'Presidente' }] }],
            },
            {
              cd: '6260',
              t: '2',
              nm: 'Estadual',
              abr: [{ cd: 'ac', cp: [{ cd: '3', ds: 'Governador' }] }],
            },
          ],
        },
      ],
    }
    expect(discoverContests(config)).toEqual({
      president: contest,
      pleito: '3221',
      governors: [{ ...contest, election: '6260', office: '3', uf: 'ac' }],
    })
    expect(() => discoverContests({ pl: [] })).toThrow()
  })
  test('pads municipality, office, election and zone independently', () => {
    expect(resultUrl(contest, 'ac', '1120', '8')).toEndWith(
      '/dados/ac/ac01120-z0008-c0001-e006258-u.json',
    )
    expect(resultUrl(contest, 'zz', '29254')).toEndWith('/dados/zz/zz29254-c0001-e006258-u.json')
    expect(() => resultUrl(contest, 'xx')).toThrow()
    expect(() => resultUrl(contest, 'ac', '../x')).toThrow()
    expect(() => resultUrl(contest, 'ac', '', '1')).toThrow()
  })
})
test('section URLs follow the published pleito structure, keeping leading zeros', () => {
  const catalog = { president: contest, pleito: '3221', governors: [] }
  expect(sectionsUrl(catalog, 'zz')).toBe(
    'https://resultados.tse.jus.br/oficial/ele2026/arquivo-urna/3221/config/zz/zz-p003221-cs.json',
  )
  expect(sectionAuxUrl(catalog, 'ac', '1120', '8', '1')).toEndWith(
    '/dados/ac/01120/0008/0001/p003221-ac-m01120-z0008-s0001-aux.json',
  )
  expect(() => sectionsUrl(catalog, 'br')).toThrow()
})

describe('truthful presentation of official results', () => {
  test('zeroed preparation file has no leader, winner or invented percentage', () => {
    const r = parse(raw())
    expect(r.started).toBe(false)
    expect(r.progress).toBe(0)
    expect(r.candidates).toHaveLength(2)
    expect(r.candidates.every((c) => c.percent === null)).toBe(true)
    expect(leader(r)).toBeUndefined()
  })
  test('reads comma decimals, vice candidates and coalition from the actual EA20 nesting', () => {
    const d = raw()
    d.and = 'p'
    d.s.st = '100'
    d.v.vv = '1000'
    d.carg[0].agr[0].par[0].cand[0].vap = '555'
    d.carg[0].agr[0].par[0].cand[0].pvap = '55,50'
    const r = parse(d)
    expect(r.candidates[0].percent).toBe(55.5)
    expect(r.candidates[0].vice).toContain('ALFREDO GASPAR')
    expect(leader(r)?.number).toBe('22')
  })
  test('does not show suppressed candidate votes or a leader when dv=n', () => {
    const d = raw()
    d.dv = 'n'
    d.and = 'p'
    d.s.st = '100'
    d.v.vv = '1000'
    d.carg[0].agr[0].par[0].cand[0].vap = '999'
    const r = parse(d)
    expect(r.valid).toBeNull()
    expect(r.candidates.every((c) => c.votes === null && c.percent === null)).toBe(true)
    expect(leader(r)).toBeUndefined()
  })
  test('ties are not assigned to the first candidate', () => {
    const d = raw()
    d.and = 'p'
    d.v.vv = '1000'
    for (const a of d.carg[0].agr) for (const p of a.par) for (const c of p.cand) c.vap = '500'
    expect(leader(parse(d))).toBeUndefined()
  })
  test('100% of sections does not imply final totalization or an elected candidate', () => {
    const d = raw()
    d.s.pst = '100,00'
    d.and = 'f'
    d.tf = 'n'
    const r = parse(d)
    expect(r.final).toBe(false)
    expect(r.candidates.every((c) => !c.elected)).toBe(true)
  })
  test('rejects simulated, first round and other-election files', () => {
    for (const patch of [{ t: '1' }, { f: 's' }, { ele: '6257' }])
      expect(() => parse({ ...raw(), ...patch })).toThrow()
  })
  test('missing values remain missing', () => {
    for (const value of [undefined, null, '', 'garbage', '-1']) expect(tseNumber(value)).toBeNull()
    expect(tseNumber('0')).toBe(0)
    expect(tseNumber('99,91')).toBe(99.91)
  })
})
describe('resilient TSE access', () => {
  test('a new result request rechecks the TSE after the five-second manual refresh guard', async () => {
    let requests = 0
    const client = new TseClient(async () => {
      requests++
      return Response.json(raw())
    }, 0)
    const now = Date.now()
    try {
      setSystemTime(now)
      await client.result(contest)
      setSystemTime(now + 4999)
      await client.result(contest)
      expect(requests).toBe(1)
      setSystemTime(now + 5001)
      await client.result(contest)
      expect(requests).toBe(2)
    } finally {
      setSystemTime()
    }
  })

  test('default fetch keeps the global receiver required by browser implementations', async () => {
    const original = globalThis.fetch
    globalThis.fetch = Object.assign(
      async function (this: unknown) {
        if (this !== globalThis) throw new TypeError('Illegal invocation')
        return Response.json({ ok: true })
      },
      { preconnect: original.preconnect },
    )
    try {
      const client = new TseClient(undefined, 0)
      expect(await client.get(url)).toEqual({ ok: true })
    } finally {
      globalThis.fetch = original
    }
  })
  test('coalesces concurrent requests and reuses fresh configuration', async () => {
    let requests = 0
    const client = new TseClient(async () => {
      requests++
      return Response.json({ ok: true })
    }, 0)
    await Promise.all([client.get(url), client.get(url)])
    await client.get(url, 60_000)
    expect(requests).toBe(1)
  })
  test('404 files are not repeatedly requested', async () => {
    let requests = 0
    const client = new TseClient(async () => {
      requests++
      return new Response(null, { status: 404 })
    }, 0)
    await rejects(client.get(url), TseHttpError)
    await rejects(client.get(url), TseHttpError)
    expect(requests).toBe(1)
  })
  test.each([403, 429])('HTTP %s pauses all requests for over ten minutes', async (status) => {
    let requests = 0
    const client = new TseClient(async () => {
      requests++
      return new Response(null, { status })
    }, 0)
    await rejects(client.get(url), TseHttpError)
    await rejects(client.get(`${url}?another`), TseHttpError)
    expect(requests).toBe(1)
    expect(client.blockedUntil - Date.now()).toBeGreaterThan(600_000)
  })
})

describe('live comparison with the first round', () => {
  const stateResult = () => {
    const r = parse(raw())
    r.raw.tpabr = 'uf'
    r.raw.cdabr = 'ce'
    r.started = true
    r.valid = 1000
    for (const candidate of r.candidates) candidate.percent = candidate.number === '22' ? 45 : 55
    return r
  }
  test('has a first-round share for both candidates in all 27 states', () => {
    for (const uf of Object.keys(STATES)) {
      for (const number of ['13', '22']) {
        const comparison = compareRounds(uf, number)
        expect(comparison?.firstPercent).toBeGreaterThan(0)
        expect(comparison?.deltaPp).toBeNull()
      }
    }
  })
  test('uses all first-round valid votes and reports signed percentage points', () => {
    const r = stateResult()
    expect(compareRounds('ce', '13', r)).toEqual({
      firstPercent: 63.29,
      secondPercent: 55,
      deltaPp: -8.29,
    })
    expect(compareRounds('ce', '22', r)).toEqual({
      firstPercent: 31.27,
      secondPercent: 45,
      deltaPp: 13.73,
    })
    expect(firstRoundSource('ce')).toEndWith('/6257/dados/ce/ce-c0001-e006257-u.json')
  })
  test('does not invent a fall while the second-round result is not available', () => {
    for (const patch of [{ started: false }, { disclosed: false }, { valid: 0 }, { valid: null }]) {
      const comparison = compareRounds('ce', '22', Object.assign(stateResult(), patch))
      expect(comparison?.deltaPp).toBeNull()
      expect(comparison?.secondPercent).toBeNull()
    }
    const r = stateResult()
    r.candidates.find((c) => c.number === '22')!.percent = null
    expect(compareRounds('ce', '22', r)?.deltaPp).toBeNull()
  })
  test('never compares municipalities, zones, other states or governors with state presidential totals', () => {
    for (const type of ['mu', 'zona', 'br']) {
      const r = stateResult()
      r.raw.tpabr = type
      expect(compareRounds('ce', '22', r)).toBeUndefined()
    }
    const other = stateResult()
    other.raw.cdabr = 'sp'
    expect(compareRounds('ce', '22', other)).toBeUndefined()
    const governor = stateResult()
    governor.raw.carg[0].cd = '3'
    expect(compareRounds('ce', '22', governor)).toBeUndefined()
    expect(compareRounds('zz', '22')).toBeUndefined()
    expect(compareRounds('ce', '99')).toBeUndefined()
  })
  test('rounds floating-point differences without negative zero and keeps the signs explicit', () => {
    const r = stateResult()
    r.candidates.find((c) => c.number === '22')!.percent = 31.269
    expect(Object.is(compareRounds('ce', '22', r)?.deltaPp, -0)).toBe(false)
    expect(formatDelta(13.73)).toBe('↑ +13,73 p.p.')
    expect(formatDelta(-8.29)).toBe('↓ −8,29 p.p.')
    expect(formatDelta(-0.001)).toBe('Sem variação · 0,00 p.p.')
    expect(formatDelta(null)).toBe('Variação: —')
  })
})

describe('ranked state gains', () => {
  const state = (uf: string, percent: number) => {
    const result = parse(raw())
    result.raw.cdabr = uf
    result.raw.tpabr = 'uf'
    result.started = true
    result.valid = 100
    result.candidates.find((c) => c.number === '22')!.percent = percent
    return result
  }
  test('ranks signed changes, filters unpublished results and keeps missing states out', () => {
    const results = new Map([
      ['ce', state('ce', 40)],
      ['sp', state('sp', 52)],
      ['sc', state('sc', 60)],
      ['pi', state('pi', 0)],
    ])
    const unpublished = state('ac', 80)
    unpublished.disclosed = false
    results.set('ac', unpublished)
    const ranked = rankStateChanges(results, '22')
    expect(ranked.map((r) => r.uf)).toEqual(['ce', 'sp', 'sc', 'pi'])
    expect(ranked.map((r) => r.deltaPp)).toEqual([8.73, 0.07, -6.65, -24.09])
    expect(rankStateChanges(new Map(), '22')).toEqual([])
  })
  test('uses concise signed labels while preserving tiny gains and true zeros', () => {
    expect(formatRankingDelta(4.1)).toBe('+4,1')
    expect(formatRankingDelta(-3.94)).toBe('−3,9')
    expect(formatRankingDelta(0.01)).toBe('+0,01')
    expect(formatRankingDelta(0)).toBe('0,0')
  })
})
