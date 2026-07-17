# PROD.md — `aposta`: CLI para apostar nas Loterias CAIXA

| Campo | Valor |
|---|---|
| Produto | `aposta` — CLI pessoal para repetir apostas nas Loterias CAIXA |
| Autor | Product / Engineering |
| Status | Draft aprovado para planejamento |
| Última atualização | 2026-07-16 |
| Escopo | **Uso estritamente pessoal** (uma conta CAIXA, um Gmail, um cartão) |
| Stack | TypeScript + Playwright + IMAP |

---

## 1. Resumo

`aposta` é uma ferramenta de linha de comando, executada **inteiramente na máquina do
usuário**, que repete uma aposta já salva no site das Loterias CAIXA
(loteriasonline.caixa.gov.br) reutilizando:

1. um **jogo já salvo** (aposta salva / volante favorito) na conta da CAIXA, e
2. um **cartão de crédito já cadastrado** nessa conta.

A ferramenta automatiza a jornada manual, lenta e propensa a erro do site: login,
recuperação do código de segurança (OTP) por e-mail, seleção do jogo salvo, carrinho,
checkout e seleção do cartão — **pausando para que o usuário digite o CVV** e confirme a
compra. O CVV nunca é armazenado.

O objetivo é reduzir uma jornada manual de ~5–10 minutos para menos de 2 minutos, dos
quais a única ação humana obrigatória é digitar o CVV (~10 segundos).

> **Escopo de uso.** Esta é uma ferramenta pessoal, para a própria conta do autor. Não é
> um produto distribuído, não é serviço para terceiros, não intermedeia apostas de outras
> pessoas. As decisões de arquitetura e segurança refletem esse contexto.

---

## 2. Problema

Repetir uma aposta recorrente na CAIXA exige ~8–12 passos manuais em uma UI lenta:
login, buscar o OTP no e-mail, navegar até apostas salvas, adicionar ao carrinho,
checkout, selecionar cartão, digitar CVV e confirmar. Quem aposta o mesmo jogo todo
concurso perde tempo e, às vezes, o horário limite do sorteio.

### Restrição confirmada

**A CAIXA solicita OTP por e-mail em todo login.** Portanto a recuperação do código não é
um caso de borda de "primeiro acesso": está no **caminho crítico de toda execução**. A
integração de e-mail precisa ser rápida e confiável, com um fallback manual para que um
e-mail lento não derrube a sessão.

---

## 3. Objetivos e não-objetivos

### Objetivos (MVP)

- G1. Disparar "apostar meu jogo salvo" com um único comando.
- G2. Fazer login com credenciais armazenadas localmente.
- G3. Recuperar o OTP do Gmail automaticamente (via IMAP), com fallback manual.
- G4. Selecionar um jogo já salvo e adicioná-lo ao carrinho para o próximo concurso.
- G5. Conduzir o checkout até o passo de pagamento com o cartão já cadastrado.
- G6. Pausar e solicitar ao usuário o **CVV** e a **confirmação** da compra.
- G7. Capturar e armazenar o comprovante (número + screenshot + PDF) localmente.
- G8. Reportar sucesso ou falha com motivo claro.

### Não-objetivos (MVP)

- NG1. Nunca armazenar o CVV.
- NG2. Não criar nem editar jogos — apenas reutilizar jogos salvos.
- NG3. Não cadastrar cartão — o cartão já existe na conta CAIXA.
- NG4. Sem multiusuário, sem serviço comercial, sem apostar por terceiros.
- NG5. Sem agendador (Fase 2).
- NG6. Sem conferência de resultado / resgate de prêmio (Fase 2).
- NG7. **Sem bypass de CAPTCHA** e sem técnicas de evasão de detecção (stealth/headless
  disfarçado). CAPTCHA é sempre resolvido pelo usuário no navegador visível.

---

## 4. Persona

**P1 — Apostador recorrente (o próprio usuário):** aposta o mesmo jogo todo concurso; é
desenvolvedor, confortável com terminal; é dono da conta CAIXA, do Gmail e do cartão
usados.

---

## 5. User stories

- US1. Como apostador, quero disparar minha aposta salva com um comando, para não navegar
  o site manualmente.
- US2. Como apostador, quero que a ferramenta busque o código de segurança do e-mail
  automaticamente, para não alternar para a caixa de entrada.
- US3. Como apostador, quero ser solicitado apenas pelo CVV e por uma confirmação final,
  para manter o controle do pagamento.
- US4. Como apostador, quero um comprovante armazenado localmente, para comprovar a
  aposta.
- US5. Como apostador, quero um motivo de falha claro (site fora do ar, CAPTCHA, horário
  encerrado, pagamento recusado) para agir manualmente a tempo.
- US6. Como apostador, quero que uma falha depois do pagamento **nunca** gere uma segunda
  cobrança, para não apostar em duplicidade.

---

## 6. Decisões de produto (registradas)

| ID | Decisão | Motivo |
|---|---|---|
| D1 | **Uso pessoal**, uma conta só | Define todo o modelo de segurança e escopo |
| D2 | **CLI** (`aposta`), não app desktop nem serviço | Menor esforço de build/manutenção para um dev; o CVV é solicitado no terminal |
| D3 | **Disparo manual** apenas no MVP | O usuário está sempre presente para digitar o CVV; agendador fica na Fase 2 |
| D4 | Alvo: **o(s) jogo(s) salvo(s) existente(s)**, seja qual for a loteria | O jogo salvo já define os números; o fluxo seleciona por nome |
| D5 | OTP via **IMAP + app password** do Google | Sem setup no Google Cloud Console; troca: o app password dá acesso total à caixa, revogável em um clique |
| D6 | Stack **TypeScript + Playwright** | Melhor tooling (codegen, trace viewer) para manter seletores contra um site que muda |
| D7 | Segredos em **arquivo `.env` (chmod 600)**, sem keychain do SO | Sem lock-in de SO, portável, padrão de dev. Troca aceita: as senhas ficam em texto claro em disco (ver §10) |
| D8 | Navegador **visível (headed)** com perfil persistente | O usuário acompanha e intervém; CAPTCHA é resolvido por ele |
| D9 | **Falhar seguro antes do pagamento; nunca repetir depois** | Evitar cobrança duplicada é bloqueador de release |

---

## 7. Fluxo fim-a-fim (caminho feliz)

```
aposta bet
  → abre navegador visível (perfil persistente do Playwright)
  → login com credenciais do .env
  → OTP: inicia polling IMAP no instante do submit do login
          ├─ encontrado em ≤90s → preenche automaticamente
          └─ não encontrado     → terminal pede para colar o código manualmente
  → navega para "Carrinhos Favoritos" → seleciona o item configurado (CAIXA_CARRINHO_FAVORITO)
  → adiciona ao carrinho para o próximo concurso → checkout
  → seleciona o cartão já cadastrado
  → TERMINAL:  "Mega-Sena #2870 · R$ 6,00 · cartão •••• 1234 — digite o CVV:"
  → usuário digita o CVV (mascarado) → confirma
  → ÚNICO submit de pagamento (nunca repetido)
  → captura comprovante (número + screenshot + PDF)
  → "✅ Aposta confirmada — comprovante salvo em ~/aposta/receipts/"
  → fecha a sessão, zera o CVV da memória
```

**Meta:** < 2 minutos no total; atenção humana necessária apenas no CVV.

---

## 8. Comandos da CLI

| Comando | Função |
|---|---|
| `aposta setup` | Configuração inicial: grava credenciais no `.env`, define o jogo alvo e o cartão padrão |
| `aposta bet` | Executa o fluxo completo acima |
| `aposta bet --dry-run` | Executa tudo **parando antes do pagamento** — para testar seletores sem apostar |
| `aposta history` | Lista comprovantes/apostas anteriores do histórico local |

---

## 9. Requisitos funcionais

| ID | Requisito | Prioridade |
|---|---|---|
| FR-01 | Armazenar credenciais CAIXA (CPF + senha) e app password do Gmail em `.env` com permissão `600`. | Must |
| FR-02 | OTP via **IMAP**: iniciar polling no submit do login (a cada 3s, até 90s), buscar apenas mensagens recentes não lidas de `@caixa.gov.br`, extrair o código por regex e descartar o conteúdo. | Must |
| FR-03 | **Fallback de OTP:** após 90s sem código, solicitar que o usuário cole o código no terminal e prosseguir. | Must |
| FR-04 | Automação de navegador **visível** (headed) com perfil persistente: login → jogo salvo → carrinho → checkout. | Must |
| FR-05 | Seleção do item de "Carrinhos Favoritos" pelo nome exato (`CAIXA_CARRINHO_FAVORITO`). | Must |
| FR-06 | **CVV:** solicitado em runtime, entrada mascarada, mantido apenas em memória, zerado após o submit. Nunca logado, nunca persistido, nunca em screenshot. | Must |
| FR-07 | Tela/linha de confirmação explícita (jogo, concurso, valor, últimos 4 do cartão) antes de submeter o pagamento. | Must |
| FR-08 | Captura do comprovante (número de confirmação + screenshot + PDF) em `~/aposta/receipts/`, com registro JSON no histórico local. | Must |
| FR-09 | Mensagens claras: sucesso, falha com motivo, "ação necessária" (CVV / CAPTCHA). | Must |
| FR-10 | **Todos os seletores de DOM centralizados em um único módulo** (`selectors.ts`). | Must |
| FR-11 | Modo `--dry-run`: fluxo completo parando antes do pagamento. | Must |
| FR-12 | Detecção de horário limite do concurso: abortar cedo se o concurso já encerrou, informando a data do próximo. | Should |
| FR-13 | Guardrail de gasto: valor máximo por execução, bloqueado na ferramenta. | Should |

---

## 10. Requisitos não-funcionais

### NFR-01 — Segurança

- O CVV vive **apenas em memória**: entrada mascarada, zerado imediatamente após o submit,
  nunca em disco, log, histórico ou screenshot. O screenshot do comprovante é tirado
  **apenas na página de confirmação**, depois do pagamento.
- O **número do cartão nunca é manuseado pela ferramenta** — ele vive na conta CAIXA; a
  ferramenta só lê os dados mascarados que o site exibe (bandeira, últimos 4 dígitos).
- Credenciais CAIXA e app password do Gmail ficam em `.env` com `chmod 600`.
- **Troca de segurança assumida (D7):** sem keychain do SO, as duas senhas ficam em texto
  claro em disco. Qualquer processo rodando como o usuário pode lê-las, e elas podem vazar
  em um backup. Mitigações: o app password do Gmail é revogável em um clique em
  myaccount.google.com; o `.env` fica com permissão restrita e deve estar no `.gitignore`.
  Esta troca é aceitável **somente** por ser uma ferramenta pessoal de máquina única.
- Logs devem redigir OTP, CVV, senha, token e qualquer PII.

### NFR-02 — Privacidade

- Acesso ao e-mail limitado a leitura + query estreita (remetente CAIXA, mensagens
  recentes). Nenhum conteúdo de e-mail é retido além do código, que é descartado após uso.

### NFR-03 — Confiabilidade

- Execução fim-a-fim ≤ 3 min, excluindo a espera do CVV.
- Retry único apenas para falhas transitórias **antes** do pagamento.
- **Nunca** repetir após o submit de pagamento (ver §11).

### NFR-04 — Observabilidade

- Log estruturado por execução, com status por passo, para depurar quebras de seletor.
  Nada sensível é logado.

### NFR-05 — Manutenibilidade

- O site da CAIXA muda sem aviso. Todos os seletores em `selectors.ts`; `--dry-run` como
  ferramenta padrão de verificação após qualquer suspeita de mudança de layout.

---

## 11. Tratamento de erros

Regra que rege tudo: **falhar seguro antes do pagamento; nunca adivinhar depois.**

| Situação | Comportamento |
|---|---|
| Quebra de seletor / página inesperada | Abortar imediatamente com screenshot de onde parou. Como não chegou ao pagamento, tentar de novo é sempre seguro. |
| CAPTCHA | Sem bypass. Navegador visível: terminal emite alerta, usuário resolve, pressiona Enter, automação retoma. |
| OTP não encontrado em 90s | Fallback manual: usuário cola o código; fluxo continua. |
| Horário do concurso encerrado | Detectado cedo, aborta com a data do próximo concurso. |
| Pagamento recusado | Exibe a mensagem da CAIXA na íntegra e para. **Sem retry automático.** |
| Timeout ambíguo após clicar em pagar | A ferramenta **não repete**. Navega até o histórico de apostas da conta para verificar se a aposta existe e reporta `CONFIRMADA` ou `NÃO REALIZADA — seguro tentar de novo`. Se nem isso for possível, orienta a verificar manualmente antes de rodar de novo. |

---

## 12. Arquitetura

CLI TypeScript executando 100% local. Sem backend, sem nuvem.

```
┌──────────────────────── aposta (CLI local) ────────────────────────┐
│                                                                     │
│  cli ── comandos: setup · bet · bet --dry-run · history             │
│   │                                                                 │
│   ├── secrets ──── lê .env (chmod 600): CPF, senha CAIXA, app pw    │
│   │                                                                 │
│   ├── browser ──── Playwright headed, perfil persistente            │
│   │                                                                 │
│   ├── otp ──────── cliente IMAP: polling 3s/≤90s, regex do código,  │
│   │                fallback de colagem manual                       │
│   │                                                                 │
│   ├── flow ─────── coreografia do site (usa selectors.ts)           │
│   │                login → OTP → Carrinhos Favoritos → carrinho →    │
  │                checkout                                         │
│   │                                                                 │
│   ├── payment ──── prompt de CVV (memória), linha de confirmação,   │
│   │                submit único, wipe do CVV                        │
│   │                                                                 │
│   ├── receipt ──── número + screenshot + PDF → ~/aposta/receipts/   │
│   │                registro JSON no histórico                       │
│   │                                                                 │
│   └── logger ───── log estruturado por execução (redigido)          │
│                                                                     │
│  Rede: HTTPS → loteriasonline.caixa.gov.br · IMAP → imap.gmail.com  │
└─────────────────────────────────────────────────────────────────────┘
```

### Módulos

| Módulo | Responsabilidade | Dependências |
|---|---|---|
| `cli` | Parse de comandos, orquestração de alto nível | — |
| `secrets` | Ler/gravar `.env`, validar permissão 600 | fs |
| `browser` | Ciclo de vida do Playwright, perfil persistente, ritmo humano | Playwright |
| `otp` | IMAP, polling, extração do código, fallback manual | cliente IMAP |
| `flow` | Passos do site; **todos os seletores vêm de `selectors.ts`** | browser, otp |
| `payment` | Prompt de CVV, confirmação, submit único, wipe | browser |
| `receipt` | Captura e persistência do comprovante e histórico | fs, browser |
| `logger` | Log estruturado e redigido | — |
| `selectors.ts` | Único ponto com seletores de DOM da CAIXA | — |

---

## 13. Modelo de dados local

**`.env`** (chmod 600, no `.gitignore`)
```
CAIXA_CPF=...
CAIXA_PASSWORD=...
CAIXA_CARRINHO_FAVORITO=Mega da família   # nome exato do item em "Carrinhos Favoritos"
GMAIL_ADDRESS=...
GMAIL_APP_PASSWORD=...
```

> O jogo a ser repetido é identificado pelo **nome do item em "Carrinhos Favoritos"** da
> conta CAIXA (`CAIXA_CARRINHO_FAVORITO`). O `flow` seleciona esse item pelo nome exato.

**`config.json`** (não sensível)
```json
{
  "defaultCardLast4": "1234",
  "maxAmountPerRun": 30.0,
  "otpPollTimeoutSec": 90
}
```

**`~/aposta/receipts/history.json`** (registro por aposta)
```json
{
  "id": "uuid",
  "lottery": "Mega-Sena",
  "contest": "2870",
  "amount": 6.0,
  "cardLast4": "1234",
  "confirmationNumber": "...",
  "screenshotPath": "...",
  "pdfPath": "...",
  "placedAt": "2026-07-16T18:40:00-03:00",
  "status": "CONFIRMED"
}
```

Nunca persistido em lugar nenhum: CVV, número completo do cartão, OTP, conteúdo de e-mail.

---

## 14. Métricas de sucesso (MVP)

- ≥ 95% das execuções concluem ou falham de forma segura (sem estado "desconhecido" após
  o pagamento).
- Tempo de atenção ativa do usuário por aposta ≤ 60s.
- 0 ocorrências de CVV/OTP persistidos em logs ou disco (gate de auditoria manual).
- Detecção de quebra de seletor antes do pagamento em 100% dos casos de mudança de layout.

---

## 15. Riscos e mitigações

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| R1 — Automatizar o site viola os Termos de Uso da CAIXA; possível suspensão de conta | Média | Alto | Ciência explícita do usuário; uso pessoal, conta única; ritmo humano; sem evasão |
| R2 — Mudança de layout quebra o fluxo silenciosamente | Alta | Alto | `selectors.ts` centralizado; `--dry-run` como verificação; abortar antes do pagamento |
| R3 — CAPTCHA / anti-bot com frequência alta torna a automação impraticável | Média | Médio | Navegador visível; HITL para CAPTCHA é recurso de primeira classe, não borda |
| R4 — Vazamento de OTP/CVV | Baixa | Crítico | CVV só em memória; OTP descartado; redaction em logs — bloqueadores de release |
| R5 — Duplicidade de aposta por timeout | Baixa | Crítico | Sem retry pós-pagamento; reconciliação via histórico da conta |
| R6 — Senhas em texto claro no `.env` vazam (backup, malware) | Média | Alto | Troca aceita (D7); `chmod 600`, `.gitignore`, app password revogável |
| R7 — OTP em toda execução: e-mail lento derruba a sessão | Média | Médio | Polling imediato no submit; fallback de colagem manual em 90s |

---

## 16. Fases de entrega

### Fase 0 — Spike (antes de codar)
- Walkthrough manual do site com **Playwright codegen**, gravando as telas reais para
  escrever o `selectors.ts` a partir da realidade.
- Confirmar em que passo exato o OTP aparece e o formato do e-mail/remetente.
- Verificar se a **Teimosinha** (repetir a mesma aposta por N concursos) cobre o caso: se
  o jogo suportar, uma compra manual pode cobrir 8+ concursos e reduzir a necessidade da
  ferramenta.
- **Saída:** decisão go / no-go e o `selectors.ts` inicial.

### Fase 1 — MVP
- Caminho feliz completo + OTP via IMAP com fallback + CVV HITL + comprovantes +
  mensagens + `--dry-run` + guardrail de gasto.

### Fase 2 — Evolução (fora do MVP)
- Agendador (rodar antes do horário limite), conferência de resultado, notificação no
  celular para o passo do CVV, múltiplos jogos/cartões.

---

## 17. Questões em aberto

1. A **Teimosinha** resolve o caso nativamente para o jogo em questão? (investigar na
   Fase 0 — pode reduzir muito a necessidade da ferramenta).
2. O comprovante de confirmação oferece PDF para download ou apenas HTML? (define a
   estratégia de captura em `receipt`).
3. Qual a duração real do timeout de sessão da CAIXA? (define a folga do polling de OTP).
4. O perfil persistente reduz a frequência de CAPTCHA entre execuções?

---

## 18. Definição resumida do MVP

> Uma CLI TypeScript, executada localmente, que repete uma aposta salva na conta CAIXA do
> próprio usuário: faz login, busca o código de segurança no Gmail via IMAP (com fallback
> manual), seleciona o jogo salvo, monta o carrinho e chega ao pagamento com o cartão já
> cadastrado — pausando para o usuário digitar o CVV e confirmar. O CVV nunca é
> armazenado; a aposta só é dada como concluída após a captura do comprovante oficial; e
> uma falha depois do pagamento nunca é repetida automaticamente.
