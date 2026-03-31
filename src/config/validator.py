from __future__ import annotations

import difflib

from ..domain.types import (
    Evento,
    Indisponibilidade,
    MinisterioSlug,
    PapelSlug,
    Voluntario,
)

PAPEIS_TECNICA: frozenset[PapelSlug] = frozenset(
    {PapelSlug.AUDIO, PapelSlug.PROJECAO, PapelSlug.ILUMINACAO}
)
PAPEIS_BACKSTAGE: frozenset[PapelSlug] = frozenset(
    {PapelSlug.PALCO, PapelSlug.TECNICA_BS}
)

_ROTULO_MINISTERIO_PT: dict[MinisterioSlug, str] = {
    MinisterioSlug.TECNICA: MinisterioSlug.TECNICA.value,
    MinisterioSlug.BACKSTAGE: MinisterioSlug.BACKSTAGE.value,
}


class ErroValidacaoCruzada(ValueError):
    """Violação de regra de negócio que impede o uso da configuração (ex.: RN-08)."""


def _papeis_permitidos(ministerio: MinisterioSlug) -> frozenset[PapelSlug]:
    if ministerio is MinisterioSlug.TECNICA:
        return PAPEIS_TECNICA
    return PAPEIS_BACKSTAGE


def validar_rn08(voluntarios: list[Voluntario]) -> None:
    """
    RN-08: voluntários de técnica não podem ter papéis de backstage e vice-versa.
    """
    for v in voluntarios:
        permitidos = _papeis_permitidos(v.ministerio)
        for papel in list(v.papeis) + list(v.treinamento):
            if papel not in permitidos:
                ministerio_pt = _ROTULO_MINISTERIO_PT[v.ministerio]
                outro_slug = (
                    MinisterioSlug.BACKSTAGE
                    if v.ministerio is MinisterioSlug.TECNICA
                    else MinisterioSlug.TECNICA
                )
                outro = _ROTULO_MINISTERIO_PT[outro_slug]
                raise ErroValidacaoCruzada(
                    f"Voluntário «{v.nome}» está no ministério {ministerio_pt}, "
                    f"mas o papel «{papel.value}» só é válido no ministério {outro}."
                )


def _sugestoes_nome(nome: str, candidatos: list[str]) -> list[str]:
    return difflib.get_close_matches(nome, candidatos, n=3, cutoff=0.6)


def _aviso_nome_desconhecido(
    *,
    nome: str,
    origem: str,
    candidatos: list[str],
) -> str:
    sugestoes = _sugestoes_nome(nome, candidatos)
    if sugestoes:
        sug = ", ".join(f"«{s}»" for s in sugestoes)
        return (
            f"O nome «{nome}» em {origem} não coincide com nenhum voluntário em "
            f"volunteers.yml. Você quis dizer: {sug}?"
        )
    return (
        f"O nome «{nome}» em {origem} não coincide com nenhum voluntário em "
        "volunteers.yml. Nenhuma sugestão próxima encontrada."
    )


def validar_rn10(
    voluntarios: list[Voluntario],
    indisponibilidades: list[Indisponibilidade],
    eventos: list[Evento],
) -> list[str]:
    """
    RN-10: nomes em indisponibilidades e alocações fixas devem existir em volunteers.yml.
    Retorna lista de avisos (não interrompe o fluxo).
    """
    candidatos = sorted({v.nome for v in voluntarios})
    avisos: list[str] = []

    for ind in indisponibilidades:
        if ind.nome not in candidatos:
            avisos.append(
                _aviso_nome_desconhecido(
                    nome=ind.nome,
                    origem="unavailability.yml (indisponibilidade)",
                    candidatos=candidatos,
                )
            )

    for ev in eventos:
        if not ev.alocacoes_fixas:
            continue
        for fixa in ev.alocacoes_fixas:
            if fixa.membro not in candidatos:
                avisos.append(
                    _aviso_nome_desconhecido(
                        nome=fixa.membro,
                        origem=f'events.yml (evento «{ev.nome}», alocação fixa)',
                        candidatos=candidatos,
                    )
                )

    return avisos
