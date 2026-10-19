#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.13"
# dependencies = ["certifi"]
# ///
"""Join the 2026 presidential first round (TSE) with IBGE indicators, one row per municipality.

Downloads are cached in data/raw/; delete that folder to fetch fresh copies.
Output: data/municipios_presidente_1t_2026.csv
"""

import csv
import gzip
import io
import json
import ssl
import time
import unicodedata
import urllib.error
import urllib.request
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

import certifi

# python.org builds ship without a CA bundle
SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())

ROOT = Path(__file__).parent
RAW = ROOT / 'data' / 'raw'
OUTPUT = ROOT / 'data' / 'municipios_presidente_1t_2026.csv'

TSE_OPEN_DATA = 'https://cdn.tse.jus.br/estatistica/sead/odsele'
TSE_RESULTS = 'https://resultados.tse.jus.br/oficial/ele2026/6257'  # federal election, 1st round
IBGE_API = 'https://servicodados.ibge.gov.br/api'

TURN = '1'
OFFICE = '1'  # Presidente
ABROAD = 'ZZ'  # votes cast outside Brazil

TURNOUT_FIELDS = {
    'QT_APTOS': 'voters',
    'QT_COMPARECIMENTO': 'turnout',
    'QT_ABSTENCOES': 'abstentions',
    'QT_TOTAL_VOTOS_VALIDOS': 'valid_votes',
    'QT_VOTOS_BRANCOS': 'blank_votes',
    'QT_TOTAL_VOTOS_NULOS': 'null_votes',
}

# IBGE's English names for the census colour/race categories
RACE_COLUMNS = {
    'Branca': 'pct_white_2022',
    'Preta': 'pct_black_2022',
    'Parda': 'pct_brown_2022',
    'Amarela': 'pct_yellow_2022',
    'Indígena': 'pct_indigenous_2022',
}


def fetch(url, cache_name):
    cache = RAW / cache_name
    if cache.exists():
        return cache.read_bytes()
    print(f'  downloading {url}')
    request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=300, context=SSL_CONTEXT) as response:
                data = response.read()
            break
        except OSError as err:
            client_error = isinstance(err, urllib.error.HTTPError) and err.code < 500
            if client_error or attempt == 3:
                raise
            print(f'  retrying ({err})')
            time.sleep(2**attempt)
    # IBGE's API sends gzipped bodies without a Content-Encoding header
    if data[:2] == b'\x1f\x8b':
        data = gzip.decompress(data)
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_bytes(data)
    return data


def read_tse_csv(zip_bytes, member):
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as archive, archive.open(member) as raw:
        yield from csv.DictReader(io.TextIOWrapper(raw, encoding='latin-1'), delimiter=';')


def is_presidential_first_round(row):
    return row['NR_TURNO'] == TURN and row['CD_CARGO'] == OFFICE


def slugify(text):
    ascii_text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode()
    return '_'.join(ascii_text.lower().replace('-', ' ').split())


def load_tse_to_ibge():
    config = json.loads(fetch(f'{TSE_RESULTS}/config/mun-e006257-cm.json', 'tse_municipios.json'))
    return {
        mun['cd']: mun['cdi']
        for state in config['abr']
        if state['cd'].upper() != ABROAD
        for mun in state['mu']
    }


def load_national_result():
    """Official national totals (abroad included), used for names and to validate our sums."""
    result = json.loads(fetch(f'{TSE_RESULTS}/dados/br/br-c0001-e006257-u.json', 'tse_brasil.json'))
    candidates = {
        cand['n']: (cand['nmu'], int(cand['vap']))
        for coalition in result['carg'][0]['agr']
        for party in coalition['par']
        for cand in party['cand']
    }
    totals = {
        'voters': int(result['e']['te']),
        'turnout': int(result['e']['c']),
        'abstentions': int(result['e']['a']),
        'valid_votes': int(result['v']['vv']),
        'blank_votes': int(result['v']['vb']),
        'null_votes': int(result['v']['tvn']),
    }
    return candidates, totals


def load_votes(tse_to_ibge):
    # For majoritarian offices the candidate number is the party number, so the party file's
    # nominal votes are each candidate's votes. Its BR member is presidential-only: ~24 MB
    # instead of the 456 MB candidate-by-zone archive.
    data = fetch(
        f'{TSE_OPEN_DATA}/votacao_partido_munzona/votacao_partido_munzona_2026.zip',
        'votacao_partido_munzona_2026.zip',
    )
    by_municipality = defaultdict(Counter)
    national = Counter()
    for row in read_tse_csv(data, 'votacao_partido_munzona_2026_BR.csv'):
        if not is_presidential_first_round(row):
            continue
        votes = int(row['QT_VOTOS_NOMINAIS_VALIDOS'])
        national[row['NR_PARTIDO']] += votes
        if row['SG_UF'] != ABROAD:
            by_municipality[tse_to_ibge[row['CD_MUNICIPIO'].zfill(5)]][row['NR_PARTIDO']] += votes
    return by_municipality, national


def load_turnout(tse_to_ibge):
    data = fetch(
        f'{TSE_OPEN_DATA}/detalhe_votacao_munzona/detalhe_votacao_munzona_2026.zip',
        'detalhe_votacao_munzona_2026.zip',
    )
    by_municipality = defaultdict(Counter)
    national = Counter()
    for row in read_tse_csv(data, 'detalhe_votacao_munzona_2026_BR.csv'):
        if not is_presidential_first_round(row):
            continue
        values = {name: int(row[field]) for field, name in TURNOUT_FIELDS.items()}
        national.update(values)
        if row['SG_UF'] != ABROAD:
            by_municipality[tse_to_ibge[row['CD_MUNICIPIO'].zfill(5)]].update(values)
    return by_municipality, national


def ibge_by_municipality(table, period, variable, classification=''):
    """{category name: {ibge code: value}} for every municipality ('Total' when unclassified)."""
    url = f'{IBGE_API}/v3/agregados/{table}/periodos/{period}/variaveis/{variable}?localidades=N6[all]'
    if classification:
        url += f'&classificacao={classification}'
    data = json.loads(fetch(url, f'ibge_{table}_{period}_{variable}.json'))
    by_category = {}
    for result in data[0]['resultados']:
        categories = [name for c in result['classificacoes'] for name in c['categoria'].values()]
        key = categories[-1] if categories else 'Total'
        by_category[key] = {s['localidade']['id']: parse_ibge(s['serie'][period]) for s in result['series']}
    return by_category


def parse_ibge(value):
    # '-' is a true zero; '...', '..' and 'X' mean unavailable, not applicable or suppressed
    if value == '-':
        return 0.0
    try:
        return float(value)
    except ValueError:
        return None


def load_ibge_indicators():
    population_2026 = ibge_by_municipality(6579, '2026', 9324)['Total']
    population_2022 = ibge_by_municipality(4714, '2022', 93)['Total']
    gdp_2023 = ibge_by_municipality(5938, '2023', 37)['Total']
    income_mean = ibge_by_municipality(10295, '2022', 13431, '2[6794]|86[95251]|58[95253]')['Total']
    income_median = ibge_by_municipality(10295, '2022', 13534, '2[6794]|86[95251]|58[95253]')['Total']
    literacy = ibge_by_municipality(9543, '2022', 2513, '2[6794]|86[95251]|287[100362]')['Total']
    race = ibge_by_municipality(9605, '2022', 1000093, '86[2776,2777,2778,2779,2780]')

    indicators = defaultdict(dict)
    for code, value in population_2026.items():
        indicators[code]['population_2026'] = value
    for code, value in population_2022.items():
        indicators[code]['population_2022'] = value
    for code, value in gdp_2023.items():
        indicators[code]['gdp_2023_thousand_brl'] = value
        # IBGE published no 2023 population estimate, so per capita uses the 2022 census
        if value is not None and population_2022.get(code):
            indicators[code]['gdp_per_capita_2023_brl'] = round(value * 1000 / population_2022[code], 2)
    for code, value in income_mean.items():
        indicators[code]['income_per_capita_mean_2022'] = value
    for code, value in income_median.items():
        indicators[code]['income_per_capita_median_2022'] = value
    for code, value in literacy.items():
        indicators[code]['literacy_rate_15plus_2022'] = value
    for category, column in RACE_COLUMNS.items():
        for code, value in race[category].items():
            indicators[code][column] = value
    return indicators


def load_geography():
    states = json.loads(fetch(f'{IBGE_API}/v1/localidades/estados', 'ibge_estados.json'))
    state_by_code = {str(s['id']): (s['sigla'], s['regiao']['nome']) for s in states}
    municipalities = json.loads(fetch(f'{IBGE_API}/v1/localidades/municipios', 'ibge_municipios.json'))
    geography = {}
    for mun in municipalities:
        code = str(mun['id'])
        state, region = state_by_code[code[:2]]
        immediate = mun.get('regiao-imediata') or {}
        geography[code] = {
            'municipality': mun['nome'],
            'state': state,
            'region': region,
            'intermediate_region': (immediate.get('regiao-intermediaria') or {}).get('nome', ''),
            'immediate_region': immediate.get('nome', ''),
        }
    return geography


def check_against_official(national_votes, national_turnout, candidates, official_totals):
    problems = [
        f'{name}: {national_votes[number]} != {official}'
        for number, (name, official) in candidates.items()
        if national_votes[number] != official
    ]
    problems += [
        f'{field}: {national_turnout[field]} != {official}'
        for field, official in official_totals.items()
        if national_turnout[field] != official
    ]
    if problems:
        raise SystemExit('Totals differ from the official TSE result:\n  ' + '\n  '.join(problems))
    print('  national totals match the official TSE result')


def main():
    print('TSE')
    tse_to_ibge = load_tse_to_ibge()
    candidates, official_totals = load_national_result()
    votes, national_votes = load_votes(tse_to_ibge)
    turnout, national_turnout = load_turnout(tse_to_ibge)
    check_against_official(national_votes, national_turnout, candidates, official_totals)

    print('IBGE')
    indicators = load_ibge_indicators()
    geography = load_geography()

    ranked = sorted(candidates.items(), key=lambda item: item[1][1], reverse=True)
    vote_columns = []
    for _, (name, _) in ranked:
        vote_columns += [f'votes_{slugify(name)}', f'pct_{slugify(name)}']
    indicator_columns = [
        'population_2026',
        'population_2022',
        'gdp_2023_thousand_brl',
        'gdp_per_capita_2023_brl',
        'income_per_capita_mean_2022',
        'income_per_capita_median_2022',
        *RACE_COLUMNS.values(),
        'literacy_rate_15plus_2022',
    ]
    header = [
        'ibge_code',
        'tse_code',
        'municipality',
        'state',
        'region',
        'intermediate_region',
        'immediate_region',
        *TURNOUT_FIELDS.values(),
        'abstention_pct',
        'winner',
        'winner_pct',
        *vote_columns,
        *indicator_columns,
    ]

    ibge_to_tse = {ibge: tse for tse, ibge in tse_to_ibge.items()}
    rows = []
    for code in sorted(turnout):
        counts, valid = votes[code], turnout[code]['valid_votes']
        winner_number, winner_votes = counts.most_common(1)[0]
        row = {
            'ibge_code': code,
            'tse_code': ibge_to_tse[code],
            **geography[code],
            **turnout[code],
            'abstention_pct': round(100 * turnout[code]['abstentions'] / turnout[code]['voters'], 2),
            'winner': candidates[winner_number][0],
            'winner_pct': round(100 * winner_votes / valid, 2),
            **indicators.get(code, {}),
        }
        for number, (name, _) in ranked:
            row[f'votes_{slugify(name)}'] = counts[number]
            row[f'pct_{slugify(name)}'] = round(100 * counts[number] / valid, 2) if valid else None
        rows.append(row)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open('w', newline='', encoding='utf-8') as file:
        writer = csv.DictWriter(file, fieldnames=header)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: format_value(value) for key, value in row.items()})

    print(f'\n{len(rows)} municipalities -> {OUTPUT.relative_to(ROOT)}')
    for column in indicator_columns:
        missing = [r['municipality'] for r in rows if r.get(column) is None]
        if missing:
            print(f'  {column}: missing for {len(missing)} ({", ".join(missing[:3])})')
    wins = Counter(row['winner'] for row in rows)
    print('  municipalities won: ' + ', '.join(f'{name} {n}' for name, n in wins.most_common()))


def format_value(value):
    if value is None:
        return ''
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


if __name__ == '__main__':
    main()
