from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Iterable

from ..config.loader import ParObrigatorio, resolver_modos_ministerio
from ..config.validator import PAPEIS_BACKSTAGE, PAPEIS_TECNICA
from ..domain.types import (
    MINISTERIOS_ORDEM_ALOCACAO,
    Alocacao,
    CultoGerado,
    Evento,
    Indisponibilidade,
    MinisterioSlug,
    ModoEscala,
    PapelSlug,
    RestricaoTipo,
    TipoCulto,
    Voluntario,
)

# Tipo da chave de culto em preferências RN-17: (data ISO, ``TipoCulto.value``).
_Rn17Pref = tuple[str, str]


def _antes_de_meio_dia(horario_inicio: str) -> bool:
    partes = horario_inicio.strip().split(":")
    h = int(partes[0])
    m = int(partes[1]) if len(partes) > 1 else 0
    return (h, m) < (12, 0)


def _papeis_padrao(m: MinisterioSlug) -> list[PapelSlug]:
    if m is MinisterioSlug.TECNICA:
        return [PapelSlug.AUDIO, PapelSlug.PROJECAO, PapelSlug.ILUMINACAO]
    return [PapelSlug.PALCO, PapelSlug.TECNICA_BS]


def _evento_especial(
    eventos_mes: list[Evento], culto: CultoGerado
) -> Evento | None:
    if culto.tipo is not TipoCulto.ESPECIAL or culto.nome is None:
        return None
    for ev in eventos_mes:
        if ev.data == culto.data and ev.nome == culto.nome:
            return ev
    return None


def papeis_exigidos(culto: CultoGerado, evento: Evento | None) -> list[PapelSlug]:
    """RN-09 e papéis padrão nos cultos dominicais."""
    if culto.tipo is not TipoCulto.ESPECIAL:
        return _papeis_padrao(culto.ministerio)
    assert evento is not None
    permitidos = (
        PAPEIS_TECNICA if culto.ministerio is MinisterioSlug.TECNICA else PAPEIS_BACKSTAGE
    )
    if evento.papeis is not None:
        return [p for p in evento.papeis if p in permitidos]
    return _papeis_padrao(culto.ministerio)


def _apenas_manual(v: Voluntario) -> bool:
    return RestricaoTipo.APENAS_MANUAL in v.restricoes


def _vol_por_nome(voluntarios: list[Voluntario]) -> dict[str, Voluntario]:
    return {v.nome: v for v in voluntarios}


def _mapa_pares(pares: list[tuple[str, str]]) -> dict[str, str]:
    m: dict[str, str] = {}
    for a, b in pares:
        m[a] = b
        m[b] = a
    return m


def _pares_backstage_tuplas(pares: list[ParObrigatorio]) -> list[tuple[str, str]]:
    return [
        (p.membro_a, p.membro_b)
        for p in pares
        if p.ministerio is MinisterioSlug.BACKSTAGE
    ]


def _pares_tecnica_audio_projecao(
    pares: list[ParObrigatorio],
    por_nome: dict[str, Voluntario],
) -> list[tuple[str, str]]:
    """
    Pares RN-13 da Técnica: (nome_áudio, nome_projeção) conforme ``papeis`` dos voluntários.
    """
    out: list[tuple[str, str]] = []
    for par in pares:
        if par.ministerio is not MinisterioSlug.TECNICA:
            continue
        va = por_nome.get(par.membro_a)
        vb = por_nome.get(par.membro_b)
        if va is None or vb is None:
            continue
        a_aud = PapelSlug.AUDIO in va.papeis
        a_prj = PapelSlug.PROJECAO in va.papeis
        b_aud = PapelSlug.AUDIO in vb.papeis
        b_prj = PapelSlug.PROJECAO in vb.papeis
        if a_aud and b_prj and not a_prj and not b_aud:
            out.append((par.membro_a, par.membro_b))
        elif b_aud and a_prj and not b_prj and not a_aud:
            out.append((par.membro_b, par.membro_a))
    return out


@dataclass
class _Estado:
    bloqueios: set[tuple[str, str]]
    indisponibilidades: list[Indisponibilidade] = field(default_factory=list)
    contagem_ativa: dict[tuple[str, PapelSlug], int] = field(
        default_factory=lambda: defaultdict(int)
    )
    contagem_30d: dict[tuple[str, PapelSlug], int] = field(
        default_factory=lambda: defaultdict(int)
    )
    participacao_mes: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    trainee_mes: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    trainee_por_papel: dict[tuple[str, PapelSlug], int] = field(
        default_factory=lambda: defaultdict(int)
    )
    trainee_ultima_data: dict[str, str | None] = field(
        default_factory=lambda: defaultdict(lambda: None)
    )
    alertas: list[str] = field(default_factory=list)
    # RN-17: cultos preferidos para o parceiro (outro ministério) após alocar um lado.
    preferencial_rn17: dict[str, set[_Rn17Pref]] = field(default_factory=dict)

    def bloqueado(
        self,
        nome: str,
        data: str,
        tipo: TipoCulto | None = None,
        ev: Evento | None = None,
    ) -> bool:
        """
        RN-04 com suporte a turnos (SPEC unavailability.yml):

        - Sem ``tipo``: usa ``bloqueios`` (dia inteiro) — para RN-15 e chamadas legadas.
        - Com ``tipo`` dominical: respeita ``turnos`` ("manha"/"noite"); ausência sem
          ``turnos`` bloqueia o dia inteiro.
        - Para eventos especiais, qualquer ausência na data bloqueia o voluntário.
        """
        if tipo is None:
            return (nome, data) in self.bloqueios

        for ind in self.indisponibilidades:
            if ind.nome != nome or ind.data != data:
                continue
            if tipo is TipoCulto.ESPECIAL:
                return True
            turnos = ind.turnos or ["manha", "noite"]
            if tipo is TipoCulto.DOMINICAL_MANHA and "manha" in turnos:
                return True
            if tipo is TipoCulto.DOMINICAL_NOITE and "noite" in turnos:
                return True
        return False


def _bloqueios(ind: list[Indisponibilidade]) -> set[tuple[str, str]]:
    """
    Conjunto (nome, data) para bloqueios de dia inteiro — usado por RN-15.

    Dia inteiro = ausência sem ``turnos`` ou com ambos os turnos declarados.
    """
    out: set[tuple[str, str]] = set()
    for x in ind:
        turnos = set(x.turnos or ["manha", "noite"])
        if "manha" in turnos and "noite" in turnos:
            out.add((x.nome, x.data))
    return out


def _slot_eh_manha_rn06(culto: CultoGerado, ev: Evento | None) -> bool:
    """Define se o slot segue regras de «manhã» para priorização RN-06."""
    if culto.tipo is TipoCulto.DOMINICAL_MANHA:
        return True
    if culto.tipo is TipoCulto.DOMINICAL_NOITE:
        return False
    if culto.tipo is TipoCulto.ESPECIAL:
        if ev is None:
            return True
        return _antes_de_meio_dia(ev.horario_inicio)
    return True


def _prioridade_rn06_empate(culto: CultoGerado, ev: Evento | None, v: Voluntario) -> int:
    """
    RN-06 — desempate após participações no mês (RN-05): menor valor = mais prioridade.
    Manhã: ``somente_manha`` → 0, sem restrição de período → 1.
    Noite: ``somente_noite`` → 0, caso contrário → 1.
    """
    sm = RestricaoTipo.SOMENTE_MANHA in v.restricoes
    sn = RestricaoTipo.SOMENTE_NOITE in v.restricoes
    if _slot_eh_manha_rn06(culto, ev):
        return 0 if sm else 1
    return 0 if sn else 1


def _rn06_ok(v: Voluntario, culto: CultoGerado, ev: Evento | None) -> bool:
    """RN-06: ``somente_manha`` / ``somente_noite`` e horário em eventos especiais."""
    sm = RestricaoTipo.SOMENTE_MANHA in v.restricoes
    sn = RestricaoTipo.SOMENTE_NOITE in v.restricoes
    if sm and sn:
        return False
    if not sm and not sn:
        return True
    if culto.tipo is TipoCulto.DOMINICAL_MANHA:
        return sm
    if culto.tipo is TipoCulto.DOMINICAL_NOITE:
        return sn
    if culto.tipo is TipoCulto.ESPECIAL and ev is not None:
        antes = _antes_de_meio_dia(ev.horario_inicio)
        return antes if sm else not antes
    return False


def _elegivel_auto(v: Voluntario) -> bool:
    return v.ativo and not _apenas_manual(v)


def _primario_ok(
    v: Voluntario,
    papel: PapelSlug,
    culto: CultoGerado,
    data: str,
    ev: Evento | None,
    est: _Estado,
    exigir_auto: bool = True,
) -> bool:
    if v.ministerio is not culto.ministerio:
        return False
    if exigir_auto and not _elegivel_auto(v):
        return False
    if not exigir_auto and not v.ativo:
        return False
    if papel not in v.papeis:
        return False
    if est.bloqueado(v.nome, data, culto.tipo, ev):
        return False
    return _rn06_ok(v, culto, ev)


def _trainee_ok(
    v: Voluntario,
    papel: PapelSlug,
    culto: CultoGerado,
    data: str,
    ev: Evento | None,
    est: _Estado,
) -> bool:
    if culto.tipo is TipoCulto.ESPECIAL:
        return False
    if not _elegivel_auto(v):
        return False
    if v.ministerio is not culto.ministerio:
        return False
    if papel not in v.treinamento:
        return False
    if est.bloqueado(v.nome, data, culto.tipo, ev):
        return False
    return _rn06_ok(v, culto, ev)


def _chave_selecao(
    est: _Estado,
    v: Voluntario,
    papel: PapelSlug,
    culto: CultoGerado,
    ev: Evento | None,
) -> tuple[int, int, int, int, int, str]:
    """RN-05 (1.º); RN-06 (2.º); RN-17 preferência (3.º); depois cargas por papel, nome."""
    return (
        est.participacao_mes[v.nome],
        _prioridade_rn06_empate(culto, ev, v),
        _preferencia_rn17(est, v, culto),
        est.contagem_ativa[(v.nome, papel)],
        est.contagem_30d[(v.nome, papel)],
        v.nome,
    )


def _ordenar_candidatos(
    candidatos: list[Voluntario],
    papel: PapelSlug,
    est: _Estado,
    culto: CultoGerado,
    ev: Evento | None,
) -> list[Voluntario]:
    return sorted(
        candidatos,
        key=lambda v: _chave_selecao(est, v, papel, culto, ev),
    )


def _escolher(
    candidatos: list[Voluntario],
    papel: PapelSlug,
    est: _Estado,
    culto: CultoGerado,
    ev: Evento | None,
) -> Voluntario | None:
    if not candidatos:
        return None
    return _ordenar_candidatos(candidatos, papel, est, culto, ev)[0]


def _incrementar_participacao(est: _Estado, nome: str, papel: PapelSlug) -> None:
    est.contagem_ativa[(nome, papel)] += 1
    est.participacao_mes[nome] += 1


def _decrementar_participacao(est: _Estado, nome: str, papel: PapelSlug) -> None:
    est.contagem_ativa[(nome, papel)] -= 1
    if est.contagem_ativa[(nome, papel)] < 0:
        est.contagem_ativa[(nome, papel)] = 0
    est.participacao_mes[nome] -= 1
    if est.participacao_mes[nome] < 0:
        est.participacao_mes[nome] = 0


def _reverter_trainee_slot(est: _Estado, nome: str, papel: PapelSlug) -> None:
    est.trainee_mes[nome] = max(0, est.trainee_mes[nome] - 1)
    est.trainee_por_papel[(nome, papel)] = max(
        0, est.trainee_por_papel[(nome, papel)] - 1
    )


def _preferencia_rn17(est: _Estado, v: Voluntario, culto: CultoGerado) -> int:
    """RN-17: 0 = culto preferencial para coincidir com par cross; 1 = sem preferência."""
    chave: _Rn17Pref = (culto.data, culto.tipo.value)
    if chave in est.preferencial_rn17.get(v.nome, set()):
        return 0
    return 1


def _rn17_registrar_parceiro(
    est: _Estado,
    mapa_cross: dict[str, str],
    nome_alocado: str,
    data: str,
) -> None:
    """Marca manhã e noite dominicais do mesmo domingo como preferidos para o parceiro."""
    par = mapa_cross.get(nome_alocado)
    if not par:
        return
    if par not in est.preferencial_rn17:
        est.preferencial_rn17[par] = set()
    est.preferencial_rn17[par].add((data, TipoCulto.DOMINICAL_MANHA.value))
    est.preferencial_rn17[par].add((data, TipoCulto.DOMINICAL_NOITE.value))


def _cohorte_trainees_do_papel(
    voluntarios: list[Voluntario],
    papel: PapelSlug,
    ministerio: MinisterioSlug,
) -> list[Voluntario]:
    """Voluntários ativos elegíveis automaticamente com ``papel`` em ``treinamento``."""
    return [
        v
        for v in voluntarios
        if v.ativo
        and not _apenas_manual(v)
        and v.ministerio is ministerio
        and papel in v.treinamento
    ]


def _pode_trainee_rn11(
    est: _Estado,
    v: Voluntario,
    voluntarios: list[Voluntario],
    papel: PapelSlug,
    culto: CultoGerado,
) -> bool:
    """
    RN-11: no máximo 2 aparições como trainee no mês; a 2.ª no mesmo papel só depois de
    todos os trainees desse papel terem sido alocados ao menos uma vez nesse papel.
    """
    if est.trainee_mes[v.nome] >= 2:
        return False
    k = est.trainee_por_papel[(v.nome, papel)]
    if k >= 2:
        return False
    if k == 0:
        return True
    cohorte = _cohorte_trainees_do_papel(voluntarios, papel, culto.ministerio)
    if not cohorte:
        return True
    return all(est.trainee_por_papel[(w.nome, papel)] >= 1 for w in cohorte)


def _trainee_espacamento_ok(
    est: _Estado, nome: str, data: str, datas_mes_ordenadas: list[str]
) -> bool:
    ult = est.trainee_ultima_data[nome]
    if ult is None:
        return True
    try:
        i_ult = datas_mes_ordenadas.index(ult)
        i_at = datas_mes_ordenadas.index(data)
    except ValueError:
        return True
    return i_at > i_ult + 1


def _permite_trainee_ignorar_espacamento(datas_mes_ord: list[str]) -> bool:
    """
    Com 2 ou menos domingos no mês, duas aparições de trainee podem ter de ser em
    domingos consecutivos — aí relaxa-se o espaçamento (RN-11).
    """
    return len(datas_mes_ord) <= 2


def _registrar_trainee(est: _Estado, nome: str, papel: PapelSlug, data: str) -> None:
    est.trainee_mes[nome] += 1
    est.trainee_por_papel[(nome, papel)] += 1
    est.trainee_ultima_data[nome] = data


def _alocar_um_papel_tecnica(
    voluntarios: list[Voluntario],
    papel: PapelSlug,
    culto: CultoGerado,
    data: str,
    ev: Evento | None,
    est: _Estado,
    excluir: set[str] | None,
    datas_mes_ord: list[str],
) -> tuple[Alocacao | None, Alocacao | None]:
    cands = [
        v
        for v in voluntarios
        if _primario_ok(v, papel, culto, data, ev, est, True)
        and (excluir is None or v.nome not in excluir)
    ]
    p = _escolher(cands, papel, est, culto, ev)
    if p is None:
        cands = [
            v
            for v in voluntarios
            if _primario_ok(v, papel, culto, data, ev, est, True)
        ]
        p = _escolher(cands, papel, est, culto, ev)
    if p is None:
        return None, None
    prim = Alocacao(membro=p.nome, papel=papel, trainee=False, fixada=False)
    _incrementar_participacao(est, p.nome, papel)
    tr = _alocar_trainee_tecnica_com_primario(
        voluntarios,
        papel,
        culto,
        data,
        ev,
        est,
        p.nome,
        datas_mes_ord,
        excluir,
    )
    return prim, tr


def _alocar_trainee_tecnica_com_primario(
    voluntarios: list[Voluntario],
    papel: PapelSlug,
    culto: CultoGerado,
    data: str,
    ev: Evento | None,
    est: _Estado,
    nome_primario: str,
    datas_mes_ord: list[str],
    excluir: set[str] | None,
) -> Alocacao | None:
    """Escolhe o trainee para um papel cujo voluntário principal já foi definido (RN-11)."""
    cands_t = [
        v
        for v in voluntarios
        if _trainee_ok(v, papel, culto, data, ev, est)
        and v.nome != nome_primario
        and _pode_trainee_rn11(est, v, voluntarios, papel, culto)
    ]
    if excluir is not None:
        cands_t = [v for v in cands_t if v.nome not in excluir]
    cands_t = [
        v
        for v in cands_t
        if _trainee_espacamento_ok(est, v.nome, data, datas_mes_ord)
    ]
    if not cands_t and _permite_trainee_ignorar_espacamento(datas_mes_ord):
        cands_t = [
            v
            for v in voluntarios
            if _trainee_ok(v, papel, culto, data, ev, est)
            and v.nome != nome_primario
            and _pode_trainee_rn11(est, v, voluntarios, papel, culto)
        ]
    t = _escolher(cands_t, papel, est, culto, ev)
    if t is None:
        return None
    train = Alocacao(membro=t.nome, papel=papel, trainee=True, fixada=False)
    _registrar_trainee(est, t.nome, papel, data)
    return train


def _aplicar_fixas(
    evento: Evento | None,
    culto: CultoGerado,
    papeis: list[PapelSlug],
    voluntarios: list[Voluntario],
    est: _Estado,
) -> dict[PapelSlug, Alocacao]:
    out: dict[PapelSlug, Alocacao] = {}
    if evento is None or not evento.alocacoes_fixas:
        return out
    por_nome = _vol_por_nome(voluntarios)
    for fixa in evento.alocacoes_fixas:
        if fixa.papel not in papeis:
            continue
        v = por_nome.get(fixa.membro)
        if v is None or v.ministerio is not culto.ministerio:
            continue
        out[fixa.papel] = Alocacao(
            membro=fixa.membro,
            papel=fixa.papel,
            trainee=False,
            fixada=True,
        )
        if not _apenas_manual(v):
            _incrementar_participacao(est, fixa.membro, fixa.papel)
    return out


def _montar_lista_por_papel(
    papeis: list[PapelSlug],
    por_papel: dict[PapelSlug, tuple[Alocacao | None, Alocacao | None]],
) -> list[Alocacao]:
    lista: list[Alocacao] = []
    for papel in papeis:
        par = por_papel.get(papel)
        if not par:
            continue
        prim, tr = par
        if prim is not None:
            lista.append(prim)
        if tr is not None:
            lista.append(tr)
    return lista


_CHAVE_PIOR_TECNICA_AP: tuple[int, int, int, int, int, str] = (
    10**9,
    10**9,
    10**9,
    10**9,
    10**9,
    "\uffff",
)


def _alocacoes_candidato_audio_proj_tecnica(
    v: Voluntario,
    *,
    usados: set[str],
    open_a: bool,
    open_p: bool,
    mapa_par: dict[str, str],
    por_nome: dict[str, Voluntario],
    culto: CultoGerado,
    data: str,
    ev: Evento | None,
    est: _Estado,
) -> list[tuple[Voluntario, PapelSlug]] | None:
    """Descreve a alocação (par ou individual) se este voluntário for o primeiro escolhido."""
    if v.nome in usados:
        return None
    partner_nome = mapa_par.get(v.nome)
    pw = por_nome.get(partner_nome) if partner_nome else None
    partner_livre = bool(
        partner_nome and partner_nome not in usados and pw is not None
    )

    if partner_livre and open_a and open_p:
        if (
            PapelSlug.AUDIO in v.papeis
            and PapelSlug.PROJECAO in pw.papeis
            and _primario_ok(v, PapelSlug.AUDIO, culto, data, ev, est, True)
            and _primario_ok(pw, PapelSlug.PROJECAO, culto, data, ev, est, True)
        ):
            return [(v, PapelSlug.AUDIO), (pw, PapelSlug.PROJECAO)]
        if (
            PapelSlug.PROJECAO in v.papeis
            and PapelSlug.AUDIO in pw.papeis
            and _primario_ok(v, PapelSlug.PROJECAO, culto, data, ev, est, True)
            and _primario_ok(pw, PapelSlug.AUDIO, culto, data, ev, est, True)
        ):
            return [(v, PapelSlug.PROJECAO), (pw, PapelSlug.AUDIO)]

    opts: list[tuple[Voluntario, PapelSlug]] = []
    if (
        open_a
        and PapelSlug.AUDIO in v.papeis
        and _primario_ok(v, PapelSlug.AUDIO, culto, data, ev, est, True)
    ):
        opts.append((v, PapelSlug.AUDIO))
    if (
        open_p
        and PapelSlug.PROJECAO in v.papeis
        and _primario_ok(v, PapelSlug.PROJECAO, culto, data, ev, est, True)
    ):
        opts.append((v, PapelSlug.PROJECAO))
    if not opts:
        return None
    if len(opts) == 1:
        return [opts[0]]
    opts.sort(key=lambda x: _chave_selecao(est, x[0], x[1], culto, ev))
    return [opts[0]]


def _preencher_audio_projecao_tecnica_dominical(
    culto: CultoGerado,
    data: str,
    voluntarios: list[Voluntario],
    est: _Estado,
    por_papel: dict[PapelSlug, tuple[Alocacao | None, Alocacao | None]],
    pares_audio_proj: list[tuple[str, str]],
    por_nome: dict[str, Voluntario],
    usados_iniciais: set[str] | None = None,
) -> None:
    """RN-13 (Técnica): áudio e projeção no mesmo culto dominical (manhã ou noite) com par."""
    if not pares_audio_proj:
        return
    mapa_par = _mapa_pares(pares_audio_proj)
    usados: set[str] = (
        set(usados_iniciais) if usados_iniciais is not None else set()
    )
    ev: Evento | None = None

    def _livre(p: PapelSlug) -> bool:
        t = por_papel.get(p)
        return t is None or t[0] is None

    while _livre(PapelSlug.AUDIO) or _livre(PapelSlug.PROJECAO):
        oa = _livre(PapelSlug.AUDIO)
        op = _livre(PapelSlug.PROJECAO)
        cands: list[Voluntario] = []
        for v in voluntarios:
            al = _alocacoes_candidato_audio_proj_tecnica(
                v,
                usados=usados,
                open_a=oa,
                open_p=op,
                mapa_par=mapa_par,
                por_nome=por_nome,
                culto=culto,
                data=data,
                ev=ev,
                est=est,
            )
            if al:
                cands.append(v)
        if not cands:
            break

        def _chave_sort(vv: Voluntario) -> tuple[int, int, int, int, int, int, str]:
            al_s = _alocacoes_candidato_audio_proj_tecnica(
                vv,
                usados=usados,
                open_a=oa,
                open_p=op,
                mapa_par=mapa_par,
                por_nome=por_nome,
                culto=culto,
                data=data,
                ev=ev,
                est=est,
            )
            if not al_s:
                return (10**9, 1, 10**9, 10**9, 10**9, 10**9, "\uffff")
            v0, p0 = al_s[0]
            ch = _chave_selecao(est, v0, p0, culto, ev)
            # RN-13: com as duas vagas abertas, penalizar só quem ocuparia «projeção» sozinho
            # (evita William antes do par áudio+projeção); áudio avulso mantém RN-05.
            penal_proj_sozinho = (
                8
                if (
                    oa
                    and op
                    and len(al_s) < 2
                    and al_s[0][1] is PapelSlug.PROJECAO
                )
                else 0
            )
            fecha_par = 0 if (oa and op and len(al_s) >= 2) else 1
            return (ch[0] + penal_proj_sozinho, fecha_par) + ch[1:]

        cands.sort(key=_chave_sort)
        escolhido = cands[0]
        alocs_fin = _alocacoes_candidato_audio_proj_tecnica(
            escolhido,
            usados=usados,
            open_a=oa,
            open_p=op,
            mapa_par=mapa_par,
            por_nome=por_nome,
            culto=culto,
            data=data,
            ev=ev,
            est=est,
        )
        assert alocs_fin is not None
        for vol, papel in alocs_fin:
            prim = Alocacao(membro=vol.nome, papel=papel, trainee=False, fixada=False)
            _incrementar_participacao(est, vol.nome, papel)
            por_papel[papel] = (prim, None)
            usados.add(vol.nome)


def _rn13_completar_parceiro_audio_projecao(
    voluntarios: list[Voluntario],
    culto: CultoGerado,
    data: str,
    ev: Evento | None,
    est: _Estado,
    por_nome: dict[str, Voluntario],
    pares_audio_proj: list[tuple[str, str]],
    por_papel: dict[PapelSlug, tuple[Alocacao | None, Alocacao | None]],
    excluir_dia: set[str] | None,
) -> None:
    """
    RN-13: se um membro declarado em par já ocupou áudio ou projeção neste culto e o
    complemento está vazio, tenta alocar o parceiro no papel natural dele.
    """
    if not pares_audio_proj:
        return
    mapa_par = _mapa_pares(pares_audio_proj)
    for papel_ocupado, papel_vazio in (
        (PapelSlug.AUDIO, PapelSlug.PROJECAO),
        (PapelSlug.PROJECAO, PapelSlug.AUDIO),
    ):
        par_oc = por_papel.get(papel_ocupado)
        if par_oc is None or par_oc[0] is None:
            continue
        par_va = por_papel.get(papel_vazio)
        if par_va is not None and par_va[0] is not None:
            continue
        nome_prim = par_oc[0].membro
        parceiro_nome = mapa_par.get(nome_prim)
        if not parceiro_nome:
            continue
        if excluir_dia is not None and parceiro_nome in excluir_dia:
            continue
        pw = por_nome.get(parceiro_nome)
        if pw is None or papel_vazio not in pw.papeis:
            continue
        if not _primario_ok(pw, papel_vazio, culto, data, ev, est, True):
            continue
        al = Alocacao(
            membro=parceiro_nome,
            papel=papel_vazio,
            trainee=False,
            fixada=False,
        )
        _incrementar_participacao(est, parceiro_nome, papel_vazio)
        por_papel[papel_vazio] = (al, None)


def _alocar_culto_generico_tecnica(
    voluntarios: list[Voluntario],
    culto: CultoGerado,
    data: str,
    ev: Evento | None,
    papeis: list[PapelSlug],
    est: _Estado,
    datas_mes_ord: list[str],
    por_nome: dict[str, Voluntario],
    pares_audio_proj: list[tuple[str, str]],
    usados_no_dia: set[str] | None = None,
) -> list[Alocacao]:
    excluir_dia: set[str] | None = (
        set(usados_no_dia) if usados_no_dia is not None else None
    )
    fixas = _aplicar_fixas(ev, culto, papeis, voluntarios, est)
    por_papel: dict[PapelSlug, tuple[Alocacao | None, Alocacao | None]] = {
        p: (fixas[p], None) for p in fixas
    }
    if (
        culto.tipo in (TipoCulto.DOMINICAL_MANHA, TipoCulto.DOMINICAL_NOITE)
        and ev is None
        and PapelSlug.AUDIO in papeis
        and PapelSlug.PROJECAO in papeis
        and pares_audio_proj
    ):
        _preencher_audio_projecao_tecnica_dominical(
            culto,
            data,
            voluntarios,
            est,
            por_papel,
            pares_audio_proj,
            por_nome,
            usados_iniciais=excluir_dia if excluir_dia is not None else set(),
        )
    for papel in papeis:
        if papel in por_papel and por_papel[papel][0] is not None:
            continue
        prim, tr = _alocar_um_papel_tecnica(
            voluntarios,
            papel,
            culto,
            data,
            ev,
            est,
            excluir_dia,
            datas_mes_ord,
        )
        por_papel[papel] = (prim, tr)
        if prim is not None and pares_audio_proj:
            _rn13_completar_parceiro_audio_projecao(
                voluntarios,
                culto,
                data,
                ev,
                est,
                por_nome,
                pares_audio_proj,
                por_papel,
                excluir_dia,
            )

    for papel in papeis:
        par = por_papel.get(papel)
        if par is None:
            continue
        prim, tr = par
        if prim is None or tr is not None:
            continue
        tr_novo = _alocar_trainee_tecnica_com_primario(
            voluntarios,
            papel,
            culto,
            data,
            ev,
            est,
            prim.membro,
            datas_mes_ord,
            excluir_dia,
        )
        if tr_novo is not None:
            por_papel[papel] = (prim, tr_novo)

    return _montar_lista_por_papel(papeis, por_papel)


def _find_culto(
    cultos: Iterable[CultoGerado],
    *,
    data: str,
    ministerio: MinisterioSlug,
    tipo: TipoCulto,
) -> CultoGerado | None:
    for c in cultos:
        if c.data == data and c.ministerio is ministerio and c.tipo is tipo:
            return c
    return None


def _chave_ordem_tecnica(c: CultoGerado) -> tuple[str, int, str]:
    """Manhã dominical → noite dominical → especiais (RN-02 modo independente)."""
    if c.tipo is TipoCulto.DOMINICAL_MANHA:
        ordem = 0
    elif c.tipo is TipoCulto.DOMINICAL_NOITE:
        ordem = 1
    else:
        ordem = 2
    return (c.data, ordem, c.nome or "")


def _chave_pool_rn05_union(
    est: _Estado,
    v: Voluntario,
    *,
    mapa_par: dict[str, str],
    abertos: list[PapelSlug],
    usados_no_dia: set[str],
    por_nome: dict[str, Voluntario],
    culto: CultoGerado,
    data: str,
    ev: Evento | None,
) -> tuple[int, int, int, int, int, str]:
    """
    RN-05 (1.º) + RN-06 (2.º) + RN-17 + RN-13 (``split``): ver ``_prioridade_rn06_empate``.
    ``split`` = 1 quando, com um só papel em aberto, escolher este voluntário separaria uma dupla
    (parceiro também pode preencher o mesmo papel) — preferem-se candidatos com ``split`` 0.
    ``pref_dupla`` = 0 se, com dois papéis em aberto, ``v`` pode fechar RN-13 com o parceiro
    (desempate após RN-17, antes de ``split``).
    """
    palco_p, tec_p = PapelSlug.PALCO, PapelSlug.TECNICA_BS
    pm = est.participacao_mes[v.nome]
    pr06 = _prioridade_rn06_empate(culto, ev, v)
    pr17 = _preferencia_rn17(est, v, culto)
    pref_dupla = 1
    if len(abertos) == 2:
        wn = mapa_par.get(v.nome)
        if wn and wn not in usados_no_dia:
            pw = por_nome.get(wn)
            if pw is not None and (
                (
                    _primario_ok(v, palco_p, culto, data, ev, est, True)
                    and _primario_ok(pw, tec_p, culto, data, ev, est, True)
                )
                or (
                    _primario_ok(v, tec_p, culto, data, ev, est, True)
                    and _primario_ok(pw, palco_p, culto, data, ev, est, True)
                )
            ):
                pref_dupla = 0
    split = 0
    if len(abertos) == 1:
        papel_u = abertos[0]
        pn = mapa_par.get(v.nome)
        if pn and pn not in usados_no_dia:
            pw = por_nome.get(pn)
            if pw is not None and _primario_ok(
                pw, papel_u, culto, data, ev, est, True
            ):
                split = 1
    return (pm, pr06, pr17, pref_dupla, split, v.nome)


def _primario_backstage_parceiro_rn13_ok(
    v: Voluntario,
    papel_alvo: PapelSlug,
    culto: CultoGerado,
    data: str,
    ev: Evento | None,
    est: _Estado,
    por_m: dict[PapelSlug, tuple[Alocacao | None, Alocacao | None]],
    mapa_par: dict[str, str],
    por_nome: dict[str, Voluntario],
) -> bool:
    """
    RN-13 (backstage): se o papel complementar já está ocupado por quem não é o parceiro,
    não alocar ``v`` no slot restante quando o parceiro ainda poderia ocupar esse lugar
    (caso contrário o par fica separado). Exceções: parceiro bloqueado, ≥3 participações
    no mês ou inelegível para o papel — alocação individual permitida (SPEC).
    """
    palco_p, tec_p = PapelSlug.PALCO, PapelSlug.TECNICA_BS
    if papel_alvo not in (palco_p, tec_p):
        return True
    wn = mapa_par.get(v.nome)
    if not wn:
        return True
    w = por_nome.get(wn)
    if w is None:
        return True
    p_outro = tec_p if papel_alvo is palco_p else palco_p
    par_out = por_m.get(p_outro)
    prim_out = par_out[0] if par_out else None
    if prim_out is None:
        return True
    if prim_out.membro == wn:
        return True
    if est.bloqueado(wn, data, culto.tipo, ev):
        return True
    if est.participacao_mes[wn] >= 3:
        return True
    if not _primario_ok(w, p_outro, culto, data, ev, est, True):
        return True
    return False


def _preencher_primarios_backstage_dominical(
    culto: CultoGerado,
    data: str,
    voluntarios: list[Voluntario],
    est: _Estado,
    usados_no_dia: set[str],
    pares: list[tuple[str, str]],
    por_nome: dict[str, Voluntario],
    por_m: dict[PapelSlug, tuple[Alocacao | None, Alocacao | None]],
) -> None:
    """
    RN-05 + RN-13: PALCO e TÉCNICA no mesmo pool; dupla só quando o membro escolhido
    (menor participação no mês entre elegíveis) tem parceiro disponível para o papel complementar.
    """
    ev: Evento | None = None
    palco_p, tec_p = PapelSlug.PALCO, PapelSlug.TECNICA_BS
    mapa_par = _mapa_pares(pares)

    def _primario_livre(p: PapelSlug) -> bool:
        par = por_m.get(p)
        return par is None or par[0] is None

    while _primario_livre(palco_p) or _primario_livre(tec_p):
        abertos = [p for p in (palco_p, tec_p) if _primario_livre(p)]
        cands_union = [
            v
            for v in voluntarios
            if v.nome not in usados_no_dia
            and any(
                _primario_ok(v, p, culto, data, ev, est, True) for p in abertos
            )
            and all(
                _primario_backstage_parceiro_rn13_ok(
                    v,
                    p,
                    culto,
                    data,
                    ev,
                    est,
                    por_m,
                    mapa_par,
                    por_nome,
                )
                for p in abertos
                if _primario_ok(v, p, culto, data, ev, est, True)
            )
        ]
        if not cands_union:
            break
        cands_union.sort(
            key=lambda v: _chave_pool_rn05_union(
                est,
                v,
                mapa_par=mapa_par,
                abertos=abertos,
                usados_no_dia=usados_no_dia,
                por_nome=por_nome,
                culto=culto,
                data=data,
                ev=ev,
            )
        )
        v = cands_union[0]
        partner_nome = mapa_par.get(v.nome)
        w = por_nome.get(partner_nome) if partner_nome else None

        fez_dupla = False
        if (
            len(abertos) == 2
            and w is not None
            and w.nome not in usados_no_dia
        ):
            if (
                _primario_ok(v, palco_p, culto, data, ev, est, True)
                and _primario_ok(w, tec_p, culto, data, ev, est, True)
            ):
                al_p = Alocacao(membro=v.nome, papel=palco_p, trainee=False, fixada=False)
                al_t = Alocacao(membro=w.nome, papel=tec_p, trainee=False, fixada=False)
                _incrementar_participacao(est, v.nome, palco_p)
                _incrementar_participacao(est, w.nome, tec_p)
                por_m[palco_p] = (al_p, None)
                por_m[tec_p] = (al_t, None)
                usados_no_dia.add(v.nome)
                usados_no_dia.add(w.nome)
                fez_dupla = True
            elif (
                _primario_ok(v, tec_p, culto, data, ev, est, True)
                and _primario_ok(w, palco_p, culto, data, ev, est, True)
            ):
                al_p = Alocacao(membro=w.nome, papel=palco_p, trainee=False, fixada=False)
                al_t = Alocacao(membro=v.nome, papel=tec_p, trainee=False, fixada=False)
                _incrementar_participacao(est, w.nome, palco_p)
                _incrementar_participacao(est, v.nome, tec_p)
                por_m[palco_p] = (al_p, None)
                por_m[tec_p] = (al_t, None)
                usados_no_dia.add(v.nome)
                usados_no_dia.add(w.nome)
                fez_dupla = True

        if fez_dupla:
            continue

        for p in (palco_p, tec_p):
            if not _primario_livre(p):
                continue
            if not _primario_ok(v, p, culto, data, ev, est, True):
                continue
            if not _primario_backstage_parceiro_rn13_ok(
                v,
                p,
                culto,
                data,
                ev,
                est,
                por_m,
                mapa_par,
                por_nome,
            ):
                continue
            al = Alocacao(membro=v.nome, papel=p, trainee=False, fixada=False)
            _incrementar_participacao(est, v.nome, p)
            por_m[p] = (al, None)
            usados_no_dia.add(v.nome)
            break
        else:
            break


def _alocar_backstage_culto(
    culto: CultoGerado,
    ev: Evento | None,
    papeis: list[PapelSlug],
    voluntarios: list[Voluntario],
    est: _Estado,
    usados_no_dia: set[str],
    pares: list[tuple[str, str]],
    por_nome: dict[str, Voluntario],
    datas_mes_ord: list[str],
) -> list[Alocacao]:
    data = culto.data
    if ev and ev.pessoa_unica:
        cands = [
            v
            for v in voluntarios
            if _elegivel_auto(v)
            and v.ministerio is culto.ministerio
            and all(p in v.papeis for p in papeis)
            and not est.bloqueado(v.nome, data, culto.tipo, ev)
            and _rn06_ok(v, culto, ev)
            and v.nome not in usados_no_dia
        ]
        esc = _escolher(cands, papeis[0], est, culto, ev)
        if esc is None:
            est.alertas.append(
                f"Evento «{ev.nome}» ({data}): sem voluntário para pessoa única."
            )
            return []
        nome = esc.nome
        alocs: list[Alocacao] = []
        primeiro = True
        for p in papeis:
            alocs.append(
                Alocacao(membro=nome, papel=p, trainee=False, fixada=False)
            )
            if primeiro:
                _incrementar_participacao(est, nome, p)
                primeiro = False
        for n in {nome}:
            usados_no_dia.add(n)
        return alocs

    fixas = _aplicar_fixas(ev, culto, papeis, voluntarios, est)
    por_m: dict[PapelSlug, tuple[Alocacao | None, Alocacao | None]] = {
        p: (fixas[p], None) for p in fixas
    }
    pendentes = [p for p in papeis if p not in por_m]

    if (
        culto.tipo is not TipoCulto.ESPECIAL
        and len(pendentes) == 2
        and PapelSlug.PALCO in pendentes
        and PapelSlug.TECNICA_BS in pendentes
    ):
        _preencher_primarios_backstage_dominical(
            culto,
            data,
            voluntarios,
            est,
            usados_no_dia,
            pares,
            por_nome,
            por_m,
        )

    mapa_par_bs = _mapa_pares(pares)
    for papel in papeis:
        if papel in por_m and por_m[papel][0] is not None:
            continue
        excl = set(usados_no_dia)
        cands = [
            v
            for v in voluntarios
            if _primario_ok(v, papel, culto, data, ev, est, True)
            and v.nome not in excl
            and _primario_backstage_parceiro_rn13_ok(
                v,
                papel,
                culto,
                data,
                ev,
                est,
                por_m,
                mapa_par_bs,
                por_nome,
            )
        ]
        esc = _escolher(cands, papel, est, culto, ev)
        if esc is None:
            cands = [
                v
                for v in voluntarios
                if _primario_ok(v, papel, culto, data, ev, est, True)
                and _primario_backstage_parceiro_rn13_ok(
                    v,
                    papel,
                    culto,
                    data,
                    ev,
                    est,
                    por_m,
                    mapa_par_bs,
                    por_nome,
                )
            ]
            esc = _escolher(cands, papel, est, culto, ev)
        if esc is None:
            est.alertas.append(
                f"Backstage {data} ({culto.tipo.value}): sem voluntário para «{papel.value}»."
            )
            por_m[papel] = (None, None)
            continue
        prim = Alocacao(membro=esc.nome, papel=papel, trainee=False, fixada=False)
        _incrementar_participacao(est, esc.nome, papel)
        usados_no_dia.add(esc.nome)
        por_m[papel] = (prim, None)

    if culto.tipo is not TipoCulto.ESPECIAL:
        for papel in papeis:
            par = por_m.get(papel)
            if par is None or par[0] is None or par[1] is not None:
                continue
            prim = par[0]
            cands_t = [
                v
                for v in voluntarios
                if _trainee_ok(v, papel, culto, data, ev, est)
                and v.nome != prim.membro
                and _pode_trainee_rn11(est, v, voluntarios, papel, culto)
                and v.nome not in usados_no_dia
            ]
            cands_t = [
                v
                for v in cands_t
                if _trainee_espacamento_ok(est, v.nome, data, datas_mes_ord)
            ]
            if not cands_t and _permite_trainee_ignorar_espacamento(datas_mes_ord):
                cands_t = [
                    v
                    for v in voluntarios
                    if _trainee_ok(v, papel, culto, data, ev, est)
                    and v.nome != prim.membro
                    and _pode_trainee_rn11(est, v, voluntarios, papel, culto)
                    and v.nome not in usados_no_dia
                ]
            tr = _escolher(cands_t, papel, est, culto, ev)
            tr_a: Alocacao | None = None
            if tr is not None:
                tr_a = Alocacao(membro=tr.nome, papel=papel, trainee=True, fixada=False)
                _registrar_trainee(est, tr.nome, papel, data)
                usados_no_dia.add(tr.nome)
            por_m[papel] = (prim, tr_a)

    return _montar_lista_por_papel(papeis, por_m)


def _datas_domingos_mes(cultos: list[CultoGerado]) -> list[str]:
    ds = sorted(
        {
            c.data
            for c in cultos
            if c.tipo in (TipoCulto.DOMINICAL_MANHA, TipoCulto.DOMINICAL_NOITE)
        }
    )
    return ds


def _domingos_no_mes(mes: str) -> list[str]:
    import calendar
    from datetime import date as date_cls

    y, mo = map(int, mes.split("-")[:2])
    _, ult = calendar.monthrange(y, mo)
    out: list[str] = []
    for d in range(1, ult + 1):
        dt = date_cls(y, mo, d)
        if dt.weekday() == 6:
            out.append(dt.isoformat())
    return out


def _computar_nao_alocados(
    mes: str,
    voluntarios: list[Voluntario],
    cultos: list[CultoGerado],
    bloqueios: set[tuple[str, str]],
) -> list[tuple[str, str]]:
    """RN-15 / RN-16: voluntários ativos com papel que nunca foram primários no mês."""
    prefixo = mes[:7]
    nomes_prim: set[str] = set()
    for c in cultos:
        if not c.data.startswith(prefixo):
            continue
        for a in c.alocacoes:
            if not a.trainee:
                nomes_prim.add(a.membro)

    domingos = _domingos_no_mes(mes)
    nao: list[tuple[str, str]] = []
    for v in voluntarios:
        if not v.ativo or _apenas_manual(v):
            continue
        if not v.papeis:
            continue
        if v.nome in nomes_prim:
            continue
        if domingos and all((v.nome, d) in bloqueios for d in domingos):
            nao.append(
                (v.nome, "Indisponível em todas as datas elegíveis do mês.")
            )
        else:
            nao.append(
                (
                    v.nome,
                    "Número de cultos no mês insuficiente para cobrir todos os voluntários "
                    "deste perfil sem violar outras regras.",
                )
            )
    return nao


def _rn17_membro_primario_no_culto(culto: CultoGerado, nome: str) -> bool:
    return any(a.membro == nome and not a.trainee for a in culto.alocacoes)


def _rn17_papel_fallback(v: Voluntario) -> PapelSlug | None:
    if PapelSlug.PALCO in v.papeis:
        return PapelSlug.PALCO
    if PapelSlug.TECNICA_BS in v.papeis:
        return PapelSlug.TECNICA_BS
    return None


def _rn17_remover_alocacoes_papel(
    culto: CultoGerado,
    papel: PapelSlug,
    est: _Estado,
) -> None:
    novas: list[Alocacao] = []
    for a in culto.alocacoes:
        if a.papel is not papel:
            novas.append(a)
            continue
        if a.trainee:
            _reverter_trainee_slot(est, a.membro, a.papel)
        else:
            _decrementar_participacao(est, a.membro, a.papel)
    culto.alocacoes = novas


def _culto_backstage_par_rn13_completo(
    culto: CultoGerado,
    pares_bs: list[tuple[str, str]],
) -> bool:
    """True se PALCO e TÉCNICA_BS são exatamente um par declarado em ``pares`` (RN-13)."""
    if not pares_bs:
        return False
    mapa = _mapa_pares(pares_bs)
    palco_p, tec_p = PapelSlug.PALCO, PapelSlug.TECNICA_BS
    np = next(
        (a.membro for a in culto.alocacoes if not a.trainee and a.papel == palco_p),
        None,
    )
    nt = next(
        (a.membro for a in culto.alocacoes if not a.trainee and a.papel == tec_p),
        None,
    )
    if not np or not nt:
        return False
    return mapa.get(np) == nt


def _rn17_pos_fallback_pares_cross(
    cultos: list[CultoGerado],
    est: _Estado,
    por_nome: dict[str, Voluntario],
    pares_cross: list[tuple[str, str]],
    pares_bs: list[tuple[str, str]],
    modos: dict[MinisterioSlug, ModoEscala],
) -> None:
    """
    RN-17 — Prioridade 2: se o parceiro em ``independente`` não coincidir no domingo,
    preenche o mesmo papel em manhã e noite nesse domingo. Cada turno conta +1 em RN-05.
    Só aplica se o membro independente ainda tiver 0 participações primárias no mês.
    """
    if not pares_cross:
        return
    domingos = sorted(
        {
            c.data
            for c in cultos
            if c.tipo in (TipoCulto.DOMINICAL_MANHA, TipoCulto.DOMINICAL_NOITE)
        }
    )
    for a, b in pares_cross:
        va = por_nome.get(a)
        vb = por_nome.get(b)
        if va is None or vb is None:
            continue
        modo_a = modos[va.ministerio]
        modo_b = modos[vb.ministerio]
        if modo_a is ModoEscala.EQUIPE_UNICA and modo_b is ModoEscala.INDEPENDENTE:
            eq_nome, bs_nome = a, b
        elif modo_b is ModoEscala.EQUIPE_UNICA and modo_a is ModoEscala.INDEPENDENTE:
            eq_nome, bs_nome = b, a
        else:
            continue
        if est.participacao_mes[bs_nome] > 0:
            continue
        v_bs = por_nome[bs_nome]
        papel_fb = _rn17_papel_fallback(v_bs)
        if papel_fb is None or not _elegivel_auto(v_bs):
            continue
        for data_iso in domingos:
            cm = _find_culto(
                cultos,
                data=data_iso,
                ministerio=MinisterioSlug.TECNICA,
                tipo=TipoCulto.DOMINICAL_MANHA,
            )
            m_bs = _find_culto(
                cultos,
                data=data_iso,
                ministerio=MinisterioSlug.BACKSTAGE,
                tipo=TipoCulto.DOMINICAL_MANHA,
            )
            n_bs = _find_culto(
                cultos,
                data=data_iso,
                ministerio=MinisterioSlug.BACKSTAGE,
                tipo=TipoCulto.DOMINICAL_NOITE,
            )
            if cm is None or m_bs is None or n_bs is None:
                continue
            if not _rn17_membro_primario_no_culto(cm, eq_nome):
                continue
            if _rn17_membro_primario_no_culto(m_bs, bs_nome) or _rn17_membro_primario_no_culto(
                n_bs, bs_nome
            ):
                continue
            if est.bloqueado(bs_nome, data_iso, TipoCulto.DOMINICAL_MANHA, None) or est.bloqueado(
                bs_nome, data_iso, TipoCulto.DOMINICAL_NOITE, None
            ):
                continue
            if not _primario_ok(
                v_bs, papel_fb, m_bs, data_iso, None, est, True
            ) or not _primario_ok(v_bs, papel_fb, n_bs, data_iso, None, est, True):
                continue
            if pares_bs and (
                _culto_backstage_par_rn13_completo(m_bs, pares_bs)
                or _culto_backstage_par_rn13_completo(n_bs, pares_bs)
            ):
                continue
            _rn17_remover_alocacoes_papel(m_bs, papel_fb, est)
            _rn17_remover_alocacoes_papel(n_bs, papel_fb, est)
            m_bs.alocacoes.append(
                Alocacao(
                    membro=bs_nome,
                    papel=papel_fb,
                    trainee=False,
                    fixada=False,
                )
            )
            _incrementar_participacao(est, bs_nome, papel_fb)
            n_bs.alocacoes.append(
                Alocacao(
                    membro=bs_nome,
                    papel=papel_fb,
                    trainee=False,
                    fixada=False,
                )
            )
            _incrementar_participacao(est, bs_nome, papel_fb)
            break


def _alocar_bloco_tecnica_equipe_unica(
    cultos: list[CultoGerado],
    eventos_mes: list[Evento],
    voluntarios: list[Voluntario],
    est: _Estado,
    datas_mes_ord: list[str],
    por_nome: dict[str, Voluntario],
    pares_tecnica_ap: list[tuple[str, str]],
    mapa_cross: dict[str, str],
) -> None:
    """RN-01: uma alocação na manhã dominical e cópia para a noite."""
    datas_tecnica: set[str] = {
        c.data
        for c in cultos
        if c.ministerio is MinisterioSlug.TECNICA
        and c.tipo is TipoCulto.DOMINICAL_MANHA
    }

    for data_iso in sorted(datas_tecnica):
        m = _find_culto(
            cultos,
            data=data_iso,
            ministerio=MinisterioSlug.TECNICA,
            tipo=TipoCulto.DOMINICAL_MANHA,
        )
        n = _find_culto(
            cultos,
            data=data_iso,
            ministerio=MinisterioSlug.TECNICA,
            tipo=TipoCulto.DOMINICAL_NOITE,
        )
        if m is None or n is None:
            continue
        papeis = papeis_exigidos(m, None)
        alocs = _alocar_culto_generico_tecnica(
            voluntarios,
            m,
            data_iso,
            None,
            papeis,
            est,
            datas_mes_ord,
            por_nome,
            pares_tecnica_ap,
        )
        m.alocacoes = alocs
        for al in m.alocacoes:
            if not al.trainee:
                _rn17_registrar_parceiro(est, mapa_cross, al.membro, data_iso)
        n.alocacoes = [a.model_copy() for a in alocs]

    for c in sorted(
        [
            x
            for x in cultos
            if x.ministerio is MinisterioSlug.TECNICA
            and x.tipo is TipoCulto.ESPECIAL
        ],
        key=lambda x: (x.data, x.nome or ""),
    ):
        ev = _evento_especial(eventos_mes, c)
        papeis = papeis_exigidos(c, ev)
        c.alocacoes = _alocar_culto_generico_tecnica(
            voluntarios,
            c,
            c.data,
            ev,
            papeis,
            est,
            datas_mes_ord,
            por_nome,
            [],
        )


def _alocar_bloco_tecnica_independente(
    cultos: list[CultoGerado],
    eventos_mes: list[Evento],
    voluntarios: list[Voluntario],
    est: _Estado,
    datas_mes_ord: list[str],
    por_nome: dict[str, Voluntario],
    pares_tecnica_ap: list[tuple[str, str]],
    usados_tecnica_dia: dict[str, set[str]],
) -> None:
    """RN-02 (Técnica): manhã e noite com equipes distintas quando possível."""
    cultos_tecnica = [
        c
        for c in cultos
        if c.ministerio is MinisterioSlug.TECNICA
        and c.tipo
        in (
            TipoCulto.DOMINICAL_MANHA,
            TipoCulto.DOMINICAL_NOITE,
            TipoCulto.ESPECIAL,
        )
    ]
    for c in sorted(cultos_tecnica, key=_chave_ordem_tecnica):
        ev = (
            _evento_especial(eventos_mes, c)
            if c.tipo is TipoCulto.ESPECIAL
            else None
        )
        papeis = papeis_exigidos(c, ev)
        u = usados_tecnica_dia[c.data]
        pap = (
            pares_tecnica_ap
            if c.tipo
            in (TipoCulto.DOMINICAL_MANHA, TipoCulto.DOMINICAL_NOITE)
            else []
        )
        c.alocacoes = _alocar_culto_generico_tecnica(
            voluntarios,
            c,
            c.data,
            ev,
            papeis,
            est,
            datas_mes_ord,
            por_nome,
            pap,
            usados_no_dia=u,
        )
        for a in c.alocacoes:
            u.add(a.membro)


def _alocar_bloco_backstage_equipe_unica(
    cultos: list[CultoGerado],
    eventos_mes: list[Evento],
    voluntarios: list[Voluntario],
    est: _Estado,
    datas_mes_ord: list[str],
    por_nome: dict[str, Voluntario],
    pares_backstage: list[tuple[str, str]],
    usados_backstage_dia: dict[str, set[str]],
) -> None:
    """RN-01 (Backstage): réplica manhã → noite nos dominicais."""
    datas_bs = {
        c.data
        for c in cultos
        if c.ministerio is MinisterioSlug.BACKSTAGE
        and c.tipo is TipoCulto.DOMINICAL_MANHA
    }
    for data_iso in sorted(datas_bs):
        m = _find_culto(
            cultos,
            data=data_iso,
            ministerio=MinisterioSlug.BACKSTAGE,
            tipo=TipoCulto.DOMINICAL_MANHA,
        )
        n = _find_culto(
            cultos,
            data=data_iso,
            ministerio=MinisterioSlug.BACKSTAGE,
            tipo=TipoCulto.DOMINICAL_NOITE,
        )
        if m is None or n is None:
            continue
        ev: Evento | None = None
        papeis = papeis_exigidos(m, None)
        u_bs: set[str] = set()
        m.alocacoes = _alocar_backstage_culto(
            m,
            ev,
            papeis,
            voluntarios,
            est,
            u_bs,
            pares_backstage,
            por_nome,
            datas_mes_ord,
        )
        n.alocacoes = [a.model_copy() for a in m.alocacoes]
        for a in m.alocacoes:
            usados_backstage_dia[data_iso].add(a.membro)

    for c in sorted(
        [
            x
            for x in cultos
            if x.ministerio is MinisterioSlug.BACKSTAGE
            and x.tipo is TipoCulto.ESPECIAL
        ],
        key=lambda x: (x.data, x.nome or ""),
    ):
        ev = _evento_especial(eventos_mes, c)
        papeis = papeis_exigidos(c, ev)
        u = usados_backstage_dia[c.data]
        c.alocacoes = _alocar_backstage_culto(
            c,
            ev,
            papeis,
            voluntarios,
            est,
            u,
            pares_backstage,
            por_nome,
            datas_mes_ord,
        )


def _alocar_bloco_backstage_independente(
    cultos: list[CultoGerado],
    eventos_mes: list[Evento],
    voluntarios: list[Voluntario],
    est: _Estado,
    datas_mes_ord: list[str],
    por_nome: dict[str, Voluntario],
    pares_backstage: list[tuple[str, str]],
    usados_backstage_dia: dict[str, set[str]],
) -> None:
    """RN-02 (Backstage): turnos separados; sem dupla pessoa no mesmo dia (ativos)."""
    ordem_bs: list[CultoGerado] = sorted(
        [c for c in cultos if c.ministerio is MinisterioSlug.BACKSTAGE],
        key=lambda x: (x.data, x.tipo.value, x.nome or ""),
    )

    for c in ordem_bs:
        ev = (
            _evento_especial(eventos_mes, c)
            if c.tipo is TipoCulto.ESPECIAL
            else None
        )
        papeis = papeis_exigidos(c, ev)
        u = usados_backstage_dia[c.data]
        c.alocacoes = _alocar_backstage_culto(
            c,
            ev,
            papeis,
            voluntarios,
            est,
            u,
            pares_backstage,
            por_nome,
            datas_mes_ord,
        )


def alocar_escala(
    mes: str,
    voluntarios: list[Voluntario],
    indisponibilidades: list[Indisponibilidade],
    eventos_mes: list[Evento],
    cultos: list[CultoGerado],
    pares: list[ParObrigatorio] | None = None,
    modos_ministerio: dict[MinisterioSlug, ModoEscala] | None = None,
    pares_cross: list[tuple[str, str]] | None = None,
) -> tuple[list[CultoGerado], list[str], list[tuple[str, str]]]:
    """
    Preenche alocações (RN-01 a RN-16). Retorna cultos, alertas e lista (nome, motivo)
    de não-alocados (RN-15). RN-16: ``apenas_manual`` excluído da geração e da lista.

    RN-01 / RN-02: ``modos_ministerio`` define se cada ministério replica a equipe
    (``equipe_unica``) ou trata manhã/noite separadamente (``independente``).
    """
    pares = pares or []
    pares_cross = pares_cross or []
    modos = resolver_modos_ministerio(modos_ministerio)
    est = _Estado(
        bloqueios=_bloqueios(indisponibilidades),
        indisponibilidades=indisponibilidades,
    )
    por_nome = _vol_por_nome(voluntarios)
    mapa_cross = _mapa_pares(pares_cross)
    pares_tecnica_ap = _pares_tecnica_audio_projecao(pares, por_nome)
    pares_backstage = _pares_backstage_tuplas(pares)
    datas_mes_ord = _datas_domingos_mes(cultos)

    usados_tecnica_dia: dict[str, set[str]] = defaultdict(set)
    usados_backstage_dia: dict[str, set[str]] = defaultdict(set)

    for ministerio in MINISTERIOS_ORDEM_ALOCACAO:
        modo = modos[ministerio]
        if ministerio is MinisterioSlug.TECNICA:
            if modo == ModoEscala.EQUIPE_UNICA:
                _alocar_bloco_tecnica_equipe_unica(
                    cultos,
                    eventos_mes,
                    voluntarios,
                    est,
                    datas_mes_ord,
                    por_nome,
                    pares_tecnica_ap,
                    mapa_cross,
                )
            else:
                _alocar_bloco_tecnica_independente(
                    cultos,
                    eventos_mes,
                    voluntarios,
                    est,
                    datas_mes_ord,
                    por_nome,
                    pares_tecnica_ap,
                    usados_tecnica_dia,
                )
        else:
            # Único outro slug em ``MINISTERIOS_ORDEM_ALOCACAO`` é Backstage.
            if modo == ModoEscala.EQUIPE_UNICA:
                _alocar_bloco_backstage_equipe_unica(
                    cultos,
                    eventos_mes,
                    voluntarios,
                    est,
                    datas_mes_ord,
                    por_nome,
                    pares_backstage,
                    usados_backstage_dia,
                )
            else:
                _alocar_bloco_backstage_independente(
                    cultos,
                    eventos_mes,
                    voluntarios,
                    est,
                    datas_mes_ord,
                    por_nome,
                    pares_backstage,
                    usados_backstage_dia,
                )

    _rn17_pos_fallback_pares_cross(
        cultos,
        est,
        por_nome,
        pares_cross,
        pares_backstage,
        modos,
    )

    nao = _computar_nao_alocados(
        mes,
        voluntarios,
        cultos,
        est.bloqueios,
    )
    return cultos, est.alertas, nao
