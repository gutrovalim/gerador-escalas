from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from src.config.loader import (
    DadosCarregados,
    ErroCarregamento,
    carregar_e_validar_cruzado,
    carregar_indisponibilidades,
    carregar_tudo,
    carregar_voluntarios,
)
from src.config.validator import ErroValidacaoCruzada, validar_rn08, validar_rn10
from src.domain.types import (
    Evento,
    Indisponibilidade,
    MinisterioSlug,
    ModoEscala,
    PapelSlug,
    Voluntario,
)

_DATA = Path(__file__).resolve().parents[1] / "data"


def test_carregar_tudo_data_do_repositorio() -> None:
    dados = carregar_tudo(_DATA)
    assert len(dados.voluntarios) > 0
    assert len(dados.pares) == 3
    assert dados.pares_cross == [("Gustavo Serafim", "Camilla Serafim")]
    assert len(dados.ministerios) == 2
    assert {m.slug: m.modo for m in dados.ministerios} == {
        MinisterioSlug.TECNICA: ModoEscala.EQUIPE_UNICA,
        MinisterioSlug.BACKSTAGE: ModoEscala.INDEPENDENTE,
    }
    # Novo formato: cada ausência vira uma linha de Indisponibilidade.
    assert len(dados.indisponibilidades) == 48
    assert len(dados.eventos) == 2


def test_carregar_e_validar_cruzado_sem_avisos_data_real() -> None:
    dados, avisos = carregar_e_validar_cruzado(_DATA)
    assert isinstance(dados, DadosCarregados)
    assert avisos == []


def test_unavailability_vazio_ou_so_comentarios(tmp_path: Path) -> None:
    p = tmp_path / "unavailability.yml"
    p.write_text(
        "# apenas comentário\n# outro\n",
        encoding="utf-8",
    )
    (tmp_path / "volunteers.yml").write_text(
        yaml.dump(
            [
                {
                    "nome": "A",
                    "ministerio": "tecnica",
                    "papeis": ["audio"],
                    "treinamento": [],
                    "restricoes": [],
                    "ativo": True,
                }
            ]
        ),
        encoding="utf-8",
    )
    (tmp_path / "events.yml").write_text("[]\n", encoding="utf-8")
    ind = carregar_indisponibilidades(p)
    assert ind == []


def test_indisponibilidade_expande_datas(tmp_path: Path) -> None:
    p = tmp_path / "unavailability.yml"
    p.write_text(
        yaml.dump(
            [
                {
                    "nome": "Fulano",
                    "ausencias": [
                        {"data": "2025-04-06"},
                        {"data": "2025-04-13"},
                    ],
                    "motivo": "Viagem",
                }
            ]
        ),
        encoding="utf-8",
    )
    out = carregar_indisponibilidades(p)
    assert out == [
        Indisponibilidade(nome="Fulano", data="2025-04-06", motivo="Viagem"),
        Indisponibilidade(nome="Fulano", data="2025-04-13", motivo="Viagem"),
    ]


def test_motivo_string_vazia_vira_none(tmp_path: Path) -> None:
    p = tmp_path / "unavailability.yml"
    p.write_text(
        yaml.dump(
            [
                {
                    "nome": "X",
                    "ausencias": [{"data": "2025-04-01"}],
                    "motivo": "",
                }
            ]
        ),
        encoding="utf-8",
    )
    out = carregar_indisponibilidades(p)
    assert out[0].motivo is None


def test_volunteers_mapa_sem_voluntarios(tmp_path: Path) -> None:
    p = tmp_path / "volunteers.yml"
    p.write_text("ministerio: x\n", encoding="utf-8")
    with pytest.raises(ErroCarregamento, match="voluntarios"):
        carregar_voluntarios(p)


def test_rn08_tecnica_com_papel_backstage() -> None:
    v = Voluntario(
        nome="Teste",
        ministerio=MinisterioSlug.TECNICA,
        papeis=[PapelSlug.PALCO],
        treinamento=[],
        restricoes=[],
        ativo=True,
    )
    with pytest.raises(ErroValidacaoCruzada, match="palco"):
        validar_rn08([v])


def test_rn08_backstage_com_papel_tecnica_em_treinamento() -> None:
    v = Voluntario(
        nome="Teste",
        ministerio=MinisterioSlug.BACKSTAGE,
        papeis=[],
        treinamento=[PapelSlug.AUDIO],
        restricoes=[],
        ativo=True,
    )
    with pytest.raises(ErroValidacaoCruzada, match="audio"):
        validar_rn08([v])


def test_rn10_sugestao_nome_via_difflib() -> None:
    canon = "Nome Canônico Um"
    typo = "Nome Canonico Um"
    voluntarios = [
        Voluntario(
            nome=canon,
            ministerio=MinisterioSlug.TECNICA,
            papeis=[PapelSlug.AUDIO],
            treinamento=[],
            restricoes=[],
            ativo=True,
        )
    ]
    ind = [
        Indisponibilidade(nome=typo, data="2025-04-01", motivo=None),
    ]
    avisos = validar_rn10(voluntarios, ind, [])
    assert len(avisos) == 1
    assert canon in avisos[0]
    assert "unavailability.yml" in avisos[0]


def test_rn10_alocacao_fixa_evento() -> None:
    voluntarios = [
        Voluntario(
            nome="Maria",
            ministerio=MinisterioSlug.TECNICA,
            papeis=[PapelSlug.AUDIO],
            treinamento=[],
            restricoes=[],
            ativo=True,
        )
    ]
    ev = Evento(
        nome="Evento X",
        data="2025-04-10",
        horario_inicio="10:00",
        ministerios=[MinisterioSlug.TECNICA],
        alocacoes_fixas=[{"papel": "audio", "membro": "Mari"}],
    )
    avisos = validar_rn10(voluntarios, [], [ev])
    assert len(avisos) == 1
    assert "events.yml" in avisos[0]
    assert "Evento X" in avisos[0]


def test_carregar_e_validar_falha_rn08(tmp_path: Path) -> None:
    vol = {
        "nome": "X",
        "ministerio": "tecnica",
        "papeis": ["palco"],
        "treinamento": [],
        "restricoes": [],
        "ativo": True,
    }
    (tmp_path / "volunteers.yml").write_text(yaml.dump([vol]), encoding="utf-8")
    (tmp_path / "unavailability.yml").write_text("[]\n", encoding="utf-8")
    (tmp_path / "events.yml").write_text("[]\n", encoding="utf-8")
    with pytest.raises(ErroValidacaoCruzada):
        carregar_e_validar_cruzado(tmp_path)
