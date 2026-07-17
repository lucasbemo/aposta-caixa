# Design — README profissional + arquivos OSS para o projeto `aposta`

**Data:** 2026-07-17
**Status:** Aprovado para planejamento
**Objetivo:** Elevar o repositório `caixa-loteria` a um projeto open-source de aparência profissional no GitHub, criando um `README.md` completo (em PT-BR), um arquivo `LICENSE` (MIT) e preenchendo os metadados do `package.json`.

---

## 1. Contexto

- O projeto é um CLI pessoal (`aposta/`, TypeScript + Playwright) que repete uma aposta salva nas Loterias CAIXA para a conta do próprio usuário. Já está funcional e validado (login + OTP automático, carrinho, pagamento, comprovante).
- **Não existe README hoje.** Não há `LICENSE`. O `package.json` só tem `name` e `version`. O repo ainda não está no GitHub (sem remote).
- Público-alvo do README: brasileiro (usuários das Loterias CAIXA) → **README em português (BR)**.
- A ferramenta é dual-use e automatiza um site governamental com conta real: o README precisa liderar com **disclaimers honestos** (não afiliação, uso pessoal/educacional, risco de ToS, sem garantia). Isso faz parte de ser "profissional", não é acessório.

## 2. Escopo

**No escopo:**
1. `README.md` (PT-BR) na raiz do repositório.
2. `LICENSE` — MIT, em nome do autor (Lucas Zamboni).
3. Metadados no `aposta/package.json`: `description`, `license`, `repository`, `author`, `keywords`.

**Fora do escopo (podem vir depois):** `CONTRIBUTING.md`, badges dinâmicos que dependam de CI, GitHub Actions, README bilíngue.

## 3. Decisões (aprovadas)

| ID | Decisão |
|---|---|
| D1 | Idioma do README: **Português (BR)** |
| D2 | Escopo: **README + LICENSE (MIT) + metadados do package.json** |
| D3 | Licença: **MIT** (permissiva, cláusula "AS IS / sem garantia" — importante dado o risco de ToS/uso) |
| D4 | Abordagem: **focado no usuário com vitrine técnica** — completo mas não exaustivo |
| D5 | Nome da ferramenta: `aposta`; sugestão de nome de repo: `aposta-caixa` (o autor confirma no GitHub) |
| D6 | Disclaimers proeminentes no topo (não afiliação à CAIXA, uso pessoal/educacional, risco de ToS, sem garantia, risco de bloqueio de conta) |

## 4. Estrutura do `README.md` (PT-BR)

Seções, na ordem:

1. **Título + tagline** — nome + uma linha do que faz.
2. **Badges estáticos** (shields.io, sem depender de CI): `License: MIT`, `Node >= 20`, `TypeScript`, `Playwright`, `uso pessoal`.
3. **⚠️ Aviso importante** — bloco em destaque logo após os badges:
   - Não é afiliado, associado ou endossado pela CAIXA.
   - Ferramenta de **uso pessoal e educacional**.
   - Automatizar o site das Loterias CAIXA **pode violar os Termos de Uso** e resultar em **bloqueio da conta**.
   - Fornecido **"como está", sem qualquer garantia** (ver LICENSE).
   - **Você é o único responsável** pelo uso, pelas apostas e por eventuais perdas.
4. **O que é / o problema** — o site é lento e cheio de passos; a ferramenta repete a aposta salva com o mínimo de interação.
5. **Como funciona** — passos do fluxo (login Keycloak → OTP automático via Gmail/IMAP → limpar carrinho → adicionar carrinho favorito → selecionar cartão → pagar/CVV → salvar comprovante). Incluir um **diagrama Mermaid** do fluxo.
6. **Pré-requisitos** — Node 20+; conta nas Loterias CAIXA com (a) um jogo salvo em **Carrinhos Favoritos** e (b) um **cartão cadastrado**; Gmail com **verificação em 2 etapas** e um **App Password** (para o OTP automático via IMAP).
7. **Instalação** — `git clone` → `cd aposta` → `npm install` → `npx playwright install chromium`.
8. **Configuração** — copiar `.env.example` para `.env` e preencher (`CAIXA_CPF`, `CAIXA_PASSWORD`, `CAIXA_CARRINHO_FAVORITO`, `GMAIL_ADDRESS`, `GMAIL_APP_PASSWORD`, opcional `CAIXA_CARD_CVV`); rodar `chmod 600 .env`; ajustar `config.json` (`defaultCardLast4`, `maxAmountPerRun`, `otpPollTimeoutSec`). Explicar como gerar o Gmail App Password. **Aviso de segurança** sobre `CAIXA_CARD_CVV`.
9. **Uso** — tabela/lista de comandos com exemplos de saída:
   - `node dist/index.js bet --dry-run` — roda tudo parando antes do pagamento.
   - `node dist/index.js bet` — aposta real (pede "SIM" e o CVV, salva comprovante).
   - `node dist/index.js comprovante` — re-salva o comprovante da compra mais recente.
   - `node dist/index.js history` — lista apostas anteriores.
   - `node dist/index.js setup` — instruções de configuração inicial.
10. **Segurança & privacidade** — executa 100% local, sem telemetria; segredos no `.env` (texto claro, `chmod 600` — trade-off assumido); CVV **memory-only** por padrão, e o auto-fill via `.env` é **opcional e desencorajado**; o app password do Gmail é revogável a qualquer momento; a ferramenta nunca loga senha/CVV/OTP (redação nos logs).
11. **Limitações conhecidas** — o site muda sem aviso e os seletores podem quebrar (use `--dry-run` para validar); o site tem muitos popups; **logins automatizados repetidos podem acionar o anti-abuso da CAIXA** (o OTP pode parar de ser enviado por um tempo); a CAIXA pede OTP em todo login.
12. **Desenvolvimento** — estrutura de pastas (`src/` com os módulos, `tests/`), `npm test` (Vitest), `npm run build` (tsc). Nota: os módulos de fluxo/navegador são validados ao vivo (sem testes unitários por dependerem do site real).
13. **Contribuindo (breve) + Licença** — nota curta de contribuição (issues/PRs bem-vindos, com ressalva de que é projeto pessoal) e menção à licença MIT com link para `LICENSE`.

## 5. `LICENSE`

Arquivo `LICENSE` na raiz com o texto **MIT** padrão, `Copyright (c) 2026 Lucas Zamboni`.

## 6. Metadados do `package.json`

Adicionar/preencher em `aposta/package.json`:
- `description`: "CLI pessoal para repetir apostas salvas nas Loterias CAIXA (login + OTP automático, pagamento, comprovante)."
- `license`: `"MIT"`
- `author`: `"Lucas Zamboni"`
- `repository`: objeto apontando para o repo GitHub (URL a confirmar; usar placeholder `github.com/<user>/aposta-caixa` que o autor ajusta).
- `keywords`: `["caixa", "loterias", "cli", "playwright", "automation", "mega-sena"]`

## 7. Princípios de escrita

- Tom claro e direto; sem linguagem de marketing exagerada.
- Exemplos de comando reais e copiáveis (rodados de dentro de `aposta/`).
- Nada de "dinheiro fácil"/incentivo a apostar — coerente com jogo responsável.
- Sem inventar recursos que não existem; documentar apenas o que está implementado.

## 8. Critérios de conclusão

- `README.md` na raiz cobre todas as 13 seções, em PT-BR, com o aviso proeminente no topo.
- Diagrama Mermaid do fluxo renderiza no GitHub.
- Todos os comandos documentados existem de fato no CLI.
- `LICENSE` MIT presente na raiz.
- `package.json` com description/license/author/repository/keywords preenchidos.
- Nenhum segredo real exposto no README ou nos exemplos (usar placeholders).
