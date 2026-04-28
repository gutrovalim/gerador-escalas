-- Adiciona soft-disable para duplas obrigatórias
alter table pares
  add column if not exists ativo boolean not null default true;

create index if not exists idx_pares_ativo
  on pares(ativo);

