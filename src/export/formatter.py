from __future__ import annotations

import csv
from datetime import date
from io import StringIO
from pathlib import Path

from ..config.loader import resolver_modos_ministerio
from ..domain.types import (
    MINISTERIOS_ORDEM_ALOCACAO,
    Alocacao,
    CultoGerado,
    MinisterioSlug,
    ModoEscala,
    PapelSlug,
    TipoCulto,
)

_MESES_PT = (
    "",
    "JANEIRO",
    "FEVEREIRO",
    "MARÇO",
    "ABRIL",
    "MAIO",
    "JUNHO",
    "JULHO",
    "AGOSTO",
    "SETEMBRO",
    "OUTUBRO",
    "NOVEMBRO",
    "DEZEMBRO",
)

_DIAS_SEM_ABREV = ("Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom")


def _titulo_periodo(mes: str) -> str:
    """
    Título do período a partir do prefixo ``YYYY-MM`` (mesmo valor de ``--mes``).
    O ano exibido é sempre o da primeira componente do argumento, sem valor fixo.
    """
    partes = mes.strip().split("-")
    if len(partes) < 2:
        return mes.strip()
    ano_s, mes_s = partes[0], partes[1]
    try:
        mi = int(mes_s)
    except ValueError:
        return mes.strip()
    if not 1 <= mi <= 12:
        return mes.strip()
    return f"{_MESES_PT[mi]} {ano_s}"


def _dd_mm(data_iso: str) -> str:
    s = (data_iso or "").strip()
    if len(s) >= 10:
        s = s[:10]
    _, m, d = s.split("-")[:3]
    return f"{int(d):02d}/{int(m):02d}"


def _dia_semana_abrev(data_iso: str) -> str:
    """Abreviatura do dia da semana a partir da data ISO do culto/evento (calendário real)."""
    s = (data_iso or "").strip()
    if len(s) >= 10:
        s = s[:10]
    d = date.fromisoformat(s)
    return _DIAS_SEM_ABREV[d.weekday()]


def _nome_ministerio_titulo(m: MinisterioSlug) -> str:
    return "TÉCNICA" if m is MinisterioSlug.TECNICA else "BACKSTAGE"


def _label_papel(p: PapelSlug) -> str:
    return {
        PapelSlug.AUDIO: "ÁUDIO",
        PapelSlug.PROJECAO: "PROJEÇÃO",
        PapelSlug.ILUMINACAO: "ILUMINAÇÃO",
        PapelSlug.PALCO: "PALCO",
        PapelSlug.TECNICA_BS: "TÉCNICA",
    }[p]


def _papeis_ordem(m: MinisterioSlug) -> list[PapelSlug]:
    if m is MinisterioSlug.TECNICA:
        return [PapelSlug.AUDIO, PapelSlug.PROJECAO, PapelSlug.ILUMINACAO]
    return [PapelSlug.PALCO, PapelSlug.TECNICA_BS]


def _sufixo_alocacao(a: Alocacao) -> str:
    t = ""
    if a.fixada:
        t += " †"
    if a.trainee:
        t += " (*)"
    return t


def _celula(a: Alocacao | None) -> str:
    if a is None:
        return "—"
    return f"{a.membro}{_sufixo_alocacao(a)}"


def _buscar_alocacao(
    culto: CultoGerado, papel: PapelSlug, trainee: bool
) -> Alocacao | None:
    for x in culto.alocacoes:
        if x.papel == papel and x.trainee == trainee:
            return x
    return None


def _filtrar(cultos: list[CultoGerado], m: MinisterioSlug) -> list[CultoGerado]:
    return [c for c in cultos if c.ministerio is m]


def _linha_separadora(largura: int) -> str:
    return "═" * max(largura, 56)


def _pad_esq(s: str, w: int) -> str:
    return s + " " * max(0, w - len(s))


def _gap() -> str:
    return "  "


def _larguras(
    n: int,
    cabecalhos: list[str],
    linhas: list[list[str]],
    min_w: int = 10,
) -> list[int]:
    w = [max(min_w, len(cabecalhos[i])) for i in range(n)]
    for linha in linhas:
        for i in range(n):
            if i < len(linha):
                w[i] = max(w[i], len(linha[i]))
    return w


def _linha_tabela(label: str, label_w: int, cells: list[str], widths: list[int]) -> str:
    partes = [_pad_esq(label, label_w), _gap()]
    for i, texto in enumerate(cells):
        partes.append(texto.ljust(widths[i]))
        partes.append(_gap())
    return "".join(partes).rstrip()


def _formatar_bloco_colunas(
    titulo_secao: str,
    subtitulo: str | None,
    colunas: list[tuple[str, str]],
    papeis: list[PapelSlug],
    cultos_coluna: list[CultoGerado],
    segunda_linha_cabecalho: bool = False,
) -> list[str]:
    """
    ``colunas`` = lista (rótulo curto, segunda linha opcional ex.: dia da semana).
    ``cultos_coluna`` na mesma ordem das colunas de dados.
    """
    linhas: list[str] = []
    linhas.append(titulo_secao)
    if subtitulo:
        linhas.append(subtitulo)
    if not colunas:
        linhas.append("")
        return linhas

    n = len(colunas)
    label_w = max(len(_label_papel(p)) for p in papeis) if papeis else 8
    label_w = max(label_w, 10)

    linhas_dados: list[list[str]] = []
    for papel in papeis:
        prim = []
        for culto in cultos_coluna:
            a = _buscar_alocacao(culto, papel, False)
            prim.append(_celula(a))
        linhas_dados.append(prim)
        tem_trainee = any(
            _buscar_alocacao(culto, papel, True) is not None for culto in cultos_coluna
        )
        if tem_trainee:
            tr = []
            for culto in cultos_coluna:
                t = _buscar_alocacao(culto, papel, True)
                tr.append("" if t is None else _celula(t))
            linhas_dados.append(tr)

    cab1 = [c[0] for c in colunas]
    cab2 = [c[1] for c in colunas] if segunda_linha_cabecalho else None

    extras: list[list[str]] = []
    if cab2 and any(cab2):
        extras.append(cab2)
    widths = _larguras(n, cab1, linhas_dados + extras)

    linhas.append(_linha_tabela("", label_w, cab1, widths))
    if cab2 and any(cab2):
        linhas.append(_linha_tabela("", label_w, cab2, widths))

    offset = 0
    for papel in papeis:
        prim = linhas_dados[offset]
        offset += 1
        linhas.append(_linha_tabela(_label_papel(papel), label_w, prim, widths))
        tem_trainee = any(
            _buscar_alocacao(culto, papel, True) is not None for culto in cultos_coluna
        )
        if tem_trainee:
            tr = linhas_dados[offset]
            offset += 1
            linhas.append(_linha_tabela("", label_w, tr, widths))

    linhas.append("")
    return linhas


def _secao_eventos_especiais(
    label_w: int,
    esp: list[CultoGerado],
    papeis: list[PapelSlug],
) -> list[str]:
    if not esp:
        return []
    nomes = [e.nome.upper() if e.nome else "" for e in esp]
    datas = [f"{_dd_mm(e.data)} {_dia_semana_abrev(e.data)}" for e in esp]
    n = len(esp)
    linhas_vals: list[list[str]] = []
    for papel in papeis:
        prim = [_celula(_buscar_alocacao(c, papel, False)) for c in esp]
        linhas_vals.append(prim)
        if any(_buscar_alocacao(c, papel, True) is not None for c in esp):
            tr = [
                ""
                if _buscar_alocacao(c, papel, True) is None
                else _celula(_buscar_alocacao(c, papel, True))
                for c in esp
            ]
            linhas_vals.append(tr)
    widths = _larguras(n, nomes, linhas_vals + [datas])
    out: list[str] = ["EVENTOS ESPECIAIS"]
    out.append(_linha_tabela("", label_w, nomes, widths))
    out.append(_linha_tabela("", label_w, datas, widths))
    idx = 0
    for papel in papeis:
        out.append(_linha_tabela(_label_papel(papel), label_w, linhas_vals[idx], widths))
        idx += 1
        if any(_buscar_alocacao(c, papel, True) is not None for c in esp):
            out.append(_linha_tabela("", label_w, linhas_vals[idx], widths))
            idx += 1
    out.append("")
    return out


def formatar_escala_txt(
    mes: str,
    ministerio: MinisterioSlug,
    cultos: list[CultoGerado],
    *,
    modos_por_ministerio: dict[MinisterioSlug, ModoEscala] | None = None,
) -> str:
    """
    Gera o conteúdo ``.txt`` de um ministério, no estilo da seção *Formato do Output*.

    ``modos_por_ministerio`` deve refletir ``volunteers.yml`` (RN-01/RN-02): na Técnica,
    ``equipe_unica`` mostra uma grelha (réplica manhã/noite); ``independente`` mostra
    manhã e noite em blocos separados.
    """
    modos = resolver_modos_ministerio(modos_por_ministerio)
    c_all = _filtrar(cultos, ministerio)
    periodo = _titulo_periodo(mes)
    titulo = f"{_nome_ministerio_titulo(ministerio)} — {periodo}"
    out: list[str] = [titulo, _linha_separadora(len(titulo)), ""]

    if ministerio is MinisterioSlug.TECNICA:
        if modos[ministerio] == ModoEscala.EQUIPE_UNICA:
            dom = sorted(
                [c for c in c_all if c.tipo is TipoCulto.DOMINICAL_MANHA],
                key=lambda x: x.data,
            )
            cols = [(_dd_mm(c.data), "") for c in dom]
            out.extend(
                _formatar_bloco_colunas(
                    "CULTO DA MANHÃ (10h) — mesma equipe no culto da noite",
                    None,
                    cols,
                    _papeis_ordem(ministerio),
                    dom,
                    segunda_linha_cabecalho=False,
                )
            )
        else:
            for tipo_c, titulo_bloco, _hora in (
                (TipoCulto.DOMINICAL_MANHA, "CULTO DA MANHÃ (10h)", "10h"),
                (TipoCulto.DOMINICAL_NOITE, "CULTO DA NOITE (18h)", "18h"),
            ):
                dom = sorted(
                    [c for c in c_all if c.tipo is tipo_c],
                    key=lambda x: x.data,
                )
                cols = [(_dd_mm(c.data), "") for c in dom]
                out.extend(
                    _formatar_bloco_colunas(
                        titulo_bloco,
                        None,
                        cols,
                        _papeis_ordem(ministerio),
                        dom,
                        segunda_linha_cabecalho=False,
                    )
                )

        esp = sorted(
            [c for c in c_all if c.tipo is TipoCulto.ESPECIAL],
            key=lambda x: (x.data, x.nome or ""),
        )
        if esp:
            lw = max(len(_label_papel(p)) for p in _papeis_ordem(ministerio))
            lw = max(lw, 10)
            out.extend(_secao_eventos_especiais(lw, esp, _papeis_ordem(ministerio)))
    else:
        for tipo_c, titulo_bloco, hora in (
            (TipoCulto.DOMINICAL_MANHA, "CULTO DA MANHÃ (10h)", "10h"),
            (TipoCulto.DOMINICAL_NOITE, "CULTO DA NOITE (18h)", "18h"),
        ):
            _ = hora
            dom = sorted(
                [c for c in c_all if c.tipo is tipo_c],
                key=lambda x: x.data,
            )
            cols = [(_dd_mm(c.data), "") for c in dom]
            out.extend(
                _formatar_bloco_colunas(
                    titulo_bloco,
                    None,
                    cols,
                    _papeis_ordem(ministerio),
                    dom,
                    segunda_linha_cabecalho=False,
                )
            )

        esp = sorted(
            [c for c in c_all if c.tipo is TipoCulto.ESPECIAL],
            key=lambda x: (x.data, x.nome or ""),
        )
        if esp:
            lw = max(len(_label_papel(p)) for p in _papeis_ordem(ministerio))
            lw = max(lw, 10)
            out.extend(_secao_eventos_especiais(lw, esp, _papeis_ordem(ministerio)))

    out.append("(*) em treinamento    (†) alocação definida pelo líder")
    return "\n".join(out).rstrip() + "\n"


def formatar_escala_csv(mes: str, ministerio: MinisterioSlug, cultos: list[CultoGerado]) -> str:
    """Uma linha por alocação, com colunas estáveis para planilha."""
    buf = StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(
        [
            "ministerio",
            "mes",
            "data_culto",
            "tipo_culto",
            "nome_evento",
            "papel",
            "membro",
            "trainee",
            "fixa",
        ]
    )
    for c in cultos:
        if c.ministerio is not ministerio:
            continue
        for a in c.alocacoes:
            w.writerow(
                [
                    ministerio.value,
                    mes,
                    c.data,
                    c.tipo.value,
                    c.nome or "",
                    _label_papel(a.papel),
                    a.membro,
                    "sim" if a.trainee else "não",
                    "sim" if a.fixada else "não",
                ]
            )
    return buf.getvalue()


def caminho_nao_alocados_mes(diretorio_saida: Path | str, mes: str) -> Path:
    """Caminho ``output/nao-alocados-YYYY-MM.txt`` (RN-15)."""
    return Path(diretorio_saida) / f"nao-alocados-{mes}.txt"


def formatar_nao_alocados_txt(mes: str, itens: list[tuple[str, str]]) -> str:
    """
    Lista de voluntários não alocados com motivo (secção *Formato do Output* / RN-15).
    ``itens`` = (nome, motivo).
    """
    periodo = _titulo_periodo(mes)
    titulo = f"NÃO ALOCADOS — {periodo}"
    linhas: list[str] = [titulo, _linha_separadora(len(titulo)), ""]
    for nome, motivo in sorted(itens, key=lambda x: (x[0].casefold(), x[0])):
        linhas.append(nome)
        linhas.append(f"  {motivo}")
        linhas.append("")
    return "\n".join(linhas).rstrip() + "\n"


def gravar_nao_alocados(
    diretorio_saida: Path | str,
    mes: str,
    itens: list[tuple[str, str]],
) -> Path | None:
    """
    Grava ``nao-alocados-YYYY-MM.txt`` se houver entradas; remove o arquivo se existir
    e a lista estiver vazia (evita arquivo obsoleto).
    """
    base = Path(diretorio_saida)
    base.mkdir(parents=True, exist_ok=True)
    p = caminho_nao_alocados_mes(base, mes)
    if itens:
        p.write_text(formatar_nao_alocados_txt(mes, itens), encoding="utf-8")
        return p
    if p.is_file():
        p.unlink()
    return None


def caminhos_escala_mes(
    diretorio_saida: Path | str,
    mes: str,
    ministerio: MinisterioSlug | None = None,
) -> list[Path]:
    """Caminhos ``.txt`` e ``.csv`` que seriam gravados para o mês (um ou ambos os ministérios)."""
    base = Path(diretorio_saida)
    alvos = (ministerio,) if ministerio is not None else MINISTERIOS_ORDEM_ALOCACAO
    out: list[Path] = []
    for m in alvos:
        stem = f"escala-{mes}-{m.value}"
        out.append(base / f"{stem}.txt")
        out.append(base / f"{stem}.csv")
    return out


def gravar_escalas(
    diretorio_saida: Path | str,
    mes: str,
    cultos: list[CultoGerado],
    *,
    ministerio: MinisterioSlug | None = None,
    modos_por_ministerio: dict[MinisterioSlug, ModoEscala] | None = None,
) -> list[Path]:
    """
    Grava ``escala-{mes}-tecnica.txt|csv`` e/ou ``escala-{mes}-backstage.txt|csv`` em
    ``diretorio_saida``. Se ``ministerio`` for informado, grava apenas esse ministério.
    ``modos_por_ministerio`` alinha o texto ao modo RN-01/RN-02 (Técnica).
    Retorna os caminhos criados.
    """
    base = Path(diretorio_saida)
    base.mkdir(parents=True, exist_ok=True)
    criados: list[Path] = []
    alvos = (ministerio,) if ministerio is not None else MINISTERIOS_ORDEM_ALOCACAO
    for m in alvos:
        stem = f"escala-{mes}-{m.value}"
        p_txt = base / f"{stem}.txt"
        p_csv = base / f"{stem}.csv"
        p_txt.write_text(
            formatar_escala_txt(
                mes, m, cultos, modos_por_ministerio=modos_por_ministerio
            ),
            encoding="utf-8",
        )
        p_csv.write_text(formatar_escala_csv(mes, m, cultos), encoding="utf-8")
        criados.extend([p_txt, p_csv])
    return criados
