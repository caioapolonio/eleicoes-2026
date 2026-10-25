import { test, expect, type Page } from '@playwright/test'
import preparation from '../fixtures/presidente-2t-preparacao.json' with { type: 'json' }
import type { RawResult } from '../../src/lib/tse'

// Small, deterministic TSE fixture. CI never depends on a live election or calls the TSE.
async function mockTse(page: Page) {
  const state = { started: false, phase: 0, status: 200, calls: 0 }
  const config = {
    pl: [
      {
        cd: '3221',
        c: 'ele2026',
        dt: '25/10/2026',
        e: [
          {
            cd: '6258',
            t: '2',
            nm: 'Federal',
            abr: [{ cd: 'br', cp: [{ cd: '1', ds: 'Presidente' }] }],
          },
        ],
      },
    ],
  }
  const municipalities = {
    f: 'o',
    abr: [
      { cd: 'ce', mu: [{ cd: '13897', cdi: '2304400', nm: 'FORTALEZA', c: 's', z: ['0001'] }] },
      { cd: 'zz', mu: [{ cd: '30627', cdi: '', nm: 'TÓQUIO', c: 'n', z: ['0001'] }] },
    ],
  }
  const result = (uf: string, municipality?: string) => {
    const raw = structuredClone(preparation) as RawResult
    raw.cdabr = municipality ?? uf
    raw.tpabr = municipality ? 'mu' : uf === 'br' ? 'br' : 'uf'
    if (state.started) {
      raw.and = 'p'
      raw.s.st = '10'
      raw.s.ts = '20'
      raw.s.pst = '50,00'
      raw.v.vv = '1000'
      raw.dt = '25/10/2026'
      raw.dg = raw.dt
      raw.ht = state.phase ? '17:01:00' : '17:00:00'
      raw.hg = raw.ht
      for (const a of raw.carg[0].agr)
        for (const p of a.par)
          for (const c of p.cand) {
            const ahead = state.phase ? '13' : '22'
            c.vap = c.n === ahead ? '550' : '450'
            c.pvap = c.n === ahead ? '55,00' : '45,00'
          }
    }
    return raw
  }
  await page.route('https://resultados.tse.jus.br/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('.jpeg'))
      return route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"/>',
      })
    if (path.endsWith('/comum/config/ele-c.json')) return route.fulfill({ json: config })
    if (path.endsWith('-cm.json')) return route.fulfill({ json: municipalities })
    if (path.endsWith('-ab.json'))
      return route.fulfill({ json: { ele: '6258', t: '2', f: 'o', abr: [] } })
    const match = path.match(
      /\/dados\/([a-z]{2})\/[a-z]{2}(\d{5})?(?:-z\d{4})?-c0001-e006258-u.json$/,
    )
    if (!match) throw new Error(`Unexpected TSE request: ${path}`)
    state.calls++
    if (state.status !== 200 && match[1] === 'br') return route.fulfill({ status: state.status })
    return route.fulfill({ json: result(match[1], match[2]) })
  })
  return state
}
async function ready(page: Page) {
  await expect(page.locator('#live-dashboard')).toHaveAttribute(
    'data-connection',
    /waiting|live|error/,
  )
  await expect(page.locator('#refresh-live')).toBeEnabled()
}

test('preparation, exterior search, keyboard map, zone and complete download', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await mockTse(page)
  await page.goto('/segundo-turno/')
  await ready(page)
  await expect(page.locator('#national-result')).toContainText('Aguardando o início da apuração')
  await expect(page.locator('.live-elected')).toHaveCount(0)
  await expect(page.locator('#states-table tbody tr')).toHaveCount(27)
  await expect(page.locator('#swing-rankings .live-swing-row')).toHaveCount(0)
  await expect(page.locator('#swing-rankings')).toContainText('Aguardando votos divulgados')
  await expect(page.locator('#abroad-table tbody tr')).toHaveCount(1)
  await page.locator('#abroad-search').fill('toquio')
  await expect(page.locator('#abroad-table tbody')).toContainText('TÓQUIO')
  const ce = page.locator('#live-map path[aria-label^="Ceará."]')
  await ce.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#live-uf')).toHaveValue('ce')
  await expect(ce).toHaveAttribute('aria-pressed', 'true')
  await page.locator('#live-municipality').selectOption('13897')
  await page.locator('#live-zone').selectOption('0001')
  await expect(page.locator('#place-title')).toContainText('FORTALEZA · Zona 1')
  await expect(page.locator('#download-json')).toBeEnabled()
  const download = page.waitForEvent('download')
  await page.locator('#download-json').click()
  expect((await download).suggestedFilename()).toBe('tse-2turno-6258-ce13897-z0001.json')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const aptos = page.locator('#national-result .live-stats dd').first()
  await expect(aptos).toHaveCSS('white-space', 'nowrap')
  expect(errors).toEqual([])
  await page.goto('/')
  await expect(page).toHaveTitle('1º turno 2026 por município')
})

test('polls, updates map leadership, retains old totals during an outage and recovers', async ({
  page,
}) => {
  await page.clock.install()
  const state = await mockTse(page)
  state.started = true
  await page.goto('/segundo-turno/')
  await ready(page)
  const shape = page.locator('#live-map path').first()
  const initialColor = await shape.evaluate((el) => getComputedStyle(el).fill)
  const flavioRanking = page.locator('#swing-rankings [data-candidate="22"]')
  const lulaRanking = page.locator('#swing-rankings [data-candidate="13"]')
  await expect(flavioRanking.locator('.live-swing-row')).toHaveCount(7)
  await expect(lulaRanking.locator('.live-swing-row')).toHaveCount(7)
  await expect(flavioRanking.locator('.live-swing-row').first()).toHaveAttribute('data-uf', 'pi')
  await expect(flavioRanking.locator('.live-swing-value').first()).toHaveText('+30,9')
  await expect(flavioRanking.locator('.live-swing-toggle')).toContainText(
    '+ 20 estados com mudança menor',
  )
  await flavioRanking.locator('.live-swing-toggle').click()
  await expect(flavioRanking.locator('.live-swing-row')).toHaveCount(27)
  const ceRanking = flavioRanking.locator('[data-uf="ce"]')
  await expect(ceRanking.locator('.live-swing-value')).toHaveText('+23,7')
  await ceRanking.click()
  await expect(page.locator('#live-uf')).toHaveValue('ce')

  state.phase = 1
  await page.clock.fastForward(35_000)
  await expect(page.locator('#national-time')).toContainText('17:01:00')
  await ready(page)
  expect(await shape.evaluate((el) => getComputedStyle(el).fill)).not.toBe(initialColor)
  await expect(ceRanking.locator('.live-swing-value')).toHaveText('+13,7')
  await expect(flavioRanking.locator('.live-swing-row')).toHaveCount(27)
  await expect(flavioRanking.locator('.live-swing-toggle')).toHaveAttribute('aria-expanded', 'true')
  await expect(lulaRanking.locator('.live-swing-row').first()).toHaveAttribute('data-uf', 'rr')
  await expect(lulaRanking.locator('.live-swing-value').first()).toHaveText('+32,1')
  await expect(page.locator('#live-map path[aria-label^="Ceará."]')).toHaveAttribute(
    'aria-label',
    /13,73 p.p./,
  )

  state.status = 503
  await page.clock.fastForward(5_100)
  await page.locator('#refresh-live').click()
  await expect(page.locator('#national-time')).toContainText('Dados anteriores')
  await ready(page)
  await expect(page.locator('#national-result')).toContainText('55,00%')
  state.status = 200
  await page.clock.fastForward(5_100)
  await page.locator('#refresh-live').click()
  await expect(page.locator('#live-dashboard')).toHaveAttribute('data-connection', 'live')
  await expect(page.locator('#national-time')).not.toContainText('Dados anteriores')
})

test('pauses requests after a TSE rate limit', async ({ page }) => {
  await page.clock.install()
  const state = await mockTse(page)
  state.status = 429
  await page.goto('/segundo-turno/')
  await expect(page.locator('#connection-status')).toContainText('pausadas')
  await expect(page.locator('#live-notice')).toContainText('10 minutos')
  const calls = state.calls
  await page.clock.fastForward(120_000)
  await page.locator('#refresh-live').click()
  expect(state.calls).toBe(calls)
})
