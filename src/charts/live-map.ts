import { compareRounds, formatDelta } from '../lib/round-comparison'
import { geoConicEqualArea, geoPath, interpolateLab, scaleLinear, select } from 'd3'
import { feature, merge } from 'topojson-client'
import type { GeometryCollection, Topology, Polygon, MultiPolygon } from 'topojson-specification'
import type { FeatureCollection, Geometry, Feature, MultiPolygon as GeoMultiPolygon } from 'geojson'
import { STATES, candidateColor, leader, placeName, type Result } from '../lib/tse'

type Props = { codarea: string }
type MunicipalTopology = Topology<{ BRMU: GeometryCollection<Props> }>
type StateFeature = Feature<GeoMultiPolygon, { uf: string }>
export type LiveMapMetric = 'leader' | 'progress'

export async function createLiveMap(host: HTMLElement, onSelect: (uf: string) => void) {
  const response = await fetch('/data/municipios.topo.json')
  if (!response.ok) throw new Error('Não foi possível carregar a malha do mapa.')
  const topology: MunicipalTopology = await response.json()
  const states: StateFeature[] = Object.entries(STATES).map(([uf, { ibge }]) => ({
    type: 'Feature',
    properties: { uf },
    geometry: merge(
      topology,
      topology.objects.BRMU.geometries.filter(
        (g): g is Polygon<Props> | MultiPolygon<Props> =>
          (g.type === 'Polygon' || g.type === 'MultiPolygon') &&
          (g.properties?.codarea.startsWith(ibge) ?? false),
      ),
    ),
  }))
  // Fit against the same municipal mesh used on the first-round page.
  const municipalities = feature(topology, topology.objects.BRMU) as FeatureCollection<Geometry>
  const projection = geoConicEqualArea()
    .parallels([-2, -22])
    .rotate([54, 0])
    .fitExtent(
      [
        [16, 16],
        [704, 590],
      ],
      municipalities,
    )
  const path = geoPath(projection)
  const svg = select(host)
    .append('svg')
    .attr('viewBox', '0 0 720 610')
    .attr('role', 'group')
    .attr('aria-label', 'Mapa do Brasil. Selecione um estado para consultar os votos.')
  const shapes = svg
    .append('g')
    .selectAll<SVGPathElement, StateFeature>('path')
    .data(states)
    .join('path')
    .attr('d', path)
    .attr('class', 'live-state')
    .attr('tabindex', 0)
    .attr('role', 'button')
    .on('click', (_, f) => onSelect(f.properties.uf))
    .on('keydown', (event: KeyboardEvent, f) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onSelect(f.properties.uf)
      }
    })
  shapes.append('title')
  svg
    .append('g')
    .attr('aria-hidden', 'true')
    .selectAll('text')
    .data(states)
    .join('text')
    .attr('transform', (f) => `translate(${path.centroid(f).join(',')})`)
    .attr('class', 'live-state-label')
    .attr('text-anchor', 'middle')
    .text((f) => f.properties.uf.toUpperCase())
  // The DF is too small to select comfortably at this scale; give it a visible target.
  const df = states.find((f) => f.properties.uf === 'df')!
  const [x, y] = path.centroid(df)
  const dfTarget = svg
    .append('circle')
    .attr('cx', x)
    .attr('cy', y)
    .attr('r', 8)
    .attr('class', 'live-state')
    .attr('role', 'button')
    .attr('tabindex', 0)
    .attr('aria-label', 'Distrito Federal')
    .on('click', () => onSelect('df'))
    .on('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onSelect('df')
      }
    })
  dfTarget.append('title').text('Distrito Federal')

  return (results: Map<string, Result>, selected: string, metric: LiveMapMetric) => {
    const tokens = getComputedStyle(host)
    const ramp = scaleLinear<string>()
      .domain([0, 100])
      .range([
        tokens.getPropertyValue('--seq-low').trim(),
        tokens.getPropertyValue('--seq-high').trim(),
      ])
      .interpolate(interpolateLab)
      .clamp(true)
    const fill = (uf: string) => {
      const result = results.get(uf)
      if (!result) return 'var(--muted-mark)'
      if (metric === 'progress')
        return result.progress == null ? 'var(--muted-mark)' : ramp(result.progress)
      const candidate = leader(result)
      return candidate ? candidateColor(candidate.number) : 'var(--muted-mark)'
    }
    const label = (uf: string) => {
      const r = results.get(uf)
      const c = leader(r)
      const progress = r?.progress?.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
      const comparison =
        r?.candidates
          .map((candidate) => {
            const value = compareRounds(uf, candidate.number, r)
            return value?.deltaPp == null
              ? ''
              : `${candidate.name}: 1º turno ${value.firstPercent.toLocaleString('pt-BR')}%, ${formatDelta(value.deltaPp)}.`
          })
          .filter(Boolean)
          .join(' ') ?? ''
      return `${placeName(uf)}. ${r ? `${progress ?? '—'}% das seções totalizadas. ${c ? `${c.name} à frente, ${c.percent?.toLocaleString('pt-BR')}% dos válidos.` : 'Sem liderança divulgada.'}` : 'Dados indisponíveis.'} ${comparison}`
    }
    shapes
      .style('fill', (f) => fill(f.properties.uf))
      .classed('selected', (f) => f.properties.uf === selected)
      .attr('aria-pressed', (f) => String(f.properties.uf === selected))
      .attr('aria-label', (f) => label(f.properties.uf))
    shapes.select('title').text((f) => label(f.properties.uf))
    dfTarget
      .style('fill', fill('df'))
      .classed('selected', selected === 'df')
      .attr('aria-pressed', String(selected === 'df'))
      .attr('aria-label', label('df'))
  }
}
