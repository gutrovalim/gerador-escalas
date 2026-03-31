from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, ValidationError, field_validator

from ..domain.types import (
    ConfigMinisterio,
    Evento,
    Indisponibilidade,
    MinisterioSlug,
    ModoEscala,
    RestricaoTipo,
    Voluntario,
)
from .validator import validar_rn08, validar_rn10


class ErroCarregamento(ValueError):
    """Falha ao ler ou validar estrutura dos arquivos YAML."""


@dataclass(frozen=True)
class ParObrigatorio:
    """Par da seção ``pares`` em ``volunteers.yml`` (RN-13)."""

    membro_a: str
    membro_b: str
    ministerio: MinisterioSlug


def modos_ministerio_padrao() -> dict[MinisterioSlug, ModoEscala]:
    """RN-01/RN-02: valores usados quando «ministerios» está ausente no YAML."""
    return {
        MinisterioSlug.TECNICA: ModoEscala.EQUIPE_UNICA,
        MinisterioSlug.BACKSTAGE: ModoEscala.INDEPENDENTE,
    }


def resolver_modos_ministerio(
    modos: dict[MinisterioSlug, ModoEscala] | None,
) -> dict[MinisterioSlug, ModoEscala]:
    """
    Mescla modos vindos do YAML (ou de testes) com :func:`modos_ministerio_padrao`,
    para que chaves em falta não deixem o agendador a usar só o padrão global.
    """
    base = dict(modos_ministerio_padrao())
    if not modos:
        return base
    return {**base, **modos}


def _parse_ministerios_yaml(raw: Any, caminho: str) -> list[ConfigMinisterio]:
    """
    Seção ``ministerios`` em ``volunteers.yml``: um item por ministério com ``slug`` e ``modo``.
    Se a seção for omitida, aplicam-se os modos padrão.
    """
    modos = dict(modos_ministerio_padrao())
    if raw is None:
        return [ConfigMinisterio(slug=s, modo=modos[s]) for s in MinisterioSlug]
    if not isinstance(raw, list):
        raise ErroCarregamento(
            f"O campo «ministerios» em {caminho} deve ser uma lista de {{slug, modo}}."
        )
    vistos: set[MinisterioSlug] = set()
    for i, item in enumerate(raw):
        if not isinstance(item, dict):
            raise ErroCarregamento(
                f"{caminho}, ministerios item {i + 1}: esperado um mapa com «slug» e «modo»."
            )
        slug_raw = item.get("slug")
        modo_raw = item.get("modo")
        if slug_raw is None or modo_raw is None:
            raise ErroCarregamento(
                f"{caminho}, ministerios item {i + 1}: «slug» e «modo» são obrigatórios."
            )
        try:
            slug = MinisterioSlug(str(slug_raw).strip())
        except ValueError as e:
            raise ErroCarregamento(
                f"{caminho}, ministerios item {i + 1}: «slug» inválido: {slug_raw!r}."
            ) from e
        if slug in vistos:
            raise ErroCarregamento(
                f"{caminho}: «ministerios» declara «{slug.value}» mais de uma vez."
            )
        vistos.add(slug)
        try:
            modo = ModoEscala(str(modo_raw).strip())
        except ValueError as e:
            raise ErroCarregamento(
                f"{caminho}, ministerios item {i + 1}: «modo» inválido: {modo_raw!r} "
                "(use equipe_unica ou independente)."
            ) from e
        modos[slug] = modo
    return [ConfigMinisterio(slug=s, modo=modos[s]) for s in MinisterioSlug]


@dataclass(frozen=True)
class DadosCarregados:
    voluntarios: list[Voluntario]
    pares: list[ParObrigatorio]
    pares_cross: list[tuple[str, str]]
    ministerios: list[ConfigMinisterio]
    indisponibilidades: list[Indisponibilidade]
    eventos: list[Evento]


class _AusenciaYAML(BaseModel):
    data: str
    turnos: list[str] | None = None


class _LinhaIndisponibilidadeYAML(BaseModel):
    nome: str
    ausencias: list[_AusenciaYAML]
    motivo: str | None = None

    @field_validator("motivo", mode="before")
    @classmethod
    def motivo_vazio_para_none(cls, v: Any) -> Any:
        if v == "":
            return None
        return v


def _formatar_erro_pydantic(exc: ValidationError, contexto: str) -> str:
    partes: list[str] = [f"Erro de validação em {contexto}:"]
    for err in exc.errors():
        loc = " → ".join(str(x) for x in err.get("loc", ()) if x != "__root__")
        tipo = err.get("type", "")
        if tipo == "missing":
            partes.append(f"  • Campo obrigatório ausente{f' ({loc})' if loc else ''}.")
        elif tipo in ("enum", "literal_error"):
            entrada = err.get("input")
            partes.append(
                f"  • Valor inválido{f' em {loc}' if loc else ''}: {entrada!r}."
            )
        elif tipo == "list_type":
            partes.append(f"  • Era esperada uma lista{f' em {loc}' if loc else ''}.")
        elif tipo == "string_type":
            partes.append(
                f"  • Era esperado texto (string){f' em {loc}' if loc else ''}."
            )
        elif tipo == "model_type":
            partes.append(f"  • Tipo de dado incompatível{f' em {loc}' if loc else ''}.")
        else:
            msg = err.get("msg", "")
            partes.append(f"  • {msg}{f' ({loc})' if loc else ''}.")
    return "\n".join(partes)


def _normalizar_yaml(obj: Any) -> Any:
    """Converte date/datetime do PyYAML em strings ISO, recursivamente."""
    if isinstance(obj, datetime):
        return obj.date().isoformat()
    if isinstance(obj, date):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {k: _normalizar_yaml(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_normalizar_yaml(x) for x in obj]
    return obj


def _carregar_yaml(caminho: Path) -> Any:
    if not caminho.is_file():
        raise ErroCarregamento(f"Arquivo não encontrado: {caminho}")
    texto = caminho.read_text(encoding="utf-8")
    try:
        carregado = yaml.safe_load(texto)
    except yaml.YAMLError as e:
        raise ErroCarregamento(f"YAML inválido em {caminho.name}: {e}") from e
    return _normalizar_yaml(carregado)


def _exigir_lista(raw: Any, nome_arquivo: str) -> list[Any]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ErroCarregamento(
            f"O arquivo {nome_arquivo} deve conter uma lista na raiz (ou estar vazio)."
        )
    return raw


def _parse_pares_cross(raw: Any, caminho: str) -> list[tuple[str, str]]:
    """Pares entre ministérios distintos (RN-17); formato análogo a ``pares``, sem ``ministerio``."""
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ErroCarregamento(
            f"O campo «pares_cross» em {caminho} deve ser uma lista de pares."
        )
    out: list[tuple[str, str]] = []
    for i, item in enumerate(raw):
        if isinstance(item, dict):
            membros = item.get("membros")
            if not isinstance(membros, (list, tuple)) or len(membros) != 2:
                raise ErroCarregamento(
                    f"{caminho}, pares_cross item {i + 1}: "
                    "«membros» deve ser uma lista com exatamente dois nomes."
                )
            a, b = str(membros[0]).strip(), str(membros[1]).strip()
        elif isinstance(item, (list, tuple)) and len(item) == 2:
            a, b = str(item[0]).strip(), str(item[1]).strip()
        else:
            raise ErroCarregamento(
                f"{caminho}, pares_cross item {i + 1}: use [nome1, nome2] ou "
                "{{ membros: [nome1, nome2] }}."
            )
        if not a or not b:
            raise ErroCarregamento(
                f"{caminho}, pares_cross item {i + 1}: os nomes não podem ser vazios."
            )
        out.append((a, b))
    return out


def _parse_pares(raw: Any, caminho: str) -> list[ParObrigatorio]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ErroCarregamento(
            f"O campo «pares» em {caminho} deve ser uma lista de pares."
        )
    pares: list[ParObrigatorio] = []
    for i, item in enumerate(raw):
        ministerio = MinisterioSlug.BACKSTAGE
        if isinstance(item, dict):
            membros = item.get("membros")
            min_raw = item.get("ministerio")
            if not isinstance(membros, (list, tuple)) or len(membros) != 2:
                raise ErroCarregamento(
                    f"{caminho}, par {i + 1}: «membros» deve ser uma lista com exatamente dois nomes."
                )
            if min_raw is None:
                raise ErroCarregamento(
                    f"{caminho}, par {i + 1}: «ministerio» é obrigatório (backstage ou tecnica)."
                )
            try:
                ministerio = MinisterioSlug(str(min_raw).strip())
            except ValueError as e:
                raise ErroCarregamento(
                    f"{caminho}, par {i + 1}: «ministerio» inválido: {min_raw!r}."
                ) from e
            a, b = str(membros[0]).strip(), str(membros[1]).strip()
        elif isinstance(item, (list, tuple)) and len(item) == 2:
            a, b = str(item[0]).strip(), str(item[1]).strip()
        else:
            raise ErroCarregamento(
                f"{caminho}, par {i + 1}: use [nome1, nome2] ou "
                "{{ membros: [nome1, nome2], ministerio: backstage|tecnica }}."
            )
        if not a or not b:
            raise ErroCarregamento(
                f"{caminho}, par {i + 1}: os nomes não podem ser vazios."
            )
        pares.append(ParObrigatorio(membro_a=a, membro_b=b, ministerio=ministerio))
    return pares


def carregar_voluntarios_e_pares(
    caminho: Path,
) -> tuple[list[Voluntario], list[ParObrigatorio], list[tuple[str, str]], list[ConfigMinisterio]]:
    """
    Lê ``volunteers.yml``: formato novo com ``ministerios``, ``pares`` + ``voluntarios``, ou lista legada só de voluntários.

    Restrições de período (RN-06) aceitas em ``restricoes``: ``somente_manha``,
    ``somente_noite``, ``apenas_manual`` (não combinar manhã e noite no mesmo voluntário).
    """
    raw = _carregar_yaml(caminho)
    pares_cross: list[tuple[str, str]] = []
    ministerios_cfg: list[ConfigMinisterio] = []
    if isinstance(raw, dict):
        ministerios_cfg = _parse_ministerios_yaml(raw.get("ministerios"), caminho.name)
        pares_cross = _parse_pares_cross(raw.get("pares_cross"), caminho.name)
        pares = _parse_pares(raw.get("pares"), caminho.name)
        itens = raw.get("voluntarios")
        if itens is None:
            raise ErroCarregamento(
                f"{caminho.name}: com formato de mapa, a chave «voluntarios» é obrigatória."
            )
        if not isinstance(itens, list):
            raise ErroCarregamento(
                f"{caminho.name}: «voluntarios» deve ser uma lista."
            )
    elif isinstance(raw, list):
        itens = raw
        ministerios_cfg = _parse_ministerios_yaml(None, caminho.name)
        pares = []
        pares_cross = []
    else:
        raise ErroCarregamento(
            f"{caminho.name}: a raiz deve ser uma lista de voluntários ou um mapa com «pares» e «voluntarios»."
        )

    resultado: list[Voluntario] = []
    for i, item in enumerate(itens):
        try:
            resultado.append(Voluntario.model_validate(item))
        except ValidationError as e:
            raise ErroCarregamento(
                _formatar_erro_pydantic(e, f"{caminho.name}, item {i + 1}")
            ) from e
    for i, v in enumerate(resultado, start=1):
        if (
            RestricaoTipo.SOMENTE_MANHA in v.restricoes
            and RestricaoTipo.SOMENTE_NOITE in v.restricoes
        ):
            raise ErroCarregamento(
                f"{caminho.name}, item {i} («{v.nome}»): "
                "«somente_manha» e «somente_noite» não podem ser usadas juntas (RN-06)."
            )
    return resultado, pares, pares_cross, ministerios_cfg


def carregar_voluntarios(caminho: Path) -> list[Voluntario]:
    v, _, _, _ = carregar_voluntarios_e_pares(caminho)
    return v


def carregar_indisponibilidades(caminho: Path) -> list[Indisponibilidade]:
    raw = _carregar_yaml(caminho)
    itens = _exigir_lista(raw, caminho.name)
    resultado: list[Indisponibilidade] = []
    for i, item in enumerate(itens):
        try:
            linha = _LinhaIndisponibilidadeYAML.model_validate(item)
        except ValidationError as e:
            raise ErroCarregamento(
                _formatar_erro_pydantic(e, f"{caminho.name}, item {i + 1}")
            ) from e
        for aus in linha.ausencias:
            resultado.append(
                Indisponibilidade(
                    nome=linha.nome,
                    data=aus.data,
                    motivo=linha.motivo,
                    turnos=aus.turnos,
                )
            )
    return resultado


def carregar_eventos(caminho: Path) -> list[Evento]:
    raw = _carregar_yaml(caminho)
    itens = _exigir_lista(raw, caminho.name)
    resultado: list[Evento] = []
    for i, item in enumerate(itens):
        try:
            resultado.append(Evento.model_validate(item))
        except ValidationError as e:
            raise ErroCarregamento(
                _formatar_erro_pydantic(e, f"{caminho.name}, item {i + 1}")
            ) from e
    return resultado


def carregar_tudo(diretorio_dados: Path | str) -> DadosCarregados:
    base = Path(diretorio_dados)
    vols, pares, pares_cross, ministerios = carregar_voluntarios_e_pares(
        base / "volunteers.yml"
    )
    return DadosCarregados(
        voluntarios=vols,
        pares=pares,
        pares_cross=pares_cross,
        ministerios=ministerios,
        indisponibilidades=carregar_indisponibilidades(base / "unavailability.yml"),
        eventos=carregar_eventos(base / "events.yml"),
    )


def carregar_e_validar_cruzado(diretorio_dados: Path | str) -> tuple[DadosCarregados, list[str]]:
    """
    Carrega os três YAML, valida estrutura (Pydantic) e aplica RN-08 (erro) e RN-10 (avisos).
    """
    dados = carregar_tudo(diretorio_dados)
    validar_rn08(dados.voluntarios)
    avisos = validar_rn10(
        dados.voluntarios,
        dados.indisponibilidades,
        dados.eventos,
    )
    return dados, avisos
