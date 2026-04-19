# Gerador de Escalas — Suplemento de especificação

Este ficheiro documenta comportamentos de UI e otimizações de performance. **Se o repositório já contiver um `SPEC.md` mais longo**, funda estas secções nesse documento (ou mantém ambos e referencia este suplemento no índice).

---

## Confirmações modais (`useConfirm`)

Todas as ações que **gravam**, **eliminam** ou **alteram estado destrutivo** pedem confirmação num **diálogo modal** (`components/ConfirmDialog.tsx`, hook `useConfirm`). Não se usa `window.confirm` (incompatível com alguns ambientes embutidos).

| Área | Ação | Comportamento |
|------|------|----------------|
| **Navegação** | Sair | Confirma antes de `signOut`. |
| **Voluntários** | Salvar / Cancelar formulário | `VoluntarioForm`: confirma ao guardar e ao descartar cancelamento. |
| **Voluntários** | Ativar / desativar voluntário | Confirma antes do `update` de `ativo`. |
| **Voluntários** | Duplas obrigatórias — salvar / cancelar edição | Confirma ao guardar a dupla; ao cancelar, se houver membros escolhidos, confirma descarte. |
| **Voluntários** | Ativar / desativar dupla | Confirma antes do `update`. |
| **Eventos** | Excluir | Confirma com nome do evento; depois `delete`. |
| **Eventos** | Formulário (`EventoForm`) | Quando existir no projeto: confirmar ao **Salvar** e ao **Cancelar** (descartar), alinhado a `VoluntarioForm`. |
| **Ausências (por voluntário)** | Excluir linha | Confirma com data; depois `delete`. |
| **Ausências** | Formulário (`AusenciaForm`) | Quando existir no projeto: confirmar ao **Salvar** e ao **Cancelar**. |
| **Escalas** | Regerar com escala já existente | Modal substitui o antigo bloco amarelo “Sim, regerar”; confirma substituição. |
| **Escalas** | Guardar edição manual | Confirma antes do `PATCH` de alocações. |
| **Escalas** | Cancelar edição | Se houver alterações nos selects, confirma descarte. |
| **Configurações** | Guardar modos de ministério | Confirma antes do `upsert`. |

**Exportar CSV** e navegação entre páginas **não** pedem confirmação (apenas leitura ou navegação).

---

## Performance (melhorias aplicadas)

1. **Middleware** — `getSession()` em vez de `getUser()` para decisão de sessão no Edge (menos idas ao servidor de Auth por navegação). Rotas `/api/*` excluídas do `matcher` quando aplicável: autenticação continua nos handlers.
2. **Queries Supabase em paralelo** — Páginas que faziam vários `await` em série passaram a `Promise.all` (ex.: escalas, voluntários, eventos, indisponibilidade por voluntário).
3. **`app/(protected)/loading.tsx`** — Skeleton durante o carregamento do segmento protegido (melhor percepção de velocidade).
4. **`next.config.ts`** — `experimental.optimizePackageImports` para pacotes `@radix-ui/*` (chunks menores em produção).
5. **Lista de voluntários** — `select` com colunas explícitas em vez de `*`.
6. **Cliente Supabase no browser** — `useMemo(() => createClient(), [])` em componentes que usam o cliente em cada render (Nav, listagens, login, etc.).
7. **Bloqueio por ausência na edição da escala** — `lib/ausencia-alocacao.ts` + filtro nos `<select>` + validação no `PATCH` (documentado noutra parte do SPEC funcional).

---

## Ficheiros relevantes

- `components/ConfirmDialog.tsx` — `useConfirm()` + UI modal.
- Formulários que confirmam guardar/cancelar: `components/VoluntarioForm.tsx` (e, no repositório completo, `AusenciaForm`, `EventoForm` quando integrados da mesma forma).
