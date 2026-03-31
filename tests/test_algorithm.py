from __future__ import annotations

from collections import Counter
from pathlib import Path

import pytest

from src.config.loader import carregar_tudo, resolver_modos_ministerio
from src.domain.types import (
    Alocacao,
    CultoGerado,
    Indisponibilidade,
    MinisterioSlug,
    ModoEscala,
    PapelSlug,
    RestricaoTipo,
    TipoCulto,
    Voluntario,
)
from src.scheduler.algorithm import (
    _Estado,
    _chave_selecao,
    _escolher,
    _rn17_pos_fallback_pares_cross,
    alocar_escala,
)
from src.scheduler.calendar import gerar_cultos_do_mes

from tests.fixtures import (
    MES_TESTE_INTEGRACAO,
    dados_seed,
    eventos_mes_teste_integracao,
    primeiro_domingo_do_mes,
    membro_alocacao_fixa_audio_evento_copa,
    nome_apenas_manual_tecnica_audio,
    nome_backstage_somente_manha,
    nome_backstage_somente_noite,
    nome_trainee_backstage_palco_tecnica,
    par_tecnica_projecao_audio,
    primeiro_nome_ordenado,
    voluntarios_seed_spec,
)

_ROOT = Path(__file__).resolve().parents[1]


def _run_mes_integracao(
    voluntarios: list[Voluntario],
    indisponibilidades: list[Indisponibilidade],
    *,
    modos_override: dict[MinisterioSlug, ModoEscala] | None = None,
) -> tuple[list, list[tuple[str, str]]]:
    """Roda o algoritmo no mês ``MES_TESTE_INTEGRACAO`` (definido por ``data/events.yml``)."""
    dados = dados_seed()
    base_modos = {m.slug: m.modo for m in dados.ministerios}
    if modos_override:
        base_modos = {**base_modos, **modos_override}
    modos = resolver_modos_ministerio(base_modos)
    cultos = gerar_cultos_do_mes(MES_TESTE_INTEGRACAO, _ROOT / "data")
    cultos_aloc, _, nao = alocar_escala(
        MES_TESTE_INTEGRACAO,
        voluntarios,
        indisponibilidades,
        eventos_mes_teste_integracao(),
        cultos,
        pares=dados.pares,
        modos_ministerio=modos,
        pares_cross=dados.pares_cross,
    )
    return cultos_aloc, nao


def test_modo_tecnica_equipe_unica_replica_manha_para_noite() -> None:
    """RN-01: com modo explícito, manhã e noite têm as mesmas alocações (cópia)."""
    out, _ = _run_mes_integracao(
        voluntarios_seed_spec(),
        [],
        modos_override={MinisterioSlug.TECNICA: ModoEscala.EQUIPE_UNICA},
    )
    for data in sorted(
        {
            c.data
            for c in out
            if c.ministerio is MinisterioSlug.TECNICA
            and c.tipo is TipoCulto.DOMINICAL_MANHA
        }
    ):
        manha = next(
            c
            for c in out
            if c.data == data
            and c.ministerio is MinisterioSlug.TECNICA
            and c.tipo is TipoCulto.DOMINICAL_MANHA
        )
        noite = next(
            c
            for c in out
            if c.data == data
            and c.ministerio is MinisterioSlug.TECNICA
            and c.tipo is TipoCulto.DOMINICAL_NOITE
        )
        ch_m = [(a.membro, a.papel, a.trainee, a.fixada) for a in manha.alocacoes]
        ch_n = [(a.membro, a.papel, a.trainee, a.fixada) for a in noite.alocacoes]
        assert ch_m == ch_n, data


def test_modo_tecnica_independente_manha_e_noite_primarios_sem_intersecao() -> None:
    """RN-02: modo independente na Técnica — papéis ativos não repetem a mesma pessoa no dia."""
    out, _ = _run_mes_integracao(
        voluntarios_seed_spec(),
        [],
        modos_override={MinisterioSlug.TECNICA: ModoEscala.INDEPENDENTE},
    )
    for data in sorted(
        {
            c.data
            for c in out
            if c.ministerio is MinisterioSlug.TECNICA
            and c.tipo is TipoCulto.DOMINICAL_MANHA
        }
    ):
        manha = next(
            c
            for c in out
            if c.data == data
            and c.ministerio is MinisterioSlug.TECNICA
            and c.tipo is TipoCulto.DOMINICAL_MANHA
        )
        noite = next(
            c
            for c in out
            if c.data == data
            and c.ministerio is MinisterioSlug.TECNICA
            and c.tipo is TipoCulto.DOMINICAL_NOITE
        )
        prim_m = {a.membro for a in manha.alocacoes if not a.trainee}
        prim_n = {a.membro for a in noite.alocacoes if not a.trainee}
        assert prim_m.isdisjoint(prim_n), (data, prim_m & prim_n)


def test_ca01_tecnica_manha_igual_noite() -> None:
    """RN-01 com ``equipe_unica`` (o YAML de integração pode estar em ``independente``)."""
    out, _ = _run_mes_integracao(
        voluntarios_seed_spec(),
        [],
        modos_override={MinisterioSlug.TECNICA: ModoEscala.EQUIPE_UNICA},
    )
    for data in sorted(
        {
            c.data
            for c in out
            if c.ministerio is MinisterioSlug.TECNICA
            and c.tipo is TipoCulto.DOMINICAL_MANHA
        }
    ):
        m = next(
            c
            for c in out
            if c.data == data
            and c.ministerio is MinisterioSlug.TECNICA
            and c.tipo is TipoCulto.DOMINICAL_MANHA
        )
        n = next(
            c
            for c in out
            if c.data == data
            and c.ministerio is MinisterioSlug.TECNICA
            and c.tipo is TipoCulto.DOMINICAL_NOITE
        )
        assert m.alocacoes == n.alocacoes


def test_ca02_backstage_manha_e_noite_sem_repeticao_quando_possivel() -> None:
    out, _ = _run_mes_integracao(voluntarios_seed_spec(), [])
    datas = sorted(
        {
            c.data
            for c in out
            if c.ministerio is MinisterioSlug.BACKSTAGE
            and c.tipo is TipoCulto.DOMINICAL_MANHA
        }
    )
    for data in datas:
        m = next(
            c
            for c in out
            if c.data == data
            and c.ministerio is MinisterioSlug.BACKSTAGE
            and c.tipo is TipoCulto.DOMINICAL_MANHA
        )
        n = next(
            c
            for c in out
            if c.data == data
            and c.ministerio is MinisterioSlug.BACKSTAGE
            and c.tipo is TipoCulto.DOMINICAL_NOITE
        )
        sm = {a.membro for a in m.alocacoes if not a.trainee}
        sn = {a.membro for a in n.alocacoes if not a.trainee}
        assert not (sm & sn), f"Sobreposição manhã/noite em {data}: {sm & sn}"


def test_ca03_distribuicao_equilibrada_dominical_audio_tecnica() -> None:
    """RN-05: equilíbrio de áudio nos dominicais (grelha manhã com ``equipe_unica``)."""
    out, _ = _run_mes_integracao(
        voluntarios_seed_spec(),
        [],
        modos_override={MinisterioSlug.TECNICA: ModoEscala.EQUIPE_UNICA},
    )
    cnt: Counter[str] = Counter()
    for c in out:
        if c.ministerio is not MinisterioSlug.TECNICA:
            continue
        if c.tipo is not TipoCulto.DOMINICAL_MANHA:
            continue
        for a in c.alocacoes:
            if a.trainee:
                continue
            if a.papel is PapelSlug.AUDIO:
                cnt[a.membro] += 1
    ativos_audio = [
        v.nome
        for v in voluntarios_seed_spec()
        if v.ativo and v.ministerio is MinisterioSlug.TECNICA and PapelSlug.AUDIO in v.papeis
    ]
    assert len(ativos_audio) > 1
    valores = [cnt[n] for n in ativos_audio]
    assert valores
    diff = max(valores) - min(valores)
    n_dom = len(
        {
            c.data
            for c in out
            if c.ministerio is MinisterioSlug.TECNICA
            and c.tipo is TipoCulto.DOMINICAL_MANHA
        }
    )
    m = len(ativos_audio)
    limite = 2 if (n_dom % m) != 0 else 1
    assert diff <= limite


def test_ca04_rn06_marina_somente_manha_e_yomara_somente_noite() -> None:
    out, _ = _run_mes_integracao(voluntarios_seed_spec(), [])
    vols = voluntarios_seed_spec()
    nome_sm = nome_backstage_somente_manha(vols)
    nome_sn = nome_backstage_somente_noite(vols)
    ev_por_chave = {(e.data, e.nome): e for e in eventos_mes_teste_integracao()}
    for c in out:
        nomes = {a.membro for a in c.alocacoes}
        if nome_sm in nomes:
            assert c.tipo is not TipoCulto.DOMINICAL_NOITE
            if c.tipo is TipoCulto.ESPECIAL and c.nome:
                ev = ev_por_chave.get((c.data, c.nome))
                assert ev is not None
                h = int(ev.horario_inicio.split(":")[0])
                assert h < 12
        if nome_sn in nomes:
            assert c.tipo is not TipoCulto.DOMINICAL_MANHA
            if c.tipo is TipoCulto.ESPECIAL and c.nome:
                ev = ev_por_chave.get((c.data, c.nome))
                assert ev is not None
                h = int(ev.horario_inicio.split(":")[0])
                assert h >= 12

    def _participacoes_backstage(nome: str) -> int:
        n = 0
        for c in out:
            if c.ministerio is not MinisterioSlug.BACKSTAGE:
                continue
            for a in c.alocacoes:
                if a.membro == nome and not a.trainee:
                    n += 1
        return n

    for v in vols:
        if v.ministerio is not MinisterioSlug.BACKSTAGE or not v.ativo:
            continue
        if not v.papeis:
            continue
        assert _participacoes_backstage(v.nome) <= 2


def test_ca04_rn06_prioridade_empate_participacoes() -> None:
    """RN-05 + RN-06: (participações, restrição×período); empate em participações favorece somente_manha/noite."""
    est = _Estado(bloqueios=set())
    # Identificadores sintéticos (não ligados a ``volunteers.yml``).
    n_sm = "rn06_sm"
    n_livre = "rn06_livre"
    n_terc = "rn06_terc"
    n_sn = "rn06_sn"
    n_noite_livre = "rn06_noite_livre"
    n_aud_sm = "rn06_aud_sm"
    n_aud_livre = "rn06_aud_livre"

    v_sm = Voluntario(
        nome=n_sm,
        ministerio=MinisterioSlug.BACKSTAGE,
        papeis=[PapelSlug.PALCO, PapelSlug.TECNICA_BS],
        treinamento=[],
        restricoes=[RestricaoTipo.SOMENTE_MANHA],
        ativo=True,
    )
    v_livre = Voluntario(
        nome=n_livre,
        ministerio=MinisterioSlug.BACKSTAGE,
        papeis=[PapelSlug.PALCO, PapelSlug.TECNICA_BS],
        treinamento=[],
        restricoes=[],
        ativo=True,
    )
    v_terc = Voluntario(
        nome=n_terc,
        ministerio=MinisterioSlug.BACKSTAGE,
        papeis=[PapelSlug.PALCO, PapelSlug.TECNICA_BS],
        treinamento=[],
        restricoes=[],
        ativo=True,
    )
    culto_manha = CultoGerado(
        data="2025-04-06",
        tipo=TipoCulto.DOMINICAL_MANHA,
        nome=None,
        ministerio=MinisterioSlug.BACKSTAGE,
        alocacoes=[],
    )
    est.participacao_mes[n_sm] = 0
    est.participacao_mes[n_livre] = 0
    assert _chave_selecao(est, v_sm, PapelSlug.PALCO, culto_manha, None)[:2] == (0, 0)
    assert _chave_selecao(est, v_livre, PapelSlug.PALCO, culto_manha, None)[:2] == (0, 1)
    esc_ma = _escolher(
        [v_livre, v_sm], PapelSlug.PALCO, est, culto_manha, None
    )
    assert esc_ma is not None
    assert esc_ma.nome == n_sm

    est.participacao_mes[n_sm] = 2
    est.participacao_mes[n_livre] = 1
    assert _chave_selecao(est, v_sm, PapelSlug.PALCO, culto_manha, None)[:2] == (2, 0)
    assert _chave_selecao(est, v_livre, PapelSlug.PALCO, culto_manha, None)[:2] == (1, 1)
    esc_menos = _escolher([v_sm, v_livre], PapelSlug.PALCO, est, culto_manha, None)
    assert esc_menos is not None
    assert esc_menos.nome == n_livre

    est.participacao_mes[n_sm] = 1
    est.participacao_mes[n_terc] = 1
    esc_m = _escolher(
        [v_terc, v_sm], PapelSlug.PALCO, est, culto_manha, None
    )
    assert esc_m is not None
    assert esc_m.nome == n_sm

    v_sn = Voluntario(
        nome=n_sn,
        ministerio=MinisterioSlug.BACKSTAGE,
        papeis=[PapelSlug.PALCO, PapelSlug.TECNICA_BS],
        treinamento=[],
        restricoes=[RestricaoTipo.SOMENTE_NOITE],
        ativo=True,
    )
    v_noite_livre = Voluntario(
        nome=n_noite_livre,
        ministerio=MinisterioSlug.BACKSTAGE,
        papeis=[PapelSlug.PALCO, PapelSlug.TECNICA_BS],
        treinamento=[],
        restricoes=[],
        ativo=True,
    )
    culto_noite = CultoGerado(
        data="2025-04-06",
        tipo=TipoCulto.DOMINICAL_NOITE,
        nome=None,
        ministerio=MinisterioSlug.BACKSTAGE,
        alocacoes=[],
    )
    est.participacao_mes[n_sn] = 1
    est.participacao_mes[n_noite_livre] = 1
    esc_n = _escolher(
        [v_noite_livre, v_sn], PapelSlug.PALCO, est, culto_noite, None
    )
    assert esc_n is not None
    assert esc_n.nome == n_sn

    audio_sm = Voluntario(
        nome=n_aud_sm,
        ministerio=MinisterioSlug.TECNICA,
        papeis=[PapelSlug.AUDIO],
        treinamento=[],
        restricoes=[RestricaoTipo.SOMENTE_MANHA],
        ativo=True,
    )
    audio_livre = Voluntario(
        nome=n_aud_livre,
        ministerio=MinisterioSlug.TECNICA,
        papeis=[PapelSlug.AUDIO],
        treinamento=[],
        restricoes=[],
        ativo=True,
    )
    est.participacao_mes[n_aud_sm] = 0
    est.participacao_mes[n_aud_livre] = 0
    culto_tec_manha = CultoGerado(
        data="2025-04-06",
        tipo=TipoCulto.DOMINICAL_MANHA,
        nome=None,
        ministerio=MinisterioSlug.TECNICA,
        alocacoes=[],
    )
    esc_t = _escolher(
        [audio_livre, audio_sm],
        PapelSlug.AUDIO,
        est,
        culto_tec_manha,
        None,
    )
    assert esc_t is not None
    assert esc_t.nome == n_aud_sm


def test_ca05_copa_cristovao_audio_fixo() -> None:
    esperado = membro_alocacao_fixa_audio_evento_copa(dados_seed().eventos)
    out, _ = _run_mes_integracao(voluntarios_seed_spec(), [])
    for c in out:
        if c.tipo is not TipoCulto.ESPECIAL or not c.nome or "Copa" not in c.nome:
            continue
        if c.ministerio is not MinisterioSlug.TECNICA:
            continue
        aud = [a for a in c.alocacoes if a.papel is PapelSlug.AUDIO and not a.trainee]
        assert len(aud) == 1
        assert aud[0].membro == esperado
        assert aud[0].fixada is True


def test_ca06_copa_somente_audio() -> None:
    out, _ = _run_mes_integracao(voluntarios_seed_spec(), [])
    for c in out:
        if c.tipo is not TipoCulto.ESPECIAL or not c.nome or "Copa" not in c.nome:
            continue
        if c.ministerio is not MinisterioSlug.TECNICA:
            continue
        papeis = {a.papel for a in c.alocacoes}
        assert papeis == {PapelSlug.AUDIO}


def test_ca07_indisponibilidade_bloqueia_data() -> None:
    vols = voluntarios_seed_spec()
    bloqueado = primeiro_nome_ordenado(
        vols,
        lambda v: (
            v.ministerio is MinisterioSlug.TECNICA
            and PapelSlug.AUDIO in v.papeis
            and v.ativo
        ),
    )
    domingo = primeiro_domingo_do_mes(MES_TESTE_INTEGRACAO)
    ind = [
        Indisponibilidade(nome=bloqueado, data=domingo, motivo="teste"),
    ]
    out, _ = _run_mes_integracao(vols, ind)
    for c in out:
        if c.data != domingo:
            continue
        for a in c.alocacoes:
            assert a.membro != bloqueado


def test_rn04_indisponibilidade_parcial_turnos_manha_noite() -> None:
    """
    RN-04 com SPEC novo: ausência com turnos [manha] bloqueia só manhã; [noite] só noite.
    """
    est = _Estado(bloqueios=set(), indisponibilidades=[])
    est.indisponibilidades = [
        Indisponibilidade(nome="X", data="2025-04-06", turnos=["manha"]),
        Indisponibilidade(nome="Y", data="2025-04-06", turnos=["noite"]),
        Indisponibilidade(nome="Z", data="2025-04-06", turnos=None),
    ]
    # Bloqueio de dia inteiro só para Z.
    est.bloqueios = {("Z", "2025-04-06")}

    culto_m = CultoGerado(
        data="2025-04-06",
        tipo=TipoCulto.DOMINICAL_MANHA,
        nome=None,
        ministerio=MinisterioSlug.BACKSTAGE,
        alocacoes=[],
    )
    culto_n = CultoGerado(
        data="2025-04-06",
        tipo=TipoCulto.DOMINICAL_NOITE,
        nome=None,
        ministerio=MinisterioSlug.BACKSTAGE,
        alocacoes=[],
    )

    assert est.bloqueado("X", "2025-04-06", culto_m.tipo, None) is True
    assert est.bloqueado("X", "2025-04-06", culto_n.tipo, None) is False

    assert est.bloqueado("Y", "2025-04-06", culto_m.tipo, None) is False
    assert est.bloqueado("Y", "2025-04-06", culto_n.tipo, None) is True

    # Z sem turnos: bloqueia o dia inteiro
    assert est.bloqueado("Z", "2025-04-06", culto_m.tipo, None) is True
    assert est.bloqueado("Z", "2025-04-06", culto_n.tipo, None) is True


def test_ca08_trainee_nunca_primario() -> None:
    out, _ = _run_mes_integracao(voluntarios_seed_spec(), [])
    for c in out:
        primeiro_papel: set[PapelSlug] = set()
        for a in c.alocacoes:
            if a.papel not in primeiro_papel:
                assert not a.trainee, "Primeira alocação do papel não pode ser trainee"
                primeiro_papel.add(a.papel)


def test_ca11_rn11_trainee_gustavo_fagundes_limite_e_espacamento() -> None:
    """RN-11: ≤2 aparições como trainee; 2.ª no mesmo papel só após toda a coorte ≥1 nesse papel."""
    vols = voluntarios_seed_spec()
    out, _ = _run_mes_integracao(vols, [])
    gf = nome_trainee_backstage_palco_tecnica(vols)

    def _cohorte_bs(papel: PapelSlug) -> list[Voluntario]:
        return [
            v
            for v in vols
            if v.ministerio is MinisterioSlug.BACKSTAGE
            and v.ativo
            and RestricaoTipo.APENAS_MANUAL not in v.restricoes
            and papel in v.treinamento
        ]

    cnt_palco: dict[str, int] = {}
    cnt_tec: dict[str, int] = {}
    aparicoes: list[str] = []

    for c in sorted(out, key=lambda x: (x.data, x.tipo.value)):
        if c.ministerio is not MinisterioSlug.BACKSTAGE:
            continue
        for a in c.alocacoes:
            if not a.trainee:
                continue
            if a.membro == gf:
                aparicoes.append(c.data)
            if a.papel is PapelSlug.PALCO:
                if a.membro == gf and cnt_palco.get(gf, 0) == 1:
                    for w in _cohorte_bs(PapelSlug.PALCO):
                        assert cnt_palco.get(w.nome, 0) >= 1, (
                            f"2.ª de {gf} em PALCO antes de toda a coorte ter 1ª"
                        )
                cnt_palco[a.membro] = cnt_palco.get(a.membro, 0) + 1
            elif a.papel is PapelSlug.TECNICA_BS:
                if a.membro == gf and cnt_tec.get(gf, 0) == 1:
                    for w in _cohorte_bs(PapelSlug.TECNICA_BS):
                        assert cnt_tec.get(w.nome, 0) >= 1, (
                            f"2.ª de {gf} em TÉCNICA antes de toda a coorte ter 1ª"
                        )
                cnt_tec[a.membro] = cnt_tec.get(a.membro, 0) + 1

    assert len(aparicoes) <= 2
    assert cnt_palco.get(gf, 0) + cnt_tec.get(gf, 0) == len(aparicoes)

    domingos = sorted(
        {
            c.data
            for c in out
            if c.tipo in (TipoCulto.DOMINICAL_MANHA, TipoCulto.DOMINICAL_NOITE)
        }
    )
    idx_por_data = {d: i for i, d in enumerate(domingos)}
    idxs = sorted({idx_por_data[d] for d in set(aparicoes) if d in idx_por_data})
    for i in range(len(idxs) - 1):
        assert idxs[i + 1] > idxs[i]
    if len(idxs) >= 2 and len(domingos) > 2:
        for i in range(len(idxs) - 1):
            assert idxs[i + 1] - idxs[i] >= 2, (
                "trainee em domingos consecutivos do mês quando havia domingo intermédio"
            )


def test_ca12_rn12_gustavo_fagundes_sem_evento_especial() -> None:
    out, _ = _run_mes_integracao(voluntarios_seed_spec(), [])
    gf = nome_trainee_backstage_palco_tecnica(voluntarios_seed_spec())
    for c in out:
        if c.tipo is not TipoCulto.ESPECIAL:
            continue
        assert gf not in {a.membro for a in c.alocacoes}


@pytest.mark.parametrize(
    "modo_tecnica",
    [ModoEscala.EQUIPE_UNICA, ModoEscala.INDEPENDENTE],
    ids=["equipe_unica", "independente"],
)
def test_ca13_rn13_duplas_audio_projecao_tecnica(modo_tecnica: ModoEscala) -> None:
    """RN-13 Técnica: par áudio+projeção no mesmo culto (manhã ou noite), em qualquer modo.

    Com ``independente``, manhã e noite alocam-se à parte mas o pareamento aplica-se
    em cada turno; com ``equipe_unica``, a réplica mantém o par nos dois turnos.
    """
    dados = dados_seed()
    out, _ = _run_mes_integracao(
        voluntarios_seed_spec(),
        [],
        modos_override={MinisterioSlug.TECNICA: modo_tecnica},
    )
    aud_tec, prj_tec = par_tecnica_projecao_audio(dados.pares, dados.voluntarios)
    for c in out:
        if c.ministerio is not MinisterioSlug.TECNICA:
            continue
        if c.tipo not in (TipoCulto.DOMINICAL_MANHA, TipoCulto.DOMINICAL_NOITE):
            continue
        prims = [a for a in c.alocacoes if not a.trainee]
        nomes = {a.membro for a in prims}
        aud = {a.membro for a in prims if a.papel is PapelSlug.AUDIO}
        prj = {a.membro for a in prims if a.papel is PapelSlug.PROJECAO}
        if prj_tec in prj:
            assert aud_tec in aud, f"{c.data}: projeção do par sem áudio do par"
        # RN-02 (independente): parceiro pode estar bloqueado noutro turno do mesmo dia.
        if aud_tec in aud and prj_tec in nomes:
            assert prj_tec in prj, f"{c.data}: áudio do par com parceira no culto mas não em projeção"
        if prj_tec in prj and aud_tec in nomes:
            assert aud_tec in aud, f"{c.data}: projeção do par com parceiro no culto mas não em áudio"


def test_ca14_rn02_backstage_no_maximo_uma_vez_por_dia() -> None:
    out, _ = _run_mes_integracao(voluntarios_seed_spec(), [])
    for c in out:
        if c.ministerio is not MinisterioSlug.BACKSTAGE:
            continue
        nomes = [a.membro for a in c.alocacoes if not a.trainee]
        if len(set(nomes)) <= 1:
            continue
        assert len(nomes) == len(set(nomes)), f"{c.data} {c.tipo}: duplicata indevida {nomes}"


def test_ca15_rn14_casa_de_oracao_pessoa_unica() -> None:
    out, _ = _run_mes_integracao(voluntarios_seed_spec(), [])
    for c in out:
        if c.tipo is not TipoCulto.ESPECIAL or not c.nome or "Casa" not in c.nome:
            continue
        if c.ministerio is not MinisterioSlug.BACKSTAGE:
            continue
        prim = [a for a in c.alocacoes if not a.trainee]
        assert len(prim) >= 2
        nomes = {a.membro for a in prim}
        assert len(nomes) == 1
        palco = next(a for a in prim if a.papel is PapelSlug.PALCO)
        tec = next(a for a in prim if a.papel is PapelSlug.TECNICA_BS)
        assert palco.membro == tec.membro


def test_ca16_rn15_cobertura_quando_slots_suficientes(tmp_path: Path) -> None:
    """RN-15: com cultos dominicais suficientes, todos com papel ativo devem aparecer."""
    import yaml

    (tmp_path / "events.yml").write_text("[]\n", encoding="utf-8")
    (tmp_path / "unavailability.yml").write_text("[]\n", encoding="utf-8")
    (tmp_path / "volunteers.yml").write_text(
        yaml.dump(
            [
                {
                    "nome": "Um Áudio",
                    "ministerio": "tecnica",
                    "papeis": ["audio"],
                    "treinamento": [],
                    "restricoes": [],
                    "ativo": True,
                },
                {
                    "nome": "Dois Áudio",
                    "ministerio": "tecnica",
                    "papeis": ["audio"],
                    "treinamento": [],
                    "restricoes": [],
                    "ativo": True,
                },
            ]
        ),
        encoding="utf-8",
    )
    dados = carregar_tudo(tmp_path)
    cultos = gerar_cultos_do_mes(MES_TESTE_INTEGRACAO, tmp_path)
    _, _, nao = alocar_escala(
        MES_TESTE_INTEGRACAO,
        dados.voluntarios,
        [],
        [],
        cultos,
        pares=dados.pares,
        pares_cross=dados.pares_cross,
    )
    assert nao == []


def test_ca17_rn16_gustavo_trovalim_apenas_manual() -> None:
    out, nao = _run_mes_integracao(voluntarios_seed_spec(), [])
    gt = nome_apenas_manual_tecnica_audio(voluntarios_seed_spec())
    for c in out:
        assert gt not in {a.membro for a in c.alocacoes}
    assert gt not in {n for n, _ in nao}


def test_ca18_rn17_preferencia_par_cross_no_desempate() -> None:
    """RN-17: culto preferencial entra na chave após RN-06 (índice 2 = 0 se preferido)."""
    est = _Estado(bloqueios=set())
    nome = "Parceira Cross"
    est.preferencial_rn17[nome] = {
        ("2026-04-06", TipoCulto.DOMINICAL_MANHA.value),
    }
    v = Voluntario(
        nome=nome,
        ministerio=MinisterioSlug.BACKSTAGE,
        papeis=[PapelSlug.PALCO, PapelSlug.TECNICA_BS],
        treinamento=[],
        restricoes=[],
        ativo=True,
    )
    culto_pref = CultoGerado(
        data="2026-04-06",
        tipo=TipoCulto.DOMINICAL_MANHA,
        nome=None,
        ministerio=MinisterioSlug.BACKSTAGE,
        alocacoes=[],
    )
    culto_outro = CultoGerado(
        data="2026-04-13",
        tipo=TipoCulto.DOMINICAL_MANHA,
        nome=None,
        ministerio=MinisterioSlug.BACKSTAGE,
        alocacoes=[],
    )
    assert _chave_selecao(est, v, PapelSlug.PALCO, culto_pref, None)[2] == 0
    assert _chave_selecao(est, v, PapelSlug.PALCO, culto_outro, None)[2] == 1


def test_ca18_rn17_fallback_prioridade_2_duas_participacoes_rn05() -> None:
    """CA-18: Prioridade 2 em dois turnos conta duas vezes em RN-05; inibido se já há ≥1."""
    D = "2026-04-06"
    eq, bs = "Gustavo Serafim CA18", "Camilla Serafim CA18"
    gustavo = Voluntario(
        nome=eq,
        ministerio=MinisterioSlug.TECNICA,
        papeis=[PapelSlug.ILUMINACAO],
        treinamento=[],
        restricoes=[],
        ativo=True,
    )
    camilla = Voluntario(
        nome=bs,
        ministerio=MinisterioSlug.BACKSTAGE,
        papeis=[PapelSlug.PALCO, PapelSlug.TECNICA_BS],
        treinamento=[],
        restricoes=[],
        ativo=True,
    )
    bob = Voluntario(
        nome="Bob Palco CA18",
        ministerio=MinisterioSlug.BACKSTAGE,
        papeis=[PapelSlug.PALCO, PapelSlug.TECNICA_BS],
        treinamento=[],
        restricoes=[],
        ativo=True,
    )
    alice = Voluntario(
        nome="Alice Palco CA18",
        ministerio=MinisterioSlug.BACKSTAGE,
        papeis=[PapelSlug.PALCO, PapelSlug.TECNICA_BS],
        treinamento=[],
        restricoes=[],
        ativo=True,
    )
    ch_m = Voluntario(
        nome="Charlie Tec CA18",
        ministerio=MinisterioSlug.BACKSTAGE,
        papeis=[PapelSlug.PALCO, PapelSlug.TECNICA_BS],
        treinamento=[],
        restricoes=[],
        ativo=True,
    )
    ch_n = Voluntario(
        nome="Dan Tec CA18",
        ministerio=MinisterioSlug.BACKSTAGE,
        papeis=[PapelSlug.PALCO, PapelSlug.TECNICA_BS],
        treinamento=[],
        restricoes=[],
        ativo=True,
    )
    vols = [gustavo, camilla, bob, alice, ch_m, ch_n]
    por_nome = {v.nome: v for v in vols}
    modos = {
        MinisterioSlug.TECNICA: ModoEscala.EQUIPE_UNICA,
        MinisterioSlug.BACKSTAGE: ModoEscala.INDEPENDENTE,
    }

    def _cultos_iniciais() -> list[CultoGerado]:
        return [
            CultoGerado(
                data=D,
                tipo=TipoCulto.DOMINICAL_MANHA,
                nome=None,
                ministerio=MinisterioSlug.TECNICA,
                alocacoes=[
                    Alocacao(
                        membro=eq,
                        papel=PapelSlug.ILUMINACAO,
                        trainee=False,
                        fixada=False,
                    ),
                ],
            ),
            CultoGerado(
                data=D,
                tipo=TipoCulto.DOMINICAL_MANHA,
                nome=None,
                ministerio=MinisterioSlug.BACKSTAGE,
                alocacoes=[
                    Alocacao(
                        membro=bob.nome,
                        papel=PapelSlug.PALCO,
                        trainee=False,
                        fixada=False,
                    ),
                    Alocacao(
                        membro=ch_m.nome,
                        papel=PapelSlug.TECNICA_BS,
                        trainee=False,
                        fixada=False,
                    ),
                ],
            ),
            CultoGerado(
                data=D,
                tipo=TipoCulto.DOMINICAL_NOITE,
                nome=None,
                ministerio=MinisterioSlug.BACKSTAGE,
                alocacoes=[
                    Alocacao(
                        membro=alice.nome,
                        papel=PapelSlug.PALCO,
                        trainee=False,
                        fixada=False,
                    ),
                    Alocacao(
                        membro=ch_n.nome,
                        papel=PapelSlug.TECNICA_BS,
                        trainee=False,
                        fixada=False,
                    ),
                ],
            ),
        ]

    est0 = _Estado(bloqueios=set())
    est0.participacao_mes[eq] = 1
    est0.participacao_mes[bob.nome] = 1
    est0.participacao_mes[alice.nome] = 1
    est0.participacao_mes[ch_m.nome] = 1
    est0.participacao_mes[ch_n.nome] = 1
    cultos0 = _cultos_iniciais()
    _rn17_pos_fallback_pares_cross(
        cultos0,
        est0,
        por_nome,
        [(eq, bs)],
        [],
        modos,
    )
    assert est0.participacao_mes[bs] == 2
    prim_m = [a for a in cultos0[1].alocacoes if not a.trainee and a.papel is PapelSlug.PALCO]
    prim_n = [a for a in cultos0[2].alocacoes if not a.trainee and a.papel is PapelSlug.PALCO]
    assert len(prim_m) == 1 and prim_m[0].membro == bs
    assert len(prim_n) == 1 and prim_n[0].membro == bs

    est1 = _Estado(bloqueios=set())
    est1.participacao_mes[eq] = 1
    est1.participacao_mes[bob.nome] = 1
    est1.participacao_mes[alice.nome] = 1
    est1.participacao_mes[ch_m.nome] = 1
    est1.participacao_mes[ch_n.nome] = 1
    est1.participacao_mes[bs] = 1
    cultos1 = _cultos_iniciais()
    _rn17_pos_fallback_pares_cross(
        cultos1,
        est1,
        por_nome,
        [(eq, bs)],
        [],
        modos,
    )
    assert est1.participacao_mes[bs] == 1
    assert any(a.membro == bob.nome for a in cultos1[1].alocacoes)
    assert any(a.membro == alice.nome for a in cultos1[2].alocacoes)
