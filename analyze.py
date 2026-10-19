#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.13"
# dependencies = ["numpy"]
# ///
"""First-pass analysis of the municipal dataset built by build_dataset.py.

Every statistic is weighted by valid votes, so each municipality counts as much as its
electorate. Writes JSON tables to data/analysis/.
"""

import csv
import json
import math
from collections import defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).parent
SOURCE = ROOT / 'data' / 'municipios_presidente_1t_2026.csv'
OUT = ROOT / 'data' / 'analysis'

REGIONS = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul']

# (id, label, how to read it from a row); income enters correlations and models as log10
VARIABLES = [
    ('renda', 'Renda per capita (R$)', lambda r: r['income']),
    ('pretos_pardos', '% pretos e pardos', lambda r: r['black_brown']),
    ('alfabetizacao', 'Taxa de alfabetização (%)', lambda r: r['literacy']),
]


def load_rows():
    rows = []
    for raw in csv.DictReader(SOURCE.open(encoding='utf-8')):
        valid = int(raw['valid_votes'])
        row = {
            'ibge_code': raw['ibge_code'],
            'municipality': raw['municipality'],
            'state': raw['state'],
            'region': raw['region'],
            'valid_votes': valid,
            'votes_flavio': int(raw['votes_flavio_bolsonaro']),
            'votes_lula': int(raw['votes_lula']),
            'pct_flavio': 100 * int(raw['votes_flavio_bolsonaro']) / valid,
            'pct_lula': 100 * int(raw['votes_lula']) / valid,
            'winner': raw['winner'],
            'income': float(raw['income_per_capita_mean_2022'] or 'nan'),
            'black_brown': float(raw['pct_black_2022'] or 'nan') + float(raw['pct_brown_2022'] or 'nan'),
            'literacy': float(raw['literacy_rate_15plus_2022'] or 'nan'),
        }
        rows.append(row)
    return rows


def vote_share(rows):
    valid = sum(r['valid_votes'] for r in rows)
    return {
        'valid_votes': valid,
        'pct_flavio': round(100 * sum(r['votes_flavio'] for r in rows) / valid, 2),
        'pct_lula': round(100 * sum(r['votes_lula'] for r in rows) / valid, 2),
    }


def summary(rows):
    return [{
        'escopo': 'Brasil (sem exterior)',
        'municipios': len(rows),
        **vote_share(rows),
        'vitorias_flavio': sum(r['winner'] == 'FLAVIO BOLSONARO' for r in rows),
        'vitorias_lula': sum(r['winner'] == 'LULA' for r in rows),
    }]


def by_group(rows, key, order=None):
    groups = defaultdict(list)
    for row in rows:
        groups[row[key]].append(row)
    out = []
    for name in order or sorted(groups):
        share = vote_share(groups[name])
        out.append({
            key: name,
            'municipios': len(groups[name]),
            **share,
            'margem_pp': round(share['pct_flavio'] - share['pct_lula'], 2),
            'vitorias_flavio': sum(r['winner'] == 'FLAVIO BOLSONARO' for r in groups[name]),
            'vitorias_lula': sum(r['winner'] == 'LULA' for r in groups[name]),
        })
    return out


def by_state(rows):
    region_of = {r['state']: r['region'] for r in rows}
    states = by_group(rows, 'state')
    for state in states:
        state['region'] = region_of[state['state']]
    return sorted(states, key=lambda s: s['margem_pp'], reverse=True)


def vote_bands(rows):
    """Ten bands per variable, each holding about a tenth of the valid votes."""
    out = []
    for var_id, label, get in VARIABLES:
        usable = sorted((r for r in rows if not math.isnan(get(r))), key=get)
        total = sum(r['valid_votes'] for r in usable)
        bands, cumulative = defaultdict(list), 0
        for row in usable:
            bands[min(9, int(10 * cumulative / total))].append(row)
            cumulative += row['valid_votes']
        for band, members in sorted(bands.items()):
            values = [get(r) for r in members]
            out.append({
                'variavel': var_id,
                'rotulo': label,
                'faixa': band + 1,
                'x_min': round(min(values), 2),
                'x_max': round(max(values), 2),
                'x_mediana': round(float(np.median(values)), 2),
                'municipios': len(members),
                **vote_share(members),
            })
    return out


def weighted_corr(x, y, w):
    mx, my = np.average(x, weights=w), np.average(y, weights=w)
    cov = np.average((x - mx) * (y - my), weights=w)
    return cov / math.sqrt(np.average((x - mx) ** 2, weights=w) * np.average((y - my) ** 2, weights=w))


def predictor(row, var_id):
    value = dict((v[0], v[2]) for v in VARIABLES)[var_id](row)
    return math.log10(value) if var_id == 'renda' else value


def correlations(rows):
    usable = [r for r in rows if not any(math.isnan(v[2](r)) for v in VARIABLES)]
    out = []
    for scope in ['Brasil', *REGIONS]:
        members = usable if scope == 'Brasil' else [r for r in usable if r['region'] == scope]
        w = np.array([r['valid_votes'] for r in members], dtype=float)
        for var_id, label, _ in VARIABLES:
            x = np.array([predictor(r, var_id) for r in members])
            out.append({
                'escopo': scope,
                'variavel': var_id,
                'rotulo': label,
                'municipios': len(members),
                'r_flavio': round(weighted_corr(x, np.array([r['pct_flavio'] for r in members]), w), 3),
                'r_lula': round(weighted_corr(x, np.array([r['pct_lula'] for r in members]), w), 3),
            })
    return out


def weighted_r2(columns, y, w):
    X = np.column_stack([np.ones(len(y)), *columns])
    sw = np.sqrt(w)
    beta, *_ = np.linalg.lstsq(X * sw[:, None], y * sw, rcond=None)
    residual = y - X @ beta
    total = y - np.average(y, weights=w)
    return 1 - np.sum(w * residual**2) / np.sum(w * total**2)


def models(rows):
    """Share of the municipal variation in each candidate's vote that each factor accounts for."""
    usable = [r for r in rows if not any(math.isnan(v[2](r)) for v in VARIABLES)]
    w = np.array([r['valid_votes'] for r in usable], dtype=float)
    region_dummies = [np.array([r['region'] == name for r in usable], dtype=float) for name in REGIONS[1:]]
    factor = {var_id: [np.array([predictor(r, var_id) for r in usable])] for var_id, _, _ in VARIABLES}
    specs = [
        ('Região', region_dummies),
        ('Renda', factor['renda']),
        ('Cor ou raça', factor['pretos_pardos']),
        ('Alfabetização', factor['alfabetizacao']),
        ('Renda + cor + alfabetização', factor['renda'] + factor['pretos_pardos'] + factor['alfabetizacao']),
        ('Tudo + região', region_dummies + factor['renda'] + factor['pretos_pardos'] + factor['alfabetizacao']),
    ]
    out = []
    for name, columns in specs:
        out.append({
            'modelo': name,
            'municipios': len(usable),
            'r2_flavio': round(weighted_r2(columns, np.array([r['pct_flavio'] for r in usable]), w), 3),
            'r2_lula': round(weighted_r2(columns, np.array([r['pct_lula'] for r in usable]), w), 3),
        })
    return out


def municipalities(rows):
    return [{
        'ibge_code': r['ibge_code'],
        'municipio': r['municipality'],
        'uf': r['state'],
        'regiao': r['region'],
        'votos_validos': r['valid_votes'],
        'pct_flavio': round(r['pct_flavio'], 2),
        'pct_lula': round(r['pct_lula'], 2),
        'margem_pp': round(r['pct_flavio'] - r['pct_lula'], 2),
        'renda': None if math.isnan(r['income']) else r['income'],
        'pretos_pardos': None if math.isnan(r['black_brown']) else round(r['black_brown'], 2),
        'alfabetizacao': None if math.isnan(r['literacy']) else r['literacy'],
    } for r in rows]


def main():
    rows = load_rows()
    tables = {
        'resumo': summary(rows),
        'regioes': by_group(rows, 'region', REGIONS),
        'ufs': by_state(rows),
        'faixas': vote_bands(rows),
        'correlacoes': correlations(rows),
        'modelos': models(rows),
        'municipios': municipalities(rows),
    }
    OUT.mkdir(parents=True, exist_ok=True)
    for name, table in tables.items():
        (OUT / f'{name}.json').write_text(json.dumps(table, ensure_ascii=False))
        print(f'{name}: {len(table)} rows')


if __name__ == '__main__':
    main()
