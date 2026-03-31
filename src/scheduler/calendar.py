from __future__ import annotations

import calendar
from datetime import date
from pathlib import Path

from ..config.loader import carregar_eventos
from ..domain.types import (
    CultoGerado,
    Evento,
    MINISTERIOS_ORDEM_ALOCACAO,
    MinisterioSlug,
    TipoCulto,
)


def _parse_mes(mes: str) -> tuple[int, int]:
    partes = mes.strip().split("-")
    if len(partes) != 2:
        raise ValueError(
            f"Formato de mês inválido «{mes}»: use YYYY-MM (ex.: 2025-04)."
        )
    try:
        ano = int(partes[0])
        mes_num = int(partes[1])
    except ValueError as e:
        raise ValueError(
            f"Formato de mês inválido «{mes}»: ano e mês devem ser numéricos."
        ) from e
    if not 1 <= mes_num <= 12:
        raise ValueError(f"Mês inválido em «{mes}»: o mês deve estar entre 01 e 12.")
    if ano < 1:
        raise ValueError(f"Ano inválido em «{mes}»: {ano}.")
    return ano, mes_num


def _domingos_do_mes(ano: int, mes: int) -> list[date]:
    _, ultimo_dia = calendar.monthrange(ano, mes)
    domingos: list[date] = []
    for dia in range(1, ultimo_dia + 1):
        d = date(ano, mes, dia)
        if d.weekday() == 6:
            domingos.append(d)
    return domingos


def _evento_no_mes(ev: Evento, prefixo_mes: str) -> bool:
    return len(ev.data) >= 7 and ev.data[:7] == prefixo_mes


def _culto_vazio(
    *,
    data_iso: str,
    tipo: TipoCulto,
    ministerio: MinisterioSlug,
    nome: str | None = None,
) -> CultoGerado:
    return CultoGerado(
        data=data_iso,
        tipo=tipo,
        nome=nome,
        ministerio=ministerio,
        alocacoes=[],
    )


def _tipo_ordem(tipo: TipoCulto) -> int:
    if tipo is TipoCulto.DOMINICAL_MANHA:
        return 0
    if tipo is TipoCulto.DOMINICAL_NOITE:
        return 1
    return 2


def _ministerio_ordem(ministerio: MinisterioSlug) -> int:
    return MINISTERIOS_ORDEM_ALOCACAO.index(ministerio)


def _ordenar_cultos(itens: list[CultoGerado]) -> list[CultoGerado]:
    return sorted(
        itens,
        key=lambda c: (c.data, _tipo_ordem(c.tipo), _ministerio_ordem(c.ministerio)),
    )


def gerar_cultos_do_mes(
    mes: str,
    diretorio_dados: Path | str = Path("data"),
) -> list[CultoGerado]:
    """
    Monta a lista de cultos do mês (YYYY-MM): para cada domingo, pares
    ``dominical_manha`` e ``dominical_noite`` por ministério (técnica e backstage);
    inclui eventos especiais de ``events.yml`` cuja data cai no mesmo mês.

    Eventos são lidos de ``{diretorio_dados}/events.yml``.
    Alocações ficam vazias; o agendador preenche depois.
    """
    ano, mes_num = _parse_mes(mes)
    prefixo = f"{ano:04d}-{mes_num:02d}"

    base = Path(diretorio_dados)
    eventos_arquivo = carregar_eventos(base / "events.yml")
    eventos_mes = [e for e in eventos_arquivo if _evento_no_mes(e, prefixo)]

    resultado: list[CultoGerado] = []

    for dom in _domingos_do_mes(ano, mes_num):
        data_iso = dom.isoformat()
        for ministerio in MINISTERIOS_ORDEM_ALOCACAO:
            resultado.append(
                _culto_vazio(
                    data_iso=data_iso,
                    tipo=TipoCulto.DOMINICAL_MANHA,
                    ministerio=ministerio,
                )
            )
            resultado.append(
                _culto_vazio(
                    data_iso=data_iso,
                    tipo=TipoCulto.DOMINICAL_NOITE,
                    ministerio=ministerio,
                )
            )

    for ev in eventos_mes:
        for ministerio in ev.ministerios:
            resultado.append(
                _culto_vazio(
                    data_iso=ev.data,
                    tipo=TipoCulto.ESPECIAL,
                    ministerio=ministerio,
                    nome=ev.nome,
                )
            )

    return _ordenar_cultos(resultado)
