import { formatLocale } from 'd3'

const br = formatLocale({ decimal: ',', thousands: '.', grouping: [3], currency: ['R$ ', ''] })

export const fmt = {
  pct: (v: number) => br.format('.1f')(v) + '%',
  pct0: (v: number) => br.format('.0f')(v) + '%',
  int: (v: number) => br.format(',d')(v),
  share: (v: number) => br.format('.0%')(v),
  money: (v: number) => 'R$ ' + br.format(',.0f')(v),
  // `+ 0` turns a margin that rounds to -0.0 into +0,0
  pp: (v: number) => br.format('+.1f')(Math.round(v * 10) / 10 + 0),
  ppAxis: (v: number) => (v === 0 ? '0' : br.format('+.0f')(v)),
  r: (v: number) => br.format('+.2f')(v),
}
