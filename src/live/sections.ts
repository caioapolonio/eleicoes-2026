import {
  sectionsUrl,
  sectionAuxUrl,
  sectionDirectory,
  type Catalog,
  type Section,
  type SectionConfig,
  type SectionAuxiliary,
  type TseClient,
} from '../lib/tse'

interface Scope {
  catalog: Catalog
  uf: string
  municipality: string
  zone: string
}
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => {
  const node = document.createElement(tag)
  node.textContent = text
  return node
}
const sourceLink = (label: string, url: string) => {
  const a = el('a', label)
  a.href = url
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  return a
}
export function sectionExplorer(client: TseClient) {
  const button = document.getElementById('load-sections') as HTMLButtonElement
  const message = document.getElementById('section-message')!
  const content = document.getElementById('section-content')!
  let scope: Scope | undefined
  let version = 0
  let sections: Section[] = []
  async function loadAuxiliary(number: string) {
    if (!scope) return
    const current = ++version
    const s = scope
    const section = sections.find((x) => x.ns === number)
    const result = document.getElementById('section-aux-result')!
    result.replaceChildren()
    if (!section) return
    if (section.nsp) {
      result.append(
        el(
          'p',
          `Seção agregada à seção ${Number(section.nsp)}. Os arquivos pertencem à seção principal.`,
        ),
      )
      return
    }
    if (section.nsa?.length)
      result.append(el('p', `Inclui as seções agregadas: ${section.nsa.map(Number).join(', ')}.`))
    if (!section.da || !section.ha) {
      result.append(
        el(
          'p',
          'O TSE ainda não sinalizou arquivos de urna recebidos para esta seção. Consulte as seções novamente após a publicação.',
        ),
      )
      return
    }
    const url = sectionAuxUrl(s.catalog, s.uf, s.municipality, s.zone, section.ns)
    try {
      const aux = await client.get<SectionAuxiliary>(url, 30_000)
      if (current !== version) return
      if (aux.f !== 'o') throw new Error('O arquivo recebido não pertence ao ambiente oficial.')
      result.append(
        el('p', `Situação: ${aux.st}. Arquivo gerado em ${aux.dg} às ${aux.hg} (Brasília).`),
        sourceLink('Dados completos desta seção', url),
      )
      const files = el('ul')
      for (const hash of aux.hashes ?? []) {
        const li = el('li', `${hash.st} · Recebido em ${hash.dr} às ${hash.hr}`)
        const list = el('ul')
        for (const file of hash.arq ?? []) {
          const item = el('li')
          const href = `${sectionDirectory(s.catalog, s.uf, s.municipality, s.zone, section.ns)}/${encodeURIComponent(hash.hash)}/${encodeURIComponent(file.nm)}`
          item.append(sourceLink(`${file.tp} · ${file.nm}`, href))
          list.append(item)
        }
        li.append(list)
        files.append(li)
      }
      result.append(files)
      const details = el('details')
      details.append(
        el('summary', 'Ver JSON original da seção'),
        el('pre', JSON.stringify(aux, null, 2)),
      )
      result.append(details)
    } catch (error) {
      if (current === version)
        result.append(
          el(
            'p',
            error instanceof Error
              ? error.message
              : 'Não foi possível consultar os arquivos da seção.',
          ),
        )
    }
  }
  button.addEventListener('click', async () => {
    if (!scope) return
    const current = ++version
    const s = scope
    button.disabled = true
    message.textContent = 'Consultando o cadastro de seções do TSE…'
    content.replaceChildren()
    try {
      const url = sectionsUrl(s.catalog, s.uf)
      const data = await client.get<SectionConfig>(url, 30_000)
      if (current !== version) return
      if (data.f !== 'o' || data.cdp !== s.catalog.pleito)
        throw new Error('O cadastro recebido não é do pleito oficial selecionado.')
      sections =
        data.abr
          .find((a) => a.cd === s.uf)
          ?.mu.find((m) => m.cd === s.municipality)
          ?.zon.find((z) => z.cd === s.zone)?.sec ?? []
      message.textContent = `${sections.length} seções cadastradas nesta zona e localidade. Cadastro gerado em ${data.dg} às ${data.hg} (Brasília).`
      const label = el('label', 'Seção eleitoral ')
      label.htmlFor = 'section-select'
      const select = el('select')
      select.id = 'section-select'
      select.append(
        new Option('Selecione uma seção', ''),
        ...sections.map(
          (section) =>
            new Option(
              `Seção ${Number(section.ns)}${section.nsp ? ' · agregada' : ''}`,
              section.ns,
            ),
        ),
      )
      select.addEventListener('change', () => void loadAuxiliary(select.value))
      const result = el('div')
      result.id = 'section-aux-result'
      content.append(label, select, sourceLink('Cadastro completo de seções (TSE)', url), result)
    } catch (error) {
      if (current === version)
        message.textContent =
          error instanceof Error ? error.message : 'Não foi possível consultar as seções.'
    } finally {
      if (current === version) button.disabled = false
    }
  })
  return (next?: Scope) => {
    const key = (s?: Scope) => (s ? `${s.uf}/${s.municipality}/${s.zone}` : '')
    if (key(next) === key(scope)) return
    scope = next
    ++version
    sections = []
    content.replaceChildren()
    button.disabled = !scope
    message.textContent = scope
      ? 'Consulte as seções desta zona para ver os boletins, registros digitais de voto e logs que o TSE disponibilizar.'
      : 'Selecione um município ou uma localidade do exterior e uma zona eleitoral.'
  }
}
