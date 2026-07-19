# Comandos sem make

O [`Makefile` na raiz do repositório](../Makefile) é apenas um atalho — cada alvo executa os comandos crus abaixo. Use esta tabela se preferir (ou precisar) rodar sem `make`.

Todos os comandos crus são executados de dentro da pasta `aposta/`.

| Alvo make | Comando(s) cru(s) | O que faz |
|---|---|---|
| `make install` | `npm install` e `npx playwright install chromium` | Instala dependências e o Chromium do Playwright. |
| `make config` | `cp -n .env.example .env`, `chmod 600 .env`, `cp -n config.example.json config.json` | Cria os arquivos de configuração a partir dos exemplos (nunca sobrescreve os existentes). |
| `make build` | `npm run build` | Compila o TypeScript (tsc). |
| `make all` | os três acima, em ordem | Clone novo → pronto para o dry-run. |
| `make dry-run` | `node dist/index.js bet --dry-run` | Roda o fluxo inteiro **parando antes do pagamento** (valida seletores sem apostar). |
| `make bet` | `node dist/index.js bet` | Aposta **real**: pede confirmação "SIM", o CVV (se não estiver no `.env`), paga e salva o comprovante. |
| `make comprovante` | `node dist/index.js comprovante` | Re-salva o comprovante (screenshot) da compra mais recente. |
| `make history` | `node dist/index.js history` | Lista as apostas registradas localmente. |
| `make setup` | `node dist/index.js setup` | Mostra as instruções de configuração inicial. |
| `make test` | `npm test` | Roda os 18 testes (Vitest) das partes puras. |

`make` sem argumentos (na raiz do repositório) lista todos os alvos disponíveis.
