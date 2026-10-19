# 1º turno 2026 por município

O resultado do 1º turno da eleição presidencial de 2026 (TSE), cruzado com renda, cor ou raça e alfabetização do Censo 2022 (IBGE), município a município. O projeto tem duas partes: um pipeline em Python que baixa e confere os dados oficiais, e um site estático em Astro + d3 que mostra o que eles dizem.

**Site:** https://eleicoes-2026.caioapolonio.dev

![Astro](https://img.shields.io/badge/Astro-7-BC52EE?logo=astro&logoColor=white)
![D3](https://img.shields.io/badge/d3-7-F9A03C?logo=d3dotjs&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-1.3-000000?logo=bun&logoColor=white)
[![CI](https://github.com/caioapolonio/eleicoes-2026/actions/workflows/ci.yml/badge.svg)](https://github.com/caioapolonio/eleicoes-2026/actions/workflows/ci.yml)

![Topo do site: título, resumo e os números nacionais](docs/hero.png)

## O que o site mostra

- **Onde cada um venceu**: votos por região e margem de Flávio sobre Lula em cada estado.
- **Voto e perfil do município**: o voto de cada candidato ao longo de dez faixas de renda, de cor ou raça e de alfabetização.
- **Dentro de cada região**: correlações no país todo e dentro de cada uma das cinco regiões.
- **Município a município**: renda × margem nos 5.570 municípios, em duas visões. A **dispersão** usa escala logarítmica e permite destacar uma região. O **mapa** pinta cada município pela margem ou pela renda. Um link terminado em `#mapa` já abre o mapa.
- **Quanto cada fator explica**: o R² de regressões com região, renda, cor ou raça e alfabetização.
- **2º turno**: uma aba própria, que espera a votação de 25 de outubro e os dados abertos do TSE para ganhar os mesmos gráficos.

|                              Mapa                               |                                     Dispersão                                     |
| :-------------------------------------------------------------: | :-------------------------------------------------------------------------------: |
| ![Mapa municipal da margem de Flávio sobre Lula](docs/mapa.png) | ![Renda per capita em escala log contra a margem, por região](docs/dispersao.png) |

![Voto por faixas de renda, cor ou raça e alfabetização](docs/perfil.png)

## O que os dados mostram

1. **A região é o fator mais forte.**
   - Sozinha, ela explica 62% da variação do voto em Lula entre os municípios (55% no caso de Flávio).
   - Renda, cor ou raça e alfabetização juntas explicam quase o mesmo: 61% para Lula e 53% para Flávio. Com a região junto, chega a 72% e 64%.
   - Lula teve 63,8% no Nordeste e venceu em 1.764 dos 1.794 municípios da região. Flávio teve 60,1% no Sul, 56,5% no Centro-Oeste e 51,4% no Sudeste.
   - O Norte ficou dividido: Flávio teve mais votos (49,2% a 44,7%), mas Lula venceu em mais municípios (246 de 450).
2. **Boa parte do peso da renda é diferença entre regiões.**
   - No país todo, a correlação da renda com o voto em Lula é de −0,63.
   - Dentro do Sul, do Sudeste e do Centro-Oeste, ela fica entre −0,12 e +0,03. No Norte e no Nordeste continua forte, perto de −0,65.
   - Com a mesma renda (de R$ 800 a R$ 1.100 per capita), a margem mediana de Flávio é de −39 pontos no Nordeste, +8 no Sul e +5 no Centro-Oeste.
3. **A relação com cor ou raça aparece em todas as regiões.** A correlação da proporção de pretos e pardos com o voto em Lula é de +0,64 no país e fica entre +0,20 e +0,48 dentro das regiões.
4. **A alfabetização tem a maior correlação nacional** (−0,73 com o voto em Lula), mas dentro das regiões só continua forte no Nordeste (−0,62).

Estas são relações entre municípios, não entre eleitores: não dizem como cada pessoa votou.

## Rodando localmente

Para rodar o site, você precisa de [Bun](https://bun.sh) e Node 22 ou mais novo. Para refazer os dados, também do [uv](https://docs.astral.sh/uv/), que instala o Python 3.13.

```bash
bun install
bun run dev
```

O site abre em `http://localhost:4321`. Os dados já processados estão no repositório, então não é preciso baixar nada para rodar o site.

Para refazer tudo a partir das fontes oficiais:

```bash
bun run data
```

O comando baixa os arquivos do TSE e do IBGE (cerca de 30 MB, guardados em `data/raw/`), confere as somas com o total oficial do TSE e gera de novo as tabelas e os arquivos do site. Para gerar o site estático em `dist/`, que pode ser publicado em qualquer hospedagem:

```bash
bun run build
```

## Deploy e CI/CD

- **CI** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)): roda em todo push e pull request. Confere a formatação (Prettier), os tipos (`astro check`), o build do site, a sintaxe dos scripts Python e o build da imagem Docker.
- **CD**: o site roda num [Coolify](https://coolify.io) próprio, ligado ao repositório por um GitHub App. Cada push na `main` dispara um novo deploy. O [`Dockerfile`](Dockerfile) checa os tipos e gera o site; se algo quebrar, o deploy falha e a versão anterior continua no ar.
- **Servidor**: nginx ([`nginx.conf`](nginx.conf)) serve os arquivos estáticos com gzip, o que reduz os dados municipais de 1,3 MB para cerca de 220 KB, e com cache longo para os arquivos com hash.

## Fontes dos dados

| Fonte                                                                                                                                                | O que vem dela                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [TSE · Dados Abertos, Resultados 2026](https://dadosabertos.tse.jus.br/dataset/resultados-2026)                                                      | Votação por partido por município e zona; detalhe da apuração (aptos, comparecimento, brancos, nulos) |
| [TSE · Divulgação de resultados](https://resultados.tse.jus.br/)                                                                                     | Total nacional oficial, usado para conferir as somas, e a tabela que liga o código TSE ao código IBGE |
| [IBGE · Censo 2022, tabela 10295](https://sidra.ibge.gov.br/tabela/10295)                                                                            | Rendimento domiciliar per capita médio e mediano                                                      |
| [IBGE · Censo 2022, tabela 9605](https://sidra.ibge.gov.br/tabela/9605)                                                                              | População por cor ou raça                                                                             |
| [IBGE · Censo 2022, tabela 9543](https://sidra.ibge.gov.br/tabela/9543)                                                                              | Taxa de alfabetização de 15 anos ou mais                                                              |
| [IBGE · Estimativas de população (6579)](https://sidra.ibge.gov.br/tabela/6579) e [PIB dos Municípios (5938)](https://sidra.ibge.gov.br/tabela/5938) | População estimada de 2026 e PIB de 2023 (no CSV, não usados no site)                                 |
| [IBGE · API de malhas](https://servicodados.ibge.gov.br/api/docs/malhas?versao=3)                                                                    | Malha municipal do mapa                                                                               |
| [IBGE · API de localidades](https://servicodados.ibge.gov.br/api/docs/localidades)                                                                   | Região, região intermediária e região imediata de cada município                                      |

Os arquivos do TSE usados aqui foram gerados em 18/10/2026.

## Como os dados são montados

1. **[`build_dataset.py`](build_dataset.py)**
   - Baixa os arquivos do TSE e as tabelas do IBGE.
   - Soma as zonas eleitorais de cada município e liga o código do TSE ao do IBGE.
   - Compara os totais com o resultado oficial e para com erro se algum voto não bater.
   - Gera [`data/municipios_presidente_1t_2026.csv`](data/municipios_presidente_1t_2026.csv): 5.571 municípios × 52 colunas.
2. **[`analyze.py`](analyze.py)**: calcula as faixas, as correlações e as regressões, todas ponderadas por votos válidos, e salva o resultado em [`data/analysis/`](data/analysis).
3. **[`scripts/prepare-site-data.ts`](scripts/prepare-site-data.ts)**: copia a tabela municipal e baixa a malha do IBGE para `public/data/`.

### Detalhes que poupam tempo

- O TSE usa um código de município próprio. A tabela de municípios da divulgação (`oficial/ele2026/6257/config/mun-e006257-cm.json`) traz o código TSE (`cd`) e o código IBGE (`cdi`) lado a lado. Os 5.571 casam, mas 13 nomes são escritos de forma diferente nas duas bases. Por isso, nunca cruze pelo nome.
- Em 2026, os arquivos `dados-simplificados/...-r.json` da divulgação dão 404. Os resultados estão em `dados/{uf}/...-u.json`.
- Para presidente, o número do candidato é o do partido. Assim, o arquivo de votação por partido (24 MB) dá os votos de cada candidato sem precisar do arquivo por candidato (456 MB).
- A API de agregados do IBGE às vezes responde com o corpo em gzip sem avisar no cabeçalho `Content-Encoding`.

## Estrutura

```
├── build_dataset.py        # TSE + IBGE → CSV por município, com conferência dos totais
├── analyze.py              # faixas, correlações e regressões ponderadas
├── Dockerfile, nginx.conf  # imagem de produção (build + nginx)
├── .github/workflows/      # CI
├── data/
│   ├── municipios_presidente_1t_2026.csv
│   └── analysis/           # tabelas que o site lê
├── public/data/            # tabela municipal e malha do mapa, servidas ao navegador
├── scripts/prepare-site-data.ts
└── src/
    ├── layouts/Base.astro  # cabeçalho com as abas dos turnos e rodapé de fontes
    ├── pages/              # index.astro (1º turno) e segundo-turno.astro
    ├── components/         # tabela de correlações, card de municípios, rodapé de fontes
    ├── charts/             # gráficos em d3: barras, faixas, dispersão, mapa
    ├── lib/                # dados tipados, formatação pt-BR, utilitários de gráfico
    └── styles/global.css   # tokens de cor e tipografia, modo claro e escuro
```

## Método e limites

- Cada município pesa pelo número de votos válidos nas faixas, nas correlações e nas regressões. A renda entra em escala logarítmica.
- As faixas juntam municípios ordenados por cada variável em dez grupos, cada um com cerca de um décimo dos votos válidos.
- Os votos do exterior ficam de fora. Por isso, os percentuais nacionais diferem do oficial na segunda casa decimal (47,04% e não 47,03% para Flávio).
- Boa Esperança do Norte (MT) foi criado depois do Censo 2022. Ele tem votos e população estimada, mas fica fora das análises de perfil e do mapa.
- O perfil dos municípios é de 2022 e o voto é de 2026.
