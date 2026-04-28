-- Escopo da indisponibilidade: cultos (domingo manhã/noite), eventos (culto especial), ambos (comportamento legado).
alter table indisponibilidades
  add column if not exists escopo text not null default 'ambos'
  check (escopo in ('cultos', 'eventos', 'ambos'));

comment on column indisponibilidades.escopo is
  'cultos: bloqueia só cultos dominicais (turnos); eventos: só eventos no dia; ambos: regras de culto e de evento.';
