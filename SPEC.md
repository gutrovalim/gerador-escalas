# SPEC.md — Sistema de Escalas de Ministérios

## Visão Geral

Sistema local para geração automática de escalas mensais dos ministérios **Backstage** e
**Técnica** de uma igreja. O operador (líder) gerencia tudo editando arquivos YAML e
executa um único comando para gerar a escala. O sistema lê os arquivos, aplica as regras
de distribuição e restrições, e grava os resultados em arquivos de saída prontos para
compartilhar.

**Nenhum voluntário acessa ou edita o sistema.** Toda gestão é feita exclusivamente
pelo líder.

---

## Fora do Escopo (v1)

- Interface web ou mobile
- Notificações automáticas (WhatsApp, e-mail, push)
- Integração com Google Calendar ou qualquer API externa
- Autenticação ou multi-usuário
- Aprovação ou acesso pelos voluntários

---

## Arquitetura Geral

```
/data                        ← arquivos editados pelo líder
  volunteers.yml
  unavailability.yml
  events.yml

/output                      ← gerado automaticamente (não editar)
  escala-YYYY-MM-backstage.txt
  escala-YYYY-MM-backstage.csv
  escala-YYYY-MM-tecnica.txt
  escala-YYYY-MM-tecnica.csv

/src                         ← código
```

**Fluxo de uso:**
1. Líder edita `volunteers.yml`, `unavailability.yml` e/ou `events.yml`
2. Executa: `python generate.py --mes 2026-04`
3. Sistema lê os três arquivos, valida, gera escalas e grava em `/output`
4. Se já existir escala para o mês informado, o sistema pergunta antes de sobrescrever

---

## Formato dos Arquivos YAML

### `data/volunteers.yml`

Lista todos os voluntários de ambos os ministérios e define a configuração de cada
ministério. Este é o único lugar para adicionar novos membros, alterar papéis,
marcar treinamento, desativar alguém ou alterar o modo de escala de um ministério.

```yaml
# Ministério Técnica
- nome: Cristóvão Alves
  ministerio: tecnica
  papeis: [audio]
  treinamento: []
  restricoes: []
  ativo: true

- nome: Luquinhas
  ministerio: tecnica
  papeis: []
  treinamento: [iluminacao]
  restricoes: []
  ativo: true

# Ministério Backstage
- nome: Marina Nittani
  ministerio: backstage
  papeis: [palco, tecnica_bs]
  treinamento: []
  restricoes: [somente_manha]
  ativo: true

- nome: Gustavo Fagundes
  ministerio: backstage
  papeis: []
  treinamento: [palco, tecnica_bs]
  restricoes: []
  ativo: true
```

**Campos:**

| Campo         | Tipo       | Descrição                                                        |
|---------------|------------|------------------------------------------------------------------|
| `nome`        | string     | Nome completo (usado como identificador único)                   |
| `ministerio`  | enum       | `tecnica` ou `backstage`                                         |
| `papeis`      | string[]   | Papéis que exerce com responsabilidade plena                     |
| `treinamento` | string[]   | Papéis que está observando (célula amarela, sem responsabilidade)|
| `restricoes`  | string[]   | Restrições permanentes (ver tabela abaixo)                       |
| `ativo`       | boolean    | `false` = excluído das escalas sem apagar o histórico            |

Os pares obrigatórios são declarados numa seção separada no topo do arquivo:

```yaml
ministerios:
  - slug: tecnica
    modo: equipe_unica      # mesma equipe serve manhã e noite
  - slug: backstage
    modo: independente      # manhã e noite têm equipes distintas

pares:
  - membros: [Paloma Marques, Lucas Bispo P]
    ministerio: backstage
  - membros: [Débora Bispo, Lucas Bispo D]
    ministerio: backstage
  - membros: [Isabela Aguilera, André Oliveira]
    ministerio: tecnica

pares_cross:
  - membros: [Gustavo Serafim, Camilla Serafim]

voluntarios:
  - nome: Paloma Marques
    ...
```

Para mudar a Técnica para turnos independentes quando os trainees se formarem,
basta alterar `modo: equipe_unica` para `modo: independente` — sem tocar no código.

A seção `pares_cross` define pares entre ministérios diferentes — pessoas que devem
servir no mesmo dia, cada uma no seu ministério:

```yaml
pares_cross:
  - membros: [Gustavo Serafim, Camilla Serafim]
```

**Campos de `pares_cross`:**

| Campo     | Tipo      | Descrição                                                              |
|-----------|-----------|------------------------------------------------------------------------|
| `membros` | string[2] | Nomes exatos de voluntários de ministérios diferentes                  |

**Campos de `pares`:**

| Campo        | Tipo       | Descrição                                                          |
|--------------|------------|--------------------------------------------------------------------|
| `membros`    | string[2]  | Nomes exatos conforme `volunteers.yml`                             |
| `ministerio` | enum       | `backstage` ou `tecnica`                                           |

**Restrições permanentes disponíveis:**

| Valor           | Efeito                                                          |
|-----------------|-----------------------------------------------------------------|
| `somente_manha`   | Apenas `dominical_manha` e eventos especiais com início < 12h   |
| `somente_noite`   | Apenas `dominical_noite` e eventos especiais com início >= 12h  |
| `apenas_manual`   | Nunca escalado automaticamente. Só aparece via `alocacoes_fixas` |

---

### `data/unavailability.yml`

Indisponibilidades temporárias — quando um voluntário informa que não pode servir
em uma data específica. Não usar para restrições permanentes (essas ficam em
`volunteers.yml`).

```yaml
- nome: Josué dos Santos
  ausencias:
    - data: 2026-04-06
      turnos: [manha, noite]
    - data: 2026-04-13
      turnos: [manha]

- nome: Isabela Aguilera
  ausencias:
    - data: 2026-04-27   # sem turnos = dia inteiro bloqueado

- nome: Anne Colbert
  ausencias:
    - data: 2026-04-18   # evento especial — sem turnos
```

**Campos:**

| Campo     | Tipo     | Descrição                                                              |
|-----------|----------|------------------------------------------------------------------------|
| `nome`    | string   | Deve bater exatamente com o nome em `volunteers.yml`                   |
| `ausencias` | lista  | Lista de entradas de ausência                                          |
| `data`    | date     | Formato `YYYY-MM-DD`                                                   |
| `turnos`  | string[] | `[manha]`, `[noite]` ou `[manha, noite]`. Se omitido: dia inteiro     |

Eventos especiais não têm turno — omitir o campo `turnos` na entrada do evento.

---

### `data/events.yml`

Eventos especiais além dos cultos dominicais regulares. Cultos de domingo não
entram aqui — são gerados automaticamente pelo sistema a partir do mês informado.

```yaml
- nome: Copa da Onda
  data: 2026-04-03
  horario_inicio: "09:00"
  horario_fim: "18:00"
  ministerios: [tecnica]
  papeis: [audio]
  alocacoes_fixas:
    - papel: audio
      membro: Cristóvão Alves

- nome: HUB
  data: 2026-04-18
  horario_inicio: "15:00"
  horario_fim: "17:00"
  ministerios: [backstage, tecnica]

- nome: Casa de Oração
  data: 2026-04-24
  horario_inicio: "20:00"
  horario_fim: "22:00"
  ministerios: [backstage]
  pessoa_unica: true    # uma pessoa serve como PALCO e TÉCNICA simultaneamente
```

**Campos:**

| Campo             | Tipo       | Descrição                                                        |
|-------------------|------------|------------------------------------------------------------------|
| `nome`            | string     | Nome do evento                                                   |
| `data`            | date       | Formato `YYYY-MM-DD`                                             |
| `horario_inicio`  | time       | Formato `HH:MM`                                                  |
| `horario_fim`     | time       | Opcional                                                         |
| `ministerios`     | string[]   | Quais ministérios atuam no evento                                |
| `papeis`          | string[]   | Papéis exigidos. Se omitido: todos os papéis dos ministérios     |
| `alocacoes_fixas` | objeto[]   | Alocações pré-definidas que o algoritmo não deve sobrescrever    |
| `pessoa_unica`    | boolean    | Se `true`, uma única pessoa cobre todos os papéis do evento      |

---

## Modelo de Domínio Interno

```typescript
type MinisterioSlug = "backstage" | "tecnica"

type ModoEscala = "equipe_unica" | "independente"

type PapelSlug =
  | "palco"        // Backstage
  | "tecnica_bs"   // Backstage (slug distinto do ministério Técnica)
  | "audio"        // Técnica
  | "projecao"     // Técnica
  | "iluminacao"   // Técnica

type RestricaoTipo = "somente_manha"

interface Voluntario {
  nome: string
  ministerio: MinisterioSlug
  papeis: PapelSlug[]
  treinamento: PapelSlug[]
  restricoes: RestricaoTipo[]
  ativo: boolean
}

interface Indisponibilidade {
  nome: string
  data: string        // YYYY-MM-DD
  motivo?: string
}

interface ConfigMinisterio {
  slug: MinisterioSlug
  modo: ModoEscala
}

interface ParCross {
  membros: [string, string]   // nomes de voluntários de ministérios diferentes
}

interface Evento {
  nome: string
  data: string
  horario_inicio: string
  horario_fim?: string
  ministerios: MinisterioSlug[]
  papeis?: PapelSlug[]
  alocacoes_fixas?: AlocacaoFixa[]
}

interface AlocacaoFixa {
  papel: PapelSlug
  membro: string
}

interface Alocacao {
  membro: string
  papel: PapelSlug
  trainee: boolean    // true = observando, não conta para carga
  fixada: boolean     // true = definida pelo líder em events.yml
}

interface CultoGerado {
  data: string
  tipo: "dominical_manha" | "dominical_noite" | "especial"
  nome?: string
  ministerio: MinisterioSlug
  alocacoes: Alocacao[]
}
```

---

## Regras de Negócio

### RN-01 — Modo `equipe_unica`

Ministérios com `modo: equipe_unica` geram uma única alocação por domingo,
replicada automaticamente para `dominical_manha` e `dominical_noite`. Atualmente
aplicado à **Técnica**.

### RN-02 — Modo `independente`

Ministérios com `modo: independente` tratam `dominical_manha` e `dominical_noite`
como eventos distintos. A mesma pessoa não pode aparecer em nenhuma alocação ativa
duas vezes no mesmo dia, independentemente do papel. Atualmente aplicado ao **Backstage**.

Se não houver voluntários suficientes para garantir isso, o sistema alerta e usa
a melhor alocação disponível. Exceção: eventos com `pessoa_unica: true` (ver RN-14).

### RN-03 — Trainees

Voluntários com um papel em `treinamento` podem ser alocados naquele papel com
`trainee: true`. Esta alocação:
- Não substitui a alocação ativa obrigatória do papel
- Não conta para cálculo de carga (RN-05)
- Aparece no output com sufixo `(*)` abaixo do membro principal

### RN-04 — Indisponibilidade

Voluntário com data bloqueada em `unavailability.yml` não é alocado em nenhum
papel naquela data. Se um nome em `unavailability.yml` não corresponder a nenhum
nome em `volunteers.yml`, o sistema emite aviso e continua.

### RN-05 — Distribuição equilibrada de carga

Todo voluntário ativo (excluindo trainees) deve servir no máximo **3 vezes por mês**,
sendo **2 vezes o valor ideal**. O algoritmo só atribui uma terceira participação a um
voluntário quando não há outro elegível com menos de 2 participações no mês.

Para cada papel dentro de um ministério, o algoritmo escolhe o próximo voluntário
priorizando:
1. Voluntários com 0 participações no mês (prioridade máxima)
2. Voluntários com 1 participação no mês
3. Voluntários com 2 participações no mês (somente se não houver opção com menos)
4. Voluntários com 3 participações no mês nunca são escolhidos — slot fica vazio
   e o sistema alerta o líder
5. Ordem alfabética como desempate dentro de cada grupo

A distribuição é calculada dentro do próprio mês gerado — sem estado persistente entre meses.

### RN-06 — Restrições de período do dia

**`somente_manha`:** voluntário só é elegível para:
- Cultos `dominical_manha`
- Eventos especiais com `horario_inicio` antes de `12:00`

**`somente_noite`:** voluntário só é elegível para:
- Cultos `dominical_noite`
- Eventos especiais com `horario_inicio` a partir de `12:00`

**Priorização — chave de ordenação composta `(participações, prioridade_restrição)`:**

A seleção usa dois critérios nesta ordem:
1. Número de participações no mês (critério principal, crescente)
2. Compatibilidade de restrição com o período (desempate): `0` para voluntários
   com restrição compatível (`somente_manha` em slot de manhã, `somente_noite`
   em slot noturno), `1` para voluntários sem restrição

Exemplos para um slot de manhã:
- Marina (`somente_manha`, 0 participações) → chave `(0, 0)`
- Alanna (sem restrição, 0 participações)  → chave `(0, 1)` — Marina vence no empate
- Marina (`somente_manha`, 2 participações) → chave `(2, 0)`
- Alanna (sem restrição, 1 participação)   → chave `(1, 1)` — Alanna vence porque 1 < 2

O objetivo é preservar voluntários sem restrição para o período oposto, maximizando
a cobertura total do mês.

### RN-07 — Alocações fixas

Entradas em `alocacoes_fixas` de um evento são preservadas pelo algoritmo e contam
para o histórico de carga do voluntário.

### RN-08 — Elegibilidade por ministério

Voluntários do ministério `tecnica` não são elegíveis para papéis do `backstage`,
e vice-versa. Violação gera erro de validação com mensagem clara.

### RN-09 — Papéis exigidos por evento

Se `papeis` está definido em `events.yml`, somente esses papéis são alocados.
Se omitido, todos os papéis dos ministérios listados são exigidos.

### RN-10 — Validação de nomes

Nomes em `unavailability.yml` e `alocacoes_fixas` devem corresponder exatamente
a um `nome` em `volunteers.yml`. Divergências geram aviso com sugestão do nome
mais próximo (distância de Levenshtein ≤ 2).

### RN-11 — Limite de aparições de trainees

Trainees devem ser alocados **no máximo 2 vezes por mês**. O objetivo é que todo
trainee apareça pelo menos 1 vez — a segunda aparição só ocorre após todos os
trainees do mesmo papel terem sido alocados ao menos uma vez no mês. O algoritmo
distribui as aparições de forma espaçada (não em cultos consecutivos quando possível).

### RN-12 — Trainees apenas em cultos regulares

Trainees nunca são alocados em eventos especiais (tipo `"especial"`). A regra
aplica-se a todos os voluntários com papéis em `treinamento`, independentemente
do ministério.

### RN-13 — Duplas obrigatórias (Backstage e Técnica)

Pares declarados na seção `pares` de `volunteers.yml` devem ser alocados juntos.
O comportamento varia por ministério:

**Backstage:** os dois membros do par são alocados no mesmo culto em papéis
complementares (um no PALCO, outro na TÉCNICA).

**Técnica:** os dois membros do par são alocados no mesmo domingo, cada um no
seu papel natural (conforme `papeis` em `volunteers.yml`). Como na Técnica a
equipe da manhã é replicada para a noite (RN-01), o par serve junto nos dois
cultos do domingo automaticamente.

**Interação com RN-05:** cada membro do par é contado individualmente para o limite
de participações. A dupla entra no mesmo pool de seleção que os voluntários sem par.
O algoritmo seleciona o próximo slot usando a ordem de prioridade de RN-05 sobre
todos os voluntários elegíveis — pareados ou não. Quando um membro de um par é
selecionado, seu parceiro é automaticamente alocado no papel complementar (desde
que disponível e dentro do limite de RN-05). Se o parceiro já atingiu o limite ou
está indisponível, o membro selecionado é alocado individualmente.

**O algoritmo não deve priorizar pares sobre voluntários individuais.** Ambos
competem igualmente pela seleção — o critério é sempre o menor número de
participações no mês (RN-05).

As duplas só se aplicam a cultos do tipo `dominical_manha` e `dominical_noite` —
eventos especiais alocam os membros individualmente.

### RN-14 — Eventos com pessoa única

Eventos com `pessoa_unica: true` exigem apenas uma pessoa, que cobre todos os
papéis listados simultaneamente. O algoritmo seleciona um único voluntário
disponível e cria uma alocação por papel apontando para a mesma pessoa.

Para esses eventos, RN-02 não se aplica (a pessoa está cobrindo múltiplos papéis
intencionalmente). RN-04 e RN-06 continuam valendo. A alocação conta uma única
vez para o cálculo de carga do voluntário (RN-05), independentemente de quantos
papéis cobre.

### RN-15 — Cobertura total de voluntários

O algoritmo deve garantir que todo voluntário ativo (excluindo trainees) seja
alocado pelo menos uma vez no mês. A distribuição equilibrada de carga (RN-05)
já favorece isso naturalmente, mas o algoritmo deve verificar explicitamente ao
final da geração.

Se após gerar todas as alocações do mês algum voluntário ativo não tiver sido
escalado nenhuma vez, o sistema deve:
- Registrar esses voluntários numa lista de não-alocados
- Gravar o arquivo `output/nao-alocados-YYYY-MM.txt` com os nomes e motivo
- Em `--dry-run`, exibir a lista no console ao final do resumo

O motivo pode ser: indisponibilidade em todas as datas do mês, ou número de slots
no mês menor que o número de voluntários elegíveis no papel. O sistema não força
uma alocação extra que quebre outras regras — apenas reporta.

### RN-16 — Voluntários apenas_manual

Voluntários com `restricoes: [apenas_manual]` são completamente ignorados pelo
algoritmo de geração automática. Não aparecem em nenhuma alocação gerada, não
entram no cálculo de distribuição de carga (RN-05) e não são listados no arquivo
de não-alocados (RN-15).

Podem aparecer na escala exclusivamente via `alocacoes_fixas` em `events.yml`,
definidas manualmente pelo líder.

### RN-17 — Pares cross-ministério

Pares declarados em `pares_cross` de `volunteers.yml` pertencem a ministérios
diferentes e devem ser alocados no mesmo culto (mesma data e mesmo turno), cada um
dentro do seu próprio ministério e papel natural.

**Funcionamento:** o algoritmo coordena os dois ministérios culto a culto. Quando
um membro do par cross é selecionado para um culto específico (ex: 05/04 manhã),
esse culto exato é marcado como preferencial para o parceiro no outro ministério.
Na alocação do parceiro, cultos marcados como preferenciais têm prioridade no
desempate de RN-05.

**Estratégia de coincidência — dois níveis de prioridade:**

1. **Prioridade 1 — coincidir no culto `equipe_unica`:** o algoritmo tenta primeiro
   alocar ambos os membros do par cross no mesmo domingo via o ministério em
   `equipe_unica`. Nesse caso a replicação manhã/noite garante coincidência automática
   nos dois turnos.

2. **Prioridade 2 — fallback `independente` tratado como `equipe_unica`:** se não for
   possível coincidir via o culto `equipe_unica` (ex: membro indisponível, limite de
   RN-05 atingido), o algoritmo aloca o membro do ministério `independente` nos dois
   turnos do mesmo domingo (manhã e noite). Cada turno conta como **uma participação
   separada** no cômputo de RN-05 — ou seja, usar o fallback consome 2 das participações
   do mês. O fallback só é aplicado se o membro tiver 0 participações no mês (restam
   2 slots disponíveis).

**Modo `independente` nos dois ministérios:** tenta coincidir o turno exato primeiro;
se não for possível, aplica o mesmo fallback — aloca nos dois turnos, cada um contando
como uma participação separada, somente se restar espaço no limite de RN-05.

**Comportamento quando um está indisponível:** se um dos dois estiver indisponível
na data, o outro é alocado normalmente sem alerta. O sistema não força coincidência
quebrando RN-04 ou RN-05.

**Eventos especiais:** a preferência se aplica também a eventos — se um membro do
par cross estiver alocado num evento, o parceiro é preferido para o mesmo evento
se seu ministério também atuar nele.

---

## Comportamento do Gerador

### Comando

```bash
python generate.py --mes 2026-04
```

**Opções:**

| Flag             | Descrição                                               |
|------------------|---------------------------------------------------------|
| `--mes YYYY-MM`  | Mês a gerar (obrigatório)                               |
| `--force`        | Sobrescreve saída existente sem perguntar               |
| `--dry-run`      | Exibe a escala no console sem gravar arquivos           |
| `--ministerio`   | Gera apenas um ministério: `backstage` ou `tecnica`     |

### Sequência de execução

1. Valida os três arquivos YAML (nomes, slugs, datas, formatos)
2. Gera todos os domingos do mês como pares `dominical_manha` + `dominical_noite`
3. Adiciona eventos especiais do mês lidos de `events.yml`
4. Se output do mês já existir, pergunta antes de sobrescrever (exceto com `--force`)
5. Executa algoritmo de alocação respeitando RN-01 a RN-10
6. Grava `.txt` e `.csv` em `/output`
7. Exibe resumo no console com alertas

### Alertas no console (não bloqueantes)

- Papel sem voluntários suficientes para cobrir o mês sem repetição
- Nome em `unavailability.yml` sem correspondência em `volunteers.yml`
- Voluntário alocado em dois ministérios no mesmo culto

---

## Formato do Output

### Formato CSV (para colagem direta no Google Sheets)

O CSV espelha o layout da planilha de referência: papéis nas linhas, datas nas colunas.
Cada papel ocupa duas linhas — a primeira com os voluntários ativos, a segunda com
os trainees (prefixo `*`). Se não houver trainee, a segunda linha fica vazia.

**Estrutura de colunas:**
- Coluna A: label do papel (`SOM`, `PROJEÇÃO`, etc.) na primeira linha do par; vazio na segunda
- Colunas B em diante: uma coluna por data (cultos dominicais) ou por evento especial

**Exemplo — Técnica (modo `equipe_unica`, escala única replicada manhã/noite):**

```csv
,CULTO DA MANHÃ (10h) — mesma equipe no culto da noite,,,
,05/04,12/04,19/04,26/04
SOM,André,Josué,Jefferson,Cristóvão
,Carlos (*),,,
PROJEÇÃO,Isabela,George,William,Gabriel Arcanjo
,Ana (*),Thayla (*),Ana (*),
ILUMINAÇÃO,Gustavo S.,Lucas R.,Osvaldo,Gustavo S.
,Lucas Lima (*),,,

,EVENTOS ESPECIAIS,,,
,COPA DA ONDA 03/04 Sex,HUB 18/04 Sáb,CASA DE ORAÇÃO 24/04 Sex,
SOM,Cristóvão †,André,,
PROJEÇÃO,—,William,,
ILUMINAÇÃO,—,Gustavo S.,,
```

**Exemplo — Backstage (modo `independente`, manhã e noite separados):**

```csv
,CULTO DA MANHÃ (10h),,,
,05/04,12/04,19/04,26/04
PALCO,Marina,Aline,Kathleen,Michelle
,Gustavo (*),Gustavo (*),Gustavo (*),
TÉCNICA,Alanna,Anne,Giovanna,Paloma

,CULTO DA NOITE (18h),,,
,05/04,12/04,19/04,26/04
PALCO,Yomara,Augusto,Débora,Larissa
TÉCNICA,Aline,Alanna,Iale,Kathleen

,EVENTOS ESPECIAIS,,,
,HUB 18/04 Sáb,CASA DE ORAÇÃO 24/04 Sex,,
PALCO,Iale,Lucas B.P,
TÉCNICA,Camilla,Lucas B.P,
```

**Regras do formatter para CSV:**
- Separador: vírgula
- Encoding: UTF-8
- Linha de seção (`CULTO DA MANHÃ`, `EVENTOS ESPECIAIS`): valor só na coluna B, demais colunas vazias
- Linha de datas: coluna A vazia, colunas B em diante com datas no formato `DD/MM`
- Linha de papel ativo: coluna A com nome do papel, colunas B em diante com nomes dos voluntários
- Linha de trainee: coluna A vazia, colunas B em diante com nome + ` (*)` onde houver trainee
- Alocação fixa: sufixo ` †` no nome
- Papel não exigido no evento: célula com `—`
- Linha em branco entre seções

---

## Seed Data — `data/volunteers.yml` inicial

```yaml
ministerios:
  - slug: tecnica
    modo: equipe_unica
  - slug: backstage
    modo: independente

pares:
  - membros: [Paloma Marques, Lucas Bispo P]
    ministerio: backstage
  - membros: [Débora Bispo, Lucas Bispo D]
    ministerio: backstage
  - membros: [Isabela Aguilera, André Oliveira]
    ministerio: tecnica

pares_cross:
  - membros: [Gustavo Serafim, Camilla Serafim]

voluntarios:

# ── TÉCNICA ──────────────────────────────────────────

# Áudio
- nome: André Oliveira
  ministerio: tecnica
  papeis: [audio]
  treinamento: []
  restricoes: []
  ativo: true

- nome: Cristóvão Alves
  ministerio: tecnica
  papeis: [audio]
  treinamento: []
  restricoes: []
  ativo: true

- nome: Jefferson Calixto
  ministerio: tecnica
  papeis: [audio]
  treinamento: []
  restricoes: []
  ativo: true

- nome: Josué dos Santos
  ministerio: tecnica
  papeis: [audio]
  treinamento: []
  restricoes: []
  ativo: true

- nome: Gustavo Trovalim
  ministerio: tecnica
  papeis: [audio]
  treinamento: []
  restricoes: [apenas_manual]
  ativo: true

# Projeção
- nome: Gabriel Arcanjo
  ministerio: tecnica
  papeis: [projecao]
  treinamento: []
  restricoes: []
  ativo: true

- nome: George Belchior
  ministerio: tecnica
  papeis: [projecao]
  treinamento: []
  restricoes: []
  ativo: true

- nome: Isabela Aguilera
  ministerio: tecnica
  papeis: [projecao]
  treinamento: []
  restricoes: []
  ativo: true

- nome: William Fernando
  ministerio: tecnica
  papeis: [projecao]
  treinamento: []
  restricoes: []
  ativo: true

- nome: Ana Lessa
  ministerio: tecnica
  papeis: []
  treinamento: [projecao]
  restricoes: []
  ativo: true

- nome: Thayla Nunes
  ministerio: tecnica
  papeis: []
  treinamento: [projecao]
  restricoes: []
  ativo: true

- nome: Gabriel Lima
  ministerio: tecnica
  papeis: []
  treinamento: [projecao]
  restricoes: []
  ativo: true

# Iluminação
- nome: Gustavo Serafim
  ministerio: tecnica
  papeis: [iluminacao]
  treinamento: []
  restricoes: []
  ativo: true

- nome: Osvaldo Migueis
  ministerio: tecnica
  papeis: [iluminacao]
  treinamento: []
  restricoes: []
  ativo: true

- nome: Lucas Rafael
  ministerio: tecnica
  papeis: [iluminacao]
  treinamento: []
  restricoes: []
  ativo: true

- nome: Luquinhas
  ministerio: tecnica
  papeis: []
  treinamento: [iluminacao]
  restricoes: []
  ativo: true

# ── BACKSTAGE ────────────────────────────────────────
# (ver seção pares no topo do arquivo)

- nome: Alanna Lima
  ministerio: backstage
  papeis: [palco, tecnica_bs]
  treinamento: []
  restricoes: []
  ativo: true

- nome: Marina Nittani
  ministerio: backstage
  papeis: [palco, tecnica_bs]
  treinamento: []
  restricoes: [somente_manha]
  ativo: true

- nome: Anne Colbert
  ministerio: backstage
  papeis: [palco, tecnica_bs]
  treinamento: []
  restricoes: []
  ativo: true

- nome: Augusto Afonso
  ministerio: backstage
  papeis: [palco, tecnica_bs]
  treinamento: []
  restricoes: []
  ativo: true

- nome: Camilla Serafim
  ministerio: backstage
  papeis: [palco, tecnica_bs]
  treinamento: []
  restricoes: []
  ativo: true

- nome: Débora Bispo
  ministerio: backstage
  papeis: [palco, tecnica_bs]
  treinamento: []
  restricoes: []
  ativo: true

- nome: Lucas Bispo D
  ministerio: backstage
  papeis: [palco, tecnica_bs]
  treinamento: []
  restricoes: []
  ativo: true

- nome: Lucas Bispo P
  ministerio: backstage
  papeis: [palco, tecnica_bs]
  treinamento: []
  restricoes: []
  ativo: true

- nome: Yomara Sousa
  ministerio: backstage
  papeis: [palco, tecnica_bs]
  treinamento: []
  restricoes: [somente_noite]
  ativo: true

- nome: Aline Bispo
  ministerio: backstage
  papeis: [palco, tecnica_bs]
  treinamento: []
  restricoes: []
  ativo: true

- nome: Michelle Cesare
  ministerio: backstage
  papeis: [palco, tecnica_bs]
  treinamento: []
  restricoes: []
  ativo: true

- nome: Giovanna Lopes
  ministerio: backstage
  papeis: [palco, tecnica_bs]
  treinamento: []
  restricoes: []
  ativo: true

- nome: Paloma Marques
  ministerio: backstage
  papeis: [palco, tecnica_bs]
  treinamento: []
  restricoes: []
  ativo: true

- nome: Larissa Galafassi
  ministerio: backstage
  papeis: [palco, tecnica_bs]
  treinamento: []
  restricoes: []
  ativo: true

- nome: Iale Auanne
  ministerio: backstage
  papeis: [palco, tecnica_bs]
  treinamento: []
  restricoes: []
  ativo: true

- nome: Kathleen Lima
  ministerio: backstage
  papeis: [palco, tecnica_bs]
  treinamento: []
  restricoes: []
  ativo: true

- nome: Gustavo Fagundes
  ministerio: backstage
  papeis: []
  treinamento: [palco, tecnica_bs]
  restricoes: []
  ativo: true
```

---

## Critérios de Aceitação

**CA-01** — RN-01: Para Técnica, a alocação do `dominical_manha` e `dominical_noite` do
mesmo domingo deve ser idêntica para todos os papéis.

**CA-02** — RN-02: Para Backstage, nenhum voluntário deve aparecer em manhã e noite do
mesmo domingo quando houver membros suficientes para evitar a repetição.

**CA-03** — RN-05: Nenhum voluntário ativo deve ultrapassar 3 participações no mês.
O número ideal é 2. Uma terceira participação só deve ocorrer quando não houver outro
voluntário elegível com menos de 2 participações. Nenhum voluntário deve ter 4 ou mais
participações sob nenhuma circunstância.

**CA-04** — RN-06: Marina Nittani não deve aparecer em nenhum `dominical_noite` nem em
eventos com `horario_inicio >= 12:00`. Yomara Sousa não deve aparecer em nenhum
`dominical_manha` nem em eventos com `horario_inicio < 12:00`. Dado um mês onde Marina
e Alanna Lima têm o mesmo número de participações, Marina deve ser preferida nos slots
de manhã do Backstage.

**CA-05** — RN-07: Cristóvão Alves deve aparecer como Áudio na Copa da Onda,
independentemente do que a distribuição de carga indicaria.

**CA-06** — RN-09: A escala da Copa da Onda deve conter apenas o papel Áudio. Projeção e
Iluminação não devem aparecer.

**CA-07** — RN-04: Voluntário com data bloqueada em `unavailability.yml` não deve aparecer
em nenhuma alocação ativa naquela data.

**CA-08** — RN-03: Trainee nunca aparece como alocação principal. Aparece apenas como
segunda entrada no mesmo papel, marcado com `(*)`.

**CA-09** — RN-10: Nome com typo em `unavailability.yml` deve gerar aviso no console com
o nome mais próximo sugerido, sem interromper a geração.

**CA-10** — Sobrescrita: se output do mês já existir e `--force` não for passado, o sistema
deve perguntar antes de sobrescrever e cancelar se a resposta for negativa.

**CA-11** — RN-11: Gustavo Fagundes deve aparecer no máximo 2 vezes no mês. Se houver
apenas 1 slot disponível, aparece 1 vez. A segunda aparição só ocorre se todos os
outros trainees do mesmo papel já tiverem pelo menos 1 aparição. Nunca aparece 3 ou
mais vezes.

**CA-12** — RN-12: Gustavo Fagundes não deve aparecer em nenhum evento especial
(`tipo == "especial"`), mesmo que haja papéis em treinamento disponíveis.

**CA-13** — RN-13: Quando Paloma Marques for alocada em um culto dominical, Lucas Bispo P
deve aparecer no mesmo culto em papel diferente, e vice-versa — desde que ambos estejam
disponíveis. O mesmo vale para Débora Bispo e Lucas Bispo D. Para a Técnica: quando
Isabela Aguilera for alocada num domingo, André Oliveira deve ser alocado no mesmo
domingo em Áudio, e vice-versa — desde que ambos estejam disponíveis e dentro do
limite de RN-05.

**CA-14** — RN-02: Nenhum voluntário do Backstage deve aparecer em duas alocações ativas
no mesmo dia, seja no mesmo papel ou em papéis diferentes.

**CA-15** — RN-14: Na Casa de Oração, apenas uma pessoa deve aparecer na escala do
Backstage, com alocações em PALCO e TÉCNICA apontando para o mesmo nome. Essa pessoa
deve contar como uma única participação no cálculo de carga.

**CA-16** — RN-15: Dado um mês com slots suficientes para todos os voluntários ativos
de um papel, nenhum voluntário deve ficar sem alocação. Se o mês não tiver slots
suficientes, o arquivo `nao-alocados-YYYY-MM.txt` deve ser gerado listando os
voluntários não alocados com o motivo.

**CA-17** — RN-16: Voluntário com `apenas_manual` não deve aparecer em nenhuma alocação
gerada automaticamente, mesmo que todos os outros estejam indisponíveis. Não deve
aparecer no arquivo de não-alocados.

**CA-18** — RN-17: Dado um mês onde Gustavo Serafim (Técnica) e Camilla Serafim
(Backstage) estão ambos disponíveis e dentro do limite de RN-05:
- O algoritmo deve primeiro tentar coincidir via o culto do ministério em `equipe_unica`
- Se necessário, deve alocar Camilla nos dois turnos do mesmo domingo de Gustavo,
  contando como uma única participação
- Ao final, os domingos de cada um devem coincidir na maioria das ocorrências do mês
- A alocação dupla de fallback conta como 2 participações — só é usada se o membro
  ainda não tiver nenhuma participação no mês

---

## Stack e Restrições Técnicas

```
Runtime:      Python 3.11+
YAML parser:  PyYAML
Validação:    pydantic v2
Testes:       pytest
OS alvo:      macOS, Windows, Linux
```

**Dependências (requirements.txt):**
```
pyyaml>=6.0
pydantic>=2.0
pytest>=8.0
```

**Restrições:**
- Sem dependência de internet em runtime
- Sem chaves de API externas
- Os arquivos `/data/*.yml` devem ser a única interface de entrada do líder
- Erros de validação devem ser legíveis em português, com indicação do campo problemático
- Compatível com `python generate.py` sem instalação de ferramentas adicionais além do pip

---

## Estrutura de Arquivos

```
/
├── SPEC.md
├── data/
│   ├── volunteers.yml          ← editado pelo líder
│   ├── unavailability.yml      ← editado pelo líder
│   └── events.yml              ← editado pelo líder
├── output/                     ← gerado automaticamente
│   └── .gitkeep
├── src/
│   ├── domain/
│   │   └── types.py            ← dataclasses e enums (Pydantic models)
│   ├── config/
│   │   ├── loader.py           ← lê e valida os três YAMLs via Pydantic
│   │   └── validator.py        ← validações cruzadas (RN-08, RN-10, Levenshtein)
│   ├── scheduler/
│   │   ├── calendar.py         ← gera lista de cultos do mês
│   │   └── algorithm.py        ← lógica de alocação (RN-01 a RN-09)
│   └── export/
│       └── formatter.py        ← gera .txt e .csv
├── tests/
│   ├── test_loader.py
│   ├── test_algorithm.py
│   └── fixtures.py
├── generate.py                 ← ponto de entrada (python generate.py --mes 2026-04)
├── requirements.txt
└── .gitignore
```

---

## Notas para o Agente

- Implementar na ordem: `types.py` → `loader.py` + `validator.py` (com testes)
  → `calendar.py` → `algorithm.py` (com testes para cada CA)
  → `formatter.py` → `generate.py`
- O seed dos voluntários É o arquivo `data/volunteers.yml` desta spec — não criar
  script de seed separado
- Nunca inferir regras não descritas. Se houver ambiguidade, inserir
  `# TODO: confirmar com líder — <pergunta específica>`
- Todos os logs e mensagens de erro devem estar em português
- Usar `argparse` para os argumentos de linha de comando em `generate.py`
- Usar `difflib.get_close_matches` para sugestão de nomes (RN-10) — sem dependência extra
