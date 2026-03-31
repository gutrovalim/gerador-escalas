from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel


class MinisterioSlug(StrEnum):
    BACKSTAGE = "backstage"
    TECNICA = "tecnica"


# Ordem estável: Técnica primeiro (carga RN-05 / saída), depois Backstage.
MINISTERIOS_ORDEM_ALOCACAO: tuple[MinisterioSlug, ...] = (
    MinisterioSlug.TECNICA,
    MinisterioSlug.BACKSTAGE,
)


class ModoEscala(StrEnum):
    """Como manhã e noite dominicais são tratados (RN-01 / RN-02)."""

    EQUIPE_UNICA = "equipe_unica"
    INDEPENDENTE = "independente"


class ConfigMinisterio(BaseModel):
    slug: MinisterioSlug
    modo: ModoEscala


class PapelSlug(StrEnum):
    PALCO = "palco"
    TECNICA_BS = "tecnica_bs"
    AUDIO = "audio"
    PROJECAO = "projecao"
    ILUMINACAO = "iluminacao"


class RestricaoTipo(StrEnum):
    SOMENTE_MANHA = "somente_manha"
    SOMENTE_NOITE = "somente_noite"
    APENAS_MANUAL = "apenas_manual"


class TipoCulto(StrEnum):
    DOMINICAL_MANHA = "dominical_manha"
    DOMINICAL_NOITE = "dominical_noite"
    ESPECIAL = "especial"


class Voluntario(BaseModel):
    nome: str
    ministerio: MinisterioSlug
    papeis: list[PapelSlug]
    treinamento: list[PapelSlug]
    restricoes: list[RestricaoTipo]
    ativo: bool


class Indisponibilidade(BaseModel):
    nome: str
    data: str
    motivo: str | None = None
    # Lista de turnos bloqueados em cultos dominicais; None = dia inteiro.
    # Valores esperados (SPEC): "manha", "noite".
    turnos: list[str] | None = None


class AlocacaoFixa(BaseModel):
    papel: PapelSlug
    membro: str


class Evento(BaseModel):
    nome: str
    data: str
    horario_inicio: str
    horario_fim: str | None = None
    ministerios: list[MinisterioSlug]
    papeis: list[PapelSlug] | None = None
    alocacoes_fixas: list[AlocacaoFixa] | None = None
    pessoa_unica: bool | None = False


class Alocacao(BaseModel):
    membro: str
    papel: PapelSlug
    trainee: bool
    fixada: bool


class CultoGerado(BaseModel):
    data: str
    tipo: TipoCulto
    nome: str | None = None
    ministerio: MinisterioSlug
    alocacoes: list[Alocacao]
