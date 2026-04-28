alter table eventos
  add column if not exists ativo boolean not null default true;

create index if not exists idx_eventos_ativo
  on eventos(ativo);
