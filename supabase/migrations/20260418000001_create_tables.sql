-- Extensões necessárias
create extension if not exists "pgcrypto";

-- ─── config_ministerios ───────────────────────────────────────────────────────
create table if not exists config_ministerios (
  slug  text primary key check (slug in ('tecnica', 'backstage')),
  modo  text not null     check (modo in ('equipe_unica', 'independente'))
);

-- ─── voluntarios ─────────────────────────────────────────────────────────────
create table if not exists voluntarios (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null unique,
  ministerio   text not null check (ministerio in ('tecnica', 'backstage')),
  papeis       text[] not null default '{}',
  treinamento  text[] not null default '{}',
  restricoes   text[] not null default '{}',
  ativo        boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ─── pares ───────────────────────────────────────────────────────────────────
create table if not exists pares (
  id          uuid primary key default gen_random_uuid(),
  membro_1    uuid not null references voluntarios(id) on delete cascade,
  membro_2    uuid not null references voluntarios(id) on delete cascade,
  ministerio  text check (ministerio in ('tecnica', 'backstage')),
  tipo        text not null check (tipo in ('par', 'par_cross')),
  constraint pares_ordem check (membro_1 < membro_2),
  constraint pares_unique unique (membro_1, membro_2)
);

-- ─── indisponibilidades ───────────────────────────────────────────────────────
create table if not exists indisponibilidades (
  id              uuid primary key default gen_random_uuid(),
  voluntario_id   uuid not null references voluntarios(id) on delete cascade,
  data            date not null,
  turnos          text[] not null default '{}'
    check (turnos <@ array['manha','noite']::text[])
);

create index if not exists idx_indisponibilidades_vol_data
  on indisponibilidades(voluntario_id, data);

-- ─── eventos ─────────────────────────────────────────────────────────────────
create table if not exists eventos (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  data             date not null,
  horario_inicio   time not null,
  horario_fim      time,
  ministerios      text[] not null check (ministerios <@ array['tecnica','backstage']::text[]),
  papeis           text[] not null default '{}',
  pessoa_unica     boolean not null default false
);

-- ─── alocacoes_fixas ─────────────────────────────────────────────────────────
create table if not exists alocacoes_fixas (
  id              uuid primary key default gen_random_uuid(),
  evento_id       uuid not null references eventos(id) on delete cascade,
  papel           text not null,
  voluntario_id   uuid not null references voluntarios(id) on delete cascade
);

-- ─── escalas ─────────────────────────────────────────────────────────────────
create table if not exists escalas (
  id           uuid primary key default gen_random_uuid(),
  mes          text not null check (mes ~ '^\d{4}-\d{2}$'),
  ministerio   text not null check (ministerio in ('tecnica', 'backstage')),
  gerada_em    timestamptz not null default now(),
  alertas      jsonb not null default '[]',
  constraint escalas_mes_ministerio_unique unique (mes, ministerio)
);

-- ─── alocacoes ───────────────────────────────────────────────────────────────
create table if not exists alocacoes (
  id              uuid primary key default gen_random_uuid(),
  escala_id       uuid not null references escalas(id) on delete cascade,
  data            date not null,
  tipo_culto      text not null
    check (tipo_culto in ('dominical_manha', 'dominical_noite', 'especial')),
  nome_evento     text,
  papel           text not null,
  voluntario_id   uuid not null references voluntarios(id) on delete cascade,
  trainee         boolean not null default false,
  fixada          boolean not null default false
);

create index if not exists idx_alocacoes_escala
  on alocacoes(escala_id);

create index if not exists idx_alocacoes_voluntario_data
  on alocacoes(voluntario_id, data);

-- ─── Row Level Security ───────────────────────────────────────────────────────
alter table config_ministerios   enable row level security;
alter table voluntarios          enable row level security;
alter table pares                enable row level security;
alter table indisponibilidades   enable row level security;
alter table eventos              enable row level security;
alter table alocacoes_fixas      enable row level security;
alter table escalas              enable row level security;
alter table alocacoes            enable row level security;

-- Acesso total apenas para usuários autenticados
create policy "autenticado_tudo" on config_ministerios
  for all using (auth.role() = 'authenticated');

create policy "autenticado_tudo" on voluntarios
  for all using (auth.role() = 'authenticated');

create policy "autenticado_tudo" on pares
  for all using (auth.role() = 'authenticated');

create policy "autenticado_tudo" on indisponibilidades
  for all using (auth.role() = 'authenticated');

create policy "autenticado_tudo" on eventos
  for all using (auth.role() = 'authenticated');

create policy "autenticado_tudo" on alocacoes_fixas
  for all using (auth.role() = 'authenticated');

create policy "autenticado_tudo" on escalas
  for all using (auth.role() = 'authenticated');

create policy "autenticado_tudo" on alocacoes
  for all using (auth.role() = 'authenticated');
