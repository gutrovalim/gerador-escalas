-- Alocações fixas por culto dominical (manhã/noite), por mês de referência da escala.

create table if not exists alocacoes_fixas_culto (
  id              uuid primary key default gen_random_uuid(),
  mes             text not null check (mes ~ '^\d{4}-\d{2}$'),
  data            date not null,
  tipo_culto      text not null check (tipo_culto in ('dominical_manha', 'dominical_noite')),
  ministerio      text not null check (ministerio in ('tecnica', 'backstage')),
  papel           text not null,
  voluntario_id   uuid not null references voluntarios(id) on delete cascade,
  constraint aloc_fixas_culto_unique unique (mes, data, tipo_culto, ministerio, papel)
);

create index if not exists idx_aloc_fixas_culto_mes_min on alocacoes_fixas_culto(mes, ministerio);

alter table alocacoes_fixas_culto enable row level security;

create policy "autenticado_tudo" on alocacoes_fixas_culto
  for all using (auth.role() = 'authenticated');
