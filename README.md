# Gerador de Escalas de Ministérios

Sistema local para geração automática de escalas mensais de ministérios de uma igreja.
O líder gerencia tudo editando arquivos YAML e executa um único comando. Nenhum voluntário
acessa ou edita o sistema.

---

## Requisitos

- Python 3.11+
- pip

---

## Instalação

```bash
git clone <url-do-repositorio>
cd <nome-do-repositorio>
pip install -r requirements.txt
```

---

## Uso

```bash
# Gerar escala de um mês
python generate.py --mes 2026-04

# Visualizar sem gravar arquivos
python generate.py --mes 2026-04 --dry-run

# Sobrescrever escala existente sem confirmação
python generate.py --mes 2026-04 --force

# Gerar apenas um ministério
python generate.py --mes 2026-04 --ministerio backstage
```

O resultado é gravado em `/output` como CSV pronto para colar no Google Sheets.
Se já existir escala para o mês informado, o sistema pede confirmação antes de sobrescrever.

---

## Estrutura de arquivos

```
/
├── data/
│   ├── volunteers.yml       ← voluntários, papéis, restrições e configuração
│   ├── unavailability.yml   ← ausências temporárias por mês
│   └── events.yml           ← eventos especiais além dos cultos dominicais
├── output/                  ← escalas geradas (não editar manualmente)
├── src/                     ← código-fonte
├── tests/                   ← testes automatizados
├── generate.py              ← ponto de entrada
└── requirements.txt
```

---

## Gerenciando voluntários

Tudo em `data/volunteers.yml`. O arquivo tem três seções no topo antes da lista de voluntários:

```yaml
ministerios:
  - slug: tecnica
    modo: equipe_unica      # mesma equipe serve manhã e noite
  - slug: backstage
    modo: independente      # manhã e noite têm equipes distintas

pares:
  - membros: [Nome A, Nome B]
    ministerio: backstage   # servem juntos no mesmo culto em papéis diferentes

pares_cross:
  - membros: [Nome A, Nome B]  # ministérios diferentes, servem no mesmo culto

voluntarios:
  - nome: Nome Completo
    ministerio: tecnica       # ou backstage
    papeis: [audio]           # papéis que exerce com responsabilidade plena
    treinamento: [projecao]   # papéis que está observando (aparece com * na escala)
    restricoes: []            # ver tabela abaixo
    ativo: true               # false = não escalar sem apagar histórico
```

### Restrições disponíveis

| Valor           | Efeito                                                    |
|-----------------|-----------------------------------------------------------|
| `somente_manha` | Apenas cultos de manhã e eventos com início antes das 12h |
| `somente_noite` | Apenas cultos de noite e eventos com início a partir das 12h |
| `apenas_manual` | Nunca escalado automaticamente — só via alocações fixas   |

### Papéis disponíveis

| Ministério  | Slug          | Nome        |
|-------------|---------------|-------------|
| `tecnica`   | `audio`       | Áudio       |
| `tecnica`   | `projecao`    | Projeção    |
| `tecnica`   | `iluminacao`  | Iluminação  |
| `backstage` | `palco`       | Palco       |
| `backstage` | `tecnica_bs`  | Técnica     |

### Adicionar um novo voluntário

Incluir uma nova entrada na lista `voluntarios` em `volunteers.yml`:

```yaml
- nome: Nome Completo
  ministerio: backstage
  papeis: [palco, tecnica_bs]
  treinamento: []
  restricoes: []
  ativo: true
```

### Desativar um voluntário

Alterar `ativo: true` para `ativo: false`. O histórico é preservado.

### Marcar como trainee

Mover o papel de `papeis` para `treinamento`. O voluntário passa a aparecer
na escala na linha de trainee (rótulo «trainee»), como observador, sem responsabilidade principal.

### Alterar modo de escala de um ministério

Editar o campo `modo` na seção `ministerios`:

```yaml
ministerios:
  - slug: tecnica
    modo: independente   # era equipe_unica — agora manhã e noite são escalas distintas
```

---

## Registrando ausências

Editar `data/unavailability.yml`. As ausências são por mês — limpar ou arquivar
entradas antigas após cada mês gerado.

```yaml
- nome: Nome Completo
  ausencias:
    - data: 2026-04-05
      turnos: [manha]        # só manhã bloqueada
    - data: 2026-04-12
      turnos: [manha, noite] # dia inteiro
    - data: 2026-04-18       # evento especial — sem campo turnos
```

O campo `turnos` é opcional. Se omitido, o dia inteiro fica bloqueado.
O nome deve ser exatamente igual ao cadastrado em `volunteers.yml`.

---

## Adicionando eventos especiais

Editar `data/events.yml`. Cultos dominicais são gerados automaticamente — não incluir aqui.

```yaml
- nome: Nome do Evento
  data: 2026-04-18
  horario_inicio: "15:00"
  horario_fim: "17:00"
  ministerios: [backstage, tecnica]  # quais ministérios atuam
  papeis: [audio]                    # omitir = todos os papéis dos ministérios
  alocacoes_fixas:
    - papel: audio
      membro: Nome Completo          # alocação definida pelo líder, não sobrescrita
```

---

## Regras de distribuição

- Todo voluntário ativo serve **no máximo 3 vezes por mês**, sendo **2 o ideal**
- Trainees aparecem na escala no máximo **2 vezes por mês**, apenas em cultos regulares
- Voluntários com restrição de período têm prioridade nos slots compatíveis, preservando
  os sem restrição para o período oposto
- Pares dentro do mesmo ministério são alocados juntos no mesmo culto
- Pares entre ministérios diferentes são alocados no mesmo culto quando possível
- Voluntários não alocados no mês são listados em `output/nao-alocados-YYYY-MM.txt`

---

## Formato da saída

Arquivos CSV gerados em `/output`, um por ministério:

```
output/
  escala-2026-04-tecnica.csv
  escala-2026-04-backstage.csv
  nao-alocados-2026-04.txt       ← gerado apenas se houver voluntários sem escala
```

O CSV tem formato matricial (papéis nas linhas, datas nas colunas) pronto para
colar diretamente no Google Sheets sem formatação adicional.

---

## Rodando os testes

```bash
pytest
pytest tests/test_algorithm.py   # só os testes de regras de negócio
pytest -v                        # saída detalhada
```

---

## Fluxo mensal sugerido

1. Receber ausências dos voluntários
2. Atualizar `data/unavailability.yml`
3. Atualizar `data/events.yml` com os eventos do mês
4. Atualizar `data/volunteers.yml` se houver novos membros ou mudanças
5. Rodar `python generate.py --mes YYYY-MM --dry-run` para validar
6. Confirmar sem `--dry-run` para gravar os arquivos
7. Copiar o CSV para o Google Sheets
