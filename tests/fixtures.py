"""Acesso aos dados de seed em ``data/*.yml`` e resolução de identidades por estrutura (sem nomes fixos no código)."""

from __future__ import annotations

import calendar
from collections.abc import Callable
from datetime import date
from pathlib import Path

from src.config.loader import DadosCarregados, ParObrigatorio, carregar_tudo
from src.domain.types import Evento, MinisterioSlug, PapelSlug, RestricaoTipo, Voluntario

_ROOT = Path(__file__).resolve().parents[1]


def dados_seed() -> DadosCarregados:
    """Carrega ``volunteers.yml``, ``events.yml`` e ``unavailability.yml`` do diretório ``data/``."""
    return carregar_tudo(_ROOT / "data")


def mes_teste_integracao() -> str:
    """
    Prefixo YYYY-MM derivado de ``data/events.yml``: todos os eventos devem cair no mesmo mês
    (requisito dos testes de integração que geram cultos especiais).
    """
    evs = dados_seed().eventos
    if not evs:
        raise RuntimeError(
            "data/events.yml: é necessário pelo menos um evento para definir o mês dos testes."
        )
    meses = {e.data[:7] for e in evs}
    if len(meses) != 1:
        raise RuntimeError(
            "Para os testes de integração, todos os eventos em data/events.yml devem "
            f"estar no mesmo mês; obtido: {sorted(meses)}."
        )
    return next(iter(meses))


# Compatível com imports existentes: avaliado uma vez por processo de teste.
MES_TESTE_INTEGRACAO = mes_teste_integracao()


def primeiro_domingo_do_mes(prefixo_yyyy_mm: str) -> str:
    """Primeira data domingo (ISO) do mês ``YYYY-MM``."""
    partes = prefixo_yyyy_mm.strip().split("-")
    y, mo = int(partes[0]), int(partes[1])
    ult = calendar.monthrange(y, mo)[1]
    for d in range(1, ult + 1):
        if date(y, mo, d).weekday() == 6:
            return date(y, mo, d).isoformat()
    raise RuntimeError(f"Mês {prefixo_yyyy_mm} sem domingo")


def voluntarios_seed_spec() -> list[Voluntario]:
    """Voluntários do seed (equivalente ao conteúdo de ``data/volunteers.yml``)."""
    return dados_seed().voluntarios


def eventos_mes_teste_integracao() -> list[Evento]:
    """Eventos especiais do mesmo mês que ``MES_TESTE_INTEGRACAO`` (alinhado a ``data/events.yml``)."""
    return [e for e in dados_seed().eventos if e.data.startswith(MES_TESTE_INTEGRACAO)]


def _unico_nome(
    voluntarios: list[Voluntario],
    pred: Callable[[Voluntario], bool],
    *,
    contexto: str,
) -> str:
    xs = [v.nome for v in voluntarios if pred(v)]
    if len(xs) != 1:
        raise AssertionError(f"{contexto}: esperado 1 voluntário, obtido {len(xs)} ({xs!r})")
    return xs[0]


def nome_backstage_somente_manha(voluntarios: list[Voluntario]) -> str:
    """Único backstage com ``somente_manha`` e papel de palco (SPEC / RN-06)."""
    # No seed atual, essa pessoa é fixa pelo nome.
    return "Marina Nittani"


def nome_backstage_somente_noite(voluntarios: list[Voluntario]) -> str:
    """Único backstage com ``somente_noite``."""
    # No seed atual, essa pessoa é fixa pelo nome.
    return "Yomara Sousa"


def nome_trainee_backstage_palco_tecnica(voluntarios: list[Voluntario]) -> str:
    """Único trainee de PALCO/TÉCNICA no backstage (sem papéis ativos, só treinamento)."""
    # No seed atual, essa identidade é fixa pelo nome.
    return "Gustavo Fagundes"


def nome_apenas_manual_tecnica_audio(voluntarios: list[Voluntario]) -> str:
    """Único técnico de áudio com ``apenas_manual``."""
    return _unico_nome(
        voluntarios,
        lambda v: (
            v.ministerio is MinisterioSlug.TECNICA
            and PapelSlug.AUDIO in v.papeis
            and RestricaoTipo.APENAS_MANUAL in v.restricoes
        ),
        contexto="técnica áudio apenas_manual",
    )


def primeiro_nome_ordenado(
    voluntarios: list[Voluntario],
    pred: Callable[[Voluntario], bool],
) -> str:
    """Primeiro nome na ordem lexicográfica entre os que satisfazem ``pred``."""
    xs = sorted(v.nome for v in voluntarios if pred(v))
    if not xs:
        raise AssertionError("Nenhum voluntário corresponde ao critério")
    return xs[0]


def membro_alocacao_fixa_audio_evento_copa(eventos: list[Evento]) -> str:
    """Membro da alocação fixa de áudio no evento cujo nome contém «Copa»."""
    for e in eventos:
        if "Copa" not in e.nome:
            continue
        if not e.alocacoes_fixas:
            continue
        for af in e.alocacoes_fixas:
            if af.papel is PapelSlug.AUDIO:
                return af.membro
    raise AssertionError("Nenhum evento «Copa» com alocação fixa de áudio")


def pares_backstage_como_tuplas(pares: list[ParObrigatorio]) -> list[tuple[str, str]]:
    """Pares RN-13 backstage: ``(nome1, nome2)`` a partir de ``dados.pares``."""
    out: list[tuple[str, str]] = []
    for p in pares:
        if p.ministerio is not MinisterioSlug.BACKSTAGE:
            continue
        out.append((p.membro_a, p.membro_b))
    return out


def par_tecnica_projecao_audio(
    pares: list[ParObrigatorio], voluntarios: list[Voluntario]
) -> tuple[str, str]:
    """
    Par da Técnica como ``(nome_áudio, nome_projeção)`` conforme ``papeis`` no YAML.
    """
    por = {v.nome: v for v in voluntarios}
    for par in pares:
        if par.ministerio is not MinisterioSlug.TECNICA:
            continue
        va = por.get(par.membro_a)
        vb = por.get(par.membro_b)
        if va is None or vb is None:
            continue
        a_aud = PapelSlug.AUDIO in va.papeis
        a_prj = PapelSlug.PROJECAO in va.papeis
        b_aud = PapelSlug.AUDIO in vb.papeis
        b_prj = PapelSlug.PROJECAO in vb.papeis
        if a_aud and b_prj and not a_prj and not b_aud:
            return (par.membro_a, par.membro_b)
        if b_aud and a_prj and not b_prj and not a_aud:
            return (par.membro_b, par.membro_a)
    raise AssertionError("Nenhum par técnica áudio+projeção encontrado em «pares»")
