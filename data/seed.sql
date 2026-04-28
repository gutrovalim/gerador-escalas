-- Seed inicial: configuração de ministérios e voluntários
-- Compatível com Supabase/Postgres
-- Executar após a migration 20260418000001_create_tables.sql

-- ─── Configuração de ministérios ─────────────────────────────────────────────
insert into config_ministerios (slug, modo) values
  ('tecnica',   'equipe_unica'),
  ('backstage', 'independente')
on conflict (slug) do update set modo = excluded.modo;

-- ─── Voluntários — Técnica ────────────────────────────────────────────────────

-- Áudio
insert into voluntarios (nome, ministerio, papeis, treinamento, restricoes, ativo) values
  ('André Oliveira',    'tecnica', '{audio}',    '{}', '{}',              true),
  ('Cristóvão Alves',   'tecnica', '{audio}',    '{}', '{}',              true),
  ('Jefferson Calixto', 'tecnica', '{audio}',    '{}', '{}',              true),
  ('Josué dos Santos',  'tecnica', '{audio}',    '{}', '{}',              true),
  ('Gustavo Trovalim',  'tecnica', '{audio}',    '{}', '{apenas_manual}', true)
on conflict (nome) do nothing;

-- Projeção
insert into voluntarios (nome, ministerio, papeis, treinamento, restricoes, ativo) values
  ('Gabriel Arcanjo',  'tecnica', '{projecao}', '{}',          '{}', true),
  ('George Belchior',  'tecnica', '{projecao}', '{}',          '{}', true),
  ('Isabela Aguilera', 'tecnica', '{projecao}', '{}',          '{}', true),
  ('William Fernando', 'tecnica', '{projecao}', '{}',          '{}', true),
  ('Ana Lessa',        'tecnica', '{}',         '{projecao}',  '{}', true),
  ('Thayla Nunes',     'tecnica', '{}',         '{projecao}',  '{}', true),
  ('Gabriel Lima',     'tecnica', '{}',         '{projecao}',  '{}', true)
on conflict (nome) do nothing;

-- Iluminação
insert into voluntarios (nome, ministerio, papeis, treinamento, restricoes, ativo) values
  ('Gustavo Serafim', 'tecnica', '{iluminacao}', '{}',           '{}', true),
  ('Osvaldo Migueis', 'tecnica', '{iluminacao}', '{}',           '{}', true),
  ('Lucas Rafael',    'tecnica', '{iluminacao}', '{}',           '{}', true),
  ('Luquinhas',       'tecnica', '{}',           '{iluminacao}', '{}', true)
on conflict (nome) do nothing;

-- ─── Voluntários — Backstage ──────────────────────────────────────────────────
insert into voluntarios (nome, ministerio, papeis, treinamento, restricoes, ativo) values
  ('Alanna Lima',       'backstage', '{palco,tecnica_bs}', '{}',              '{}',               true),
  ('Marina Nittani',    'backstage', '{palco,tecnica_bs}', '{}',              '{somente_manha}',  true),
  ('Anne Colbert',      'backstage', '{palco,tecnica_bs}', '{}',              '{}',               true),
  ('Augusto Afonso',    'backstage', '{palco,tecnica_bs}', '{}',              '{}',               true),
  ('Camilla Serafim',   'backstage', '{palco,tecnica_bs}', '{}',              '{}',               true),
  ('Débora Bispo',      'backstage', '{palco,tecnica_bs}', '{}',              '{}',               true),
  ('Lucas Bispo D',     'backstage', '{palco,tecnica_bs}', '{}',              '{}',               true),
  ('Lucas Bispo P',     'backstage', '{palco,tecnica_bs}', '{}',              '{}',               true),
  ('Yomara Sousa',      'backstage', '{palco,tecnica_bs}', '{}',              '{somente_noite}',  true),
  ('Aline Bispo',       'backstage', '{palco,tecnica_bs}', '{}',              '{}',               true),
  ('Michelle Cesare',   'backstage', '{palco,tecnica_bs}', '{}',              '{}',               true),
  ('Giovanna Lopes',    'backstage', '{palco,tecnica_bs}', '{}',              '{}',               true),
  ('Paloma Marques',    'backstage', '{palco,tecnica_bs}', '{}',              '{}',               true),
  ('Larissa Galafassi', 'backstage', '{palco,tecnica_bs}', '{}',              '{}',               true),
  ('Iale Auanne',       'backstage', '{palco,tecnica_bs}', '{}',              '{}',               true),
  ('Kathleen Lima',     'backstage', '{palco,tecnica_bs}', '{}',              '{}',               true),
  ('Gustavo Fagundes',  'backstage', '{}',                 '{palco,tecnica_bs}', '{}',            true)
on conflict (nome) do nothing;

-- Voluntários extras (data/volunteers.yml — necessários para data/unavailability.yml)
insert into voluntarios (nome, ministerio, papeis, treinamento, restricoes, ativo) values
  ('Carlos Oliveira', 'tecnica',     '{}', '{audio}', '{}', true),
  ('Paloma Bispo',    'backstage',   '{palco,tecnica_bs}', '{}', '{}', true),
  ('Rafael Santana',  'backstage',   '{}', '{palco,tecnica_bs}', '{}', true),
  ('Marcos Elias',    'backstage',   '{}', '{palco,tecnica_bs}', '{}', true),
  ('Ana Teresa',      'backstage',   '{palco,tecnica_bs}', '{}', '{}', true)
on conflict (nome) do nothing;

-- ─── Pares obrigatórios ───────────────────────────────────────────────────────
-- Garantir que membro_1 < membro_2 (constraint de ordem por UUID)
-- A inserção usa subconsultas para resolver os IDs e ordena antes de inserir

-- Par: Paloma Marques + Lucas Bispo P (Backstage)
insert into pares (membro_1, membro_2, ministerio, tipo)
select
  least(a.id, b.id),
  greatest(a.id, b.id),
  'backstage',
  'par'
from
  voluntarios a,
  voluntarios b
where
  a.nome = 'Paloma Marques'
  and b.nome = 'Lucas Bispo P'
on conflict (membro_1, membro_2) do nothing;

-- Par: Débora Bispo + Lucas Bispo D (Backstage)
insert into pares (membro_1, membro_2, ministerio, tipo)
select
  least(a.id, b.id),
  greatest(a.id, b.id),
  'backstage',
  'par'
from
  voluntarios a,
  voluntarios b
where
  a.nome = 'Débora Bispo'
  and b.nome = 'Lucas Bispo D'
on conflict (membro_1, membro_2) do nothing;

-- Par: Isabela Aguilera + André Oliveira (Técnica)
insert into pares (membro_1, membro_2, ministerio, tipo)
select
  least(a.id, b.id),
  greatest(a.id, b.id),
  'tecnica',
  'par'
from
  voluntarios a,
  voluntarios b
where
  a.nome = 'Isabela Aguilera'
  and b.nome = 'André Oliveira'
on conflict (membro_1, membro_2) do nothing;

-- Par cross: Gustavo Serafim (Técnica) + Camilla Serafim (Backstage)
insert into pares (membro_1, membro_2, ministerio, tipo)
select
  least(a.id, b.id),
  greatest(a.id, b.id),
  null,
  'par_cross'
from
  voluntarios a,
  voluntarios b
where
  a.nome = 'Gustavo Serafim'
  and b.nome = 'Camilla Serafim'
on conflict (membro_1, membro_2) do nothing;

-- ─── Eventos (abril 2026) — base: data/events.yml ─────────────────────────────

-- Copa da Onda
with ins as (
  insert into eventos (nome, data, horario_inicio, horario_fim, ministerios, papeis, pessoa_unica)
  values (
    'Copa da Onda',
    '2026-04-03',
    '09:00',
    '18:00',
    array['tecnica']::text[],
    array['audio']::text[],
    false
  )
  returning id
)
insert into alocacoes_fixas (evento_id, papel, voluntario_id)
select ins.id, 'audio', v.id from ins cross join voluntarios v where v.nome = 'Cristóvão Alves';

-- Casa de Oração
with ins as (
  insert into eventos (nome, data, horario_inicio, horario_fim, ministerios, papeis, pessoa_unica)
  values (
    'Casa de Oração',
    '2026-04-24',
    '20:00',
    '22:00',
    array['backstage', 'tecnica']::text[],
    array['audio', 'projecao', 'iluminacao', 'palco', 'tecnica_bs']::text[],
    false
  )
  returning id
)
insert into alocacoes_fixas (evento_id, papel, voluntario_id)
select ins.id, x.papel, v.id
from ins
cross join (values
  ('audio', 'Gustavo Trovalim'),
  ('projecao', 'Gustavo Trovalim'),
  ('iluminacao', 'Gustavo Trovalim')
) as x(papel, nome_vol)
join voluntarios v on v.nome = x.nome_vol;

-- ─── Ausências (abril 2026) — base: data/unavailability.yml ─────────────────
-- Sem `turnos` no YAML → dia inteiro (`'{}'`).
-- turnos explícitos → array conforme o arquivo.

insert into indisponibilidades (voluntario_id, data, turnos)
select v.id, x.d::date, x.t
from (values
  -- Backstage
  ('Rafael Santana',  '2026-04-05', array['manha','noite']::text[]),
  ('Rafael Santana',  '2026-04-12', array['manha']::text[]),
  ('Rafael Santana',  '2026-04-19', array['manha']::text[]),
  ('Rafael Santana',  '2026-04-24', array[]::text[]),
  ('Rafael Santana',  '2026-04-26', array['manha']::text[]),
  ('Débora Bispo', '2026-04-05', array['manha','noite']::text[]),
  ('Débora Bispo',    '2026-04-26', array['manha']::text[]),
  ('Lucas Bispo D',   '2026-04-05', array['manha','noite']::text[]),
  ('Lucas Bispo D',   '2026-04-26', array['manha']::text[]),
  ('Marina Nittani',  '2026-04-05', array['noite']::text[]),
  ('Marina Nittani',  '2026-04-12', array['manha','noite']::text[]),
  ('Marina Nittani',  '2026-04-19', array['noite']::text[]),
  ('Marina Nittani',  '2026-04-24', array[]::text[]),
  ('Marina Nittani',  '2026-04-26', array['noite']::text[]),
  ('Larissa Galafassi','2026-04-05', array['manha','noite']::text[]),
  ('Larissa Galafassi','2026-04-19', array['manha','noite']::text[]),
  ('Michelle Cesare', '2026-04-19', array['manha','noite']::text[]),
  ('Michelle Cesare', '2026-04-24', array[]::text[]),
  ('Alanna Lima',     '2026-04-05', array['manha','noite']::text[]),
  ('Alanna Lima',     '2026-04-12', array['manha','noite']::text[]),
  ('Marcos Elias',    '2026-04-12', array['manha','noite']::text[]),
  ('Marcos Elias',    '2026-04-24', array[]::text[]),
  ('Anne Colbert',    '2026-04-05', array['manha','noite']::text[]),
  ('Anne Colbert',    '2026-04-26', array['manha','noite']::text[]),
  ('Ana Teresa',      '2026-04-05', array['manha','noite']::text[]),
  ('Ana Teresa',      '2026-04-24', array[]::text[]),
  ('Ana Teresa',      '2026-04-26', array['manha']::text[]),
  ('Camilla Serafim', '2026-04-05', array['manha']::text[]),
  ('Camilla Serafim', '2026-04-12', array['manha','noite']::text[]),
  ('Camilla Serafim', '2026-04-24', array[]::text[]),
  ('Camilla Serafim', '2026-04-26', array['manha','noite']::text[]),
  ('Paloma Bispo',    '2026-04-05', array['manha','noite']::text[]),
  ('Paloma Bispo',    '2026-04-12', array['manha']::text[]),
  ('Paloma Bispo',    '2026-04-19', array['noite']::text[]),
  ('Paloma Bispo',    '2026-04-26', array['manha']::text[]),
  ('Lucas Bispo P',   '2026-04-05', array['manha','noite']::text[]),
  ('Lucas Bispo P',   '2026-04-12', array['manha']::text[]),
  ('Lucas Bispo P',   '2026-04-19', array['noite']::text[]),
  ('Lucas Bispo P',   '2026-04-26', array['manha']::text[]),
  -- Técnica
  ('Lucas Rafael',    '2026-04-05', array[]::text[]),
  ('Lucas Rafael',    '2026-04-12', array[]::text[]),
  ('Lucas Rafael',    '2026-04-19', array[]::text[]),
  ('Thayla Nunes',    '2026-04-26', array[]::text[]),
  ('Carlos Oliveira', '2026-04-12', array[]::text[]),
  ('Carlos Oliveira', '2026-04-26', array[]::text[]),
  ('Gustavo Trovalim','2026-04-05', array[]::text[]),
  ('Gustavo Trovalim','2026-04-12', array[]::text[]),
  ('Gustavo Trovalim','2026-04-26', array[]::text[])
) as x(n, d, t)
join voluntarios v on v.nome = x.n;
