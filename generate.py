#!/usr/bin/env python3
"""
Ponto de entrada: carrega YAMLs, gera cultos, aloca e grava escalas em ``output/``.
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import defaultdict
from pathlib import Path

_ROOT = Path(__file__).resolve().parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from src.config.loader import (  # noqa: E402
    ErroCarregamento,
    carregar_e_validar_cruzado,
    resolver_modos_ministerio,
)
from src.config.validator import ErroValidacaoCruzada  # noqa: E402
from src.domain.types import (  # noqa: E402
    CultoGerado,
    MINISTERIOS_ORDEM_ALOCACAO,
    MinisterioSlug,
    TipoCulto,
)
from src.export.formatter import (  # noqa: E402
    caminho_nao_alocados_mes,
    caminhos_escala_mes,
    formatar_escala_txt,
    gravar_escalas,
    gravar_nao_alocados,
)
from src.scheduler.algorithm import alocar_escala  # noqa: E402
from src.scheduler.calendar import gerar_cultos_do_mes  # noqa: E402

_DATA = _ROOT / "data"
_OUTPUT = _ROOT / "output"

_MES_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def _validar_mes(mes: str) -> None:
    if not _MES_RE.match(mes.strip()):
        raise SystemExit(
            "O argumento --mes deve estar no formato YYYY-MM (ex.: 2025-04)."
        )


def _ministerio_slug(s: str | None) -> MinisterioSlug | None:
    if s is None:
        return None
    return MinisterioSlug(s)


def _eventos_do_mes(eventos: list, prefixo_mes: str) -> list:
    return [e for e in eventos if len(e.data) >= 7 and e.data[:7] == prefixo_mes]


def _alertas_mesmo_voluntario_dois_ministerios(
    cultos: list[CultoGerado],
) -> list[str]:
    """Alerta não bloqueante do SPEC: mesma pessoa nos dois ministérios no mesmo culto."""
    grupos: dict[tuple[str, str, str], list[CultoGerado]] = defaultdict(list)
    for c in cultos:
        chave = (c.data, c.tipo.value, c.nome or "")
        grupos[chave].append(c)

    avisos: list[str] = []
    for (_, _, _), lista in grupos.items():
        if len(lista) < 2:
            continue
        por_min: dict[MinisterioSlug, set[str]] = defaultdict(set)
        for c in lista:
            for a in c.alocacoes:
                if a.trainee:
                    continue
                por_min[c.ministerio].add(a.membro)
        tec = por_min.get(MinisterioSlug.TECNICA, set())
        bs = por_min.get(MinisterioSlug.BACKSTAGE, set())
        for nome in tec & bs:
            avisos.append(
                f"O voluntário «{nome}» está alocado em técnica e em backstage no "
                f"mesmo culto ({lista[0].data}, {lista[0].tipo.value}"
                f"{', «' + lista[0].nome + '»' if lista[0].nome else ''})."
            )
    return avisos


def _perguntar_sobrescrever() -> bool:
    try:
        r = input(
            "Já existem arquivos de escala para este mês em output/. "
            "Deseja sobrescrever? [s/N]: "
        ).strip().lower()
    except EOFError:
        return False
    return r in ("s", "sim", "y", "yes")


def _configurar_saida_console() -> None:
    """Evita UnicodeEncodeError no Windows (cp1252) ao imprimir nomes acentuados."""
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, OSError):
        pass


def main() -> None:
    _configurar_saida_console()
    parser = argparse.ArgumentParser(
        description="Gera escalas mensais (técnica e backstage) a partir dos YAML em data/.",
    )
    parser.add_argument(
        "--mes",
        required=True,
        metavar="YYYY-MM",
        help="Mês a gerar (obrigatório), ex.: 2025-04",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Sobrescreve arquivos em output/ sem perguntar.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        dest="dry_run",
        help="Mostra as escalas no console e não grava arquivos.",
    )
    parser.add_argument(
        "--ministerio",
        choices=[m.value for m in MinisterioSlug],
        default=None,
        help="Grava apenas os arquivos deste ministério (.txt e .csv).",
    )
    args = parser.parse_args()

    mes = args.mes.strip()
    _validar_mes(mes)

    ministerio_gravar = _ministerio_slug(args.ministerio)

    try:
        dados, avisos_rn10 = carregar_e_validar_cruzado(_DATA)
    except ErroCarregamento as e:
        print(f"Erro ao carregar dados: {e}", file=sys.stderr)
        raise SystemExit(1) from e
    except ErroValidacaoCruzada as e:
        print(f"Validação: {e}", file=sys.stderr)
        raise SystemExit(1) from e

    eventos_mes = _eventos_do_mes(dados.eventos, mes)

    cultos = gerar_cultos_do_mes(mes, _DATA)

    saida_esperada = caminhos_escala_mes(_OUTPUT, mes, ministerio_gravar) + [
        caminho_nao_alocados_mes(_OUTPUT, mes)
    ]
    if (
        not args.dry_run
        and not args.force
        and any(p.exists() for p in saida_esperada)
    ):
        if not _perguntar_sobrescrever():
            print("Operação cancelada.")
            raise SystemExit(0)

    modos = resolver_modos_ministerio(
        {m.slug: m.modo for m in dados.ministerios},
    )
    cultos_alocados, alertas_algo, nao_alocados = alocar_escala(
        mes,
        dados.voluntarios,
        dados.indisponibilidades,
        eventos_mes,
        cultos,
        pares=dados.pares,
        modos_ministerio=modos,
        pares_cross=dados.pares_cross,
    )

    alertas_dup = _alertas_mesmo_voluntario_dois_ministerios(cultos_alocados)
    todos_avisos = avisos_rn10 + alertas_algo + alertas_dup

    if todos_avisos:
        print("\nAvisos:")
        for a in todos_avisos:
            print(f"  • {a}")
    else:
        print("\nNenhum aviso.")

    if args.dry_run:
        alvos = (
            (ministerio_gravar,)
            if ministerio_gravar is not None
            else MINISTERIOS_ORDEM_ALOCACAO
        )
        for m in alvos:
            print()
            print("=" * 60)
            print(
                formatar_escala_txt(
                    mes,
                    m,
                    cultos_alocados,
                    modos_por_ministerio=modos,
                ),
                end="",
            )
        if nao_alocados:
            print()
            print("=" * 60)
            print("Não alocados (RN-15):")
            for nome, motivo in nao_alocados:
                print(f"  • {nome}")
                print(f"    {motivo}")
        print("\n(modo dry-run: nenhum arquivo foi gravado)")
        raise SystemExit(0)

    criados = gravar_escalas(
        _OUTPUT,
        mes,
        cultos_alocados,
        ministerio=ministerio_gravar,
        modos_por_ministerio=modos,
    )
    p_na = gravar_nao_alocados(_OUTPUT, mes, nao_alocados)
    if p_na is not None:
        criados.append(p_na)
    print("\nArquivos gravados:")
    for p in criados:
        print(f"  • {p}")


if __name__ == "__main__":
    main()
