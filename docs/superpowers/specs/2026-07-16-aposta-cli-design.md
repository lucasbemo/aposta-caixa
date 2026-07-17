# Design — `aposta`: CLI para apostar nas Loterias CAIXA

**Data:** 2026-07-16 (spec retroativo escrito em 2026-07-17)
**Status:** Aprovado — implementado e validado ao vivo
**Fonte detalhada:** [`docs/PROD.md`](../../PROD.md) — Product Requirements Document completo (384 linhas)
**Plano correspondente:** [`docs/superpowers/plans/2026-07-16-aposta-cli.md`](../plans/2026-07-16-aposta-cli.md)

> Este é o design spec no formato Superpowers correspondente ao plano do CLI `aposta`.
> Resume o design aprovado no `PROD.md` e registra, na seção 8, as divergências
> reais descobertas durante a implementação. Para o detalhamento completo
> (requisitos funcionais FR, não-funcionais NFR, modelo de dados, riscos, fases),
> consulte o `docs/PROD.md`.

---

## 1. Contexto

CLI pessoal (`aposta/`, TypeScript + Playwright) que repete uma aposta já salva nas
Loterias CAIXA para a conta do próprio usuário. O site oficial é lento e cheio de
passos (login, código por e-mail, carrinho, checkout, cartão, CVV, confirmação); a
ferramenta automatiza essa jornada, exigindo o mínimo de interação humana.

**Escopo de uso:** estritamente pessoal — uma conta CAIXA, um Gmail, um cartão. As
decisões de arquitetura e segurança refletem esse contexto (máquina única do autor).

## 2. Objetivos e não-objetivos

**Objetivos (MVP):** repetir a aposta salva com um comando; login automatizado;
recuperar o OTP do e-mail automaticamente; selecionar o carrinho favorito e ir ao
pagamento com o cartão cadastrado; confirmar a compra; capturar/armazenar o
comprovante; reportar sucesso ou falha com motivo claro.

**Não-objetivos:** não armazenar CVV por padrão; não criar/editar jogos (só reutilizar
salvos); não cadastrar cartão; sem multiusuário/serviço comercial; sem agendador (Fase
2); sem bypass de CAPTCHA/evasão de detecção.

## 3. Decisões principais (ADRs) — do PROD.md

| ID | Decisão | Motivo |
|---|---|---|
| D1 | Uso pessoal, uma conta | Define todo o modelo de segurança e escopo |
| D2 | CLI (`aposta`), não app/serviço | Menor esforço; CVV pedido no terminal |
| D3 | Disparo manual no MVP | Usuário presente para o CVV; agendador é Fase 2 |
| D4 | Alvo: o(s) carrinho(s) favorito(s) existente(s) | O jogo salvo já define os números |
| D5 | OTP via IMAP + App Password do Gmail | Sem setup no Google Cloud Console |
| D6 | Stack TypeScript + Playwright | Melhor tooling contra um site que muda |
| D7 | Segredos em `.env` (chmod 600), sem keychain | Sem lock-in de SO; troca: senhas em texto claro |
| D8 | Navegador visível (headed) + perfil persistente | Usuário acompanha; CAPTCHA resolvido por ele |
| D9 | Falhar seguro antes do pagamento; nunca repetir depois | Evitar cobrança duplicada é bloqueador |

## 4. Arquitetura resumida

CLI local (sem backend, sem nuvem). Módulos em `aposta/src/`:

- `index` — comandos Commander (`setup`, `bet`, `bet --dry-run`, `comprovante`, `history`).
- `secrets` — carrega/valida o `.env` (exige permissão 600).
- `config` — carrega `config.json` (cartão padrão, limite, timeout de OTP).
- `logger` — log estruturado com redação de OTP/CVV/senha.
- `otp` — extração do código + polling IMAP (com recorte por recência).
- `payment` — validação de CVV, linha de confirmação, guardrail de gasto, prompt mascarado.
- `receipt` — histórico local (append/read).
- `browser` — Playwright headed, perfil persistente.
- `selectors` — **única** fonte de seletores DOM da CAIXA.
- `flow` — coreografia do site (login, OTP, carrinho, checkout, pagamento, comprovante).

Camadas puras (secrets/config/logger/otp/payment/receipt) têm testes unitários
(Vitest); as camadas de navegador/fluxo são validadas **ao vivo** via `--dry-run`.

## 5. Escopo (MVP) e não-escopo

**MVP:** login + OTP automático → limpar carrinho → adicionar carrinho favorito →
selecionar cartão → pagar (CVV) → confirmar → salvar comprovante; comandos auxiliares
`comprovante`, `history`, `setup`; modo `--dry-run`.

**Fora (Fase 2):** agendador, conferência de resultado, múltiplos jogos/cartões,
notificação no celular.

## 6. Requisitos-chave (referência)

Os requisitos funcionais (FR-01…FR-13) e não-funcionais (NFR-01…NFR-05), o modelo de
dados, os riscos e as fases de entrega estão detalhados em [`docs/PROD.md`](../../PROD.md).
Destaques: CVV memory-only por padrão; nunca armazenar PAN; submit único de pagamento;
seletores centralizados; `.env` chmod 600; logs redigidos.

## 7. Critérios de conclusão

- Fluxo completo funcionando de ponta a ponta até o comprovante.
- `--dry-run` para antes do pagamento.
- Nenhum segredo sensível em log/disco além do trade-off assumido (D7).
- Comprovante oficial salvo após cada aposta confirmada.

## 8. ⚠️ Divergências na implementação (as-built vs. PROD.md)

O `PROD.md` foi escrito antes da implementação. A jornada real da CAIXA divergiu bastante
do desenho original — registrado aqui honestamente:

- **Login é um assistente Keycloak de 4 passos** em `login.caixa.gov.br` (não uma tela
  simples de CPF+senha). Ordem peculiar: CPF → pedir código → **código do e-mail (OTP)**
  → **senha**. Ou seja, o OTP vem **antes** da senha.
- **OTP automatizado, não manual.** O PROD.md (ADR-PROD-002) previa o usuário copiar o
  código manualmente; a implementação **busca o código via Gmail IMAP** automaticamente
  (só aceita e-mail recente e o marca como lido, para evitar códigos velhos).
- **Pagamento totalmente automatizado, não HITL.** O PROD.md tendia a um handoff
  human-in-the-loop no pagamento; a implementação **automatiza o pagamento inteiro**,
  incluindo o CVV. O CVV é digitado tecla por tecla (o campo é Angular `ng-keyup` +
  `ui-mask` — `fill()` não registra) e pode ser **auto-preenchido do `.env`**
  (`CAIXA_CARD_CVV`, opcional e desencorajado) ou digitado no terminal.
- **O cartão salvo não é um `<select>`** — é uma célula clicável mostrando "**** 1234"
  (`ng-click="vm.opcoesCollapse(...)"`).
- **Campo minado de popups.** O site abre muitos modais. Alertas bloqueiam cliques e são
  fechados com "Fechar" (`#fecharModalAlerta`); confirmações usam botões de **texto
  exato** ("Continuar"/"Confirmar"/"Sim"/"Incluir no carrinho"). Vários ids são
  duplicados (um oculto): sempre mirar o `:visible` (ex.: `#securityCode`,
  `#confirmarModalConfirmacao`).
- **Comprovante salvo automaticamente** após a compra: navega para Compras → abre a
  compra mais recente ("Detalhamento da compra", `#/compras/{id}`) → screenshot de página
  inteira.
- **Anti-abuso da CAIXA.** Logins automatizados repetidos podem fazer a CAIXA **parar de
  enviar o OTP** por um tempo — espaçar as execuções.
- **Sem o gate jurídico/parceria** do PROD.md (§5.3): construído diretamente como
  automação pessoal, assumindo o risco de ToS (D1, uso pessoal).

Nenhuma dessas divergências alterou os princípios de segurança centrais (falha-segura
antes do pagamento, submit único, sem armazenar PAN, redação de logs); mudaram **como** o
fluxo é executado, não as garantias.
