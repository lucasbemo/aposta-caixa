# Product Requirements Document — Assistente de Apostas nas Loterias CAIXA

> **Nome do arquivo:** `PROD.md`  
> **Tipo do documento:** Product Requirements Document (PRD)  
> **Status:** Draft v0.1  
> **Responsável:** Product / Engineering  
> **Última atualização:** 16 de julho de 2026  
> **Mercado inicial:** Brasil  
> **Classificação:** Confidencial — contém decisões de produto, segurança e integração

---

## 1. Resumo executivo

O produto será um **assistente pessoal para repetir apostas previamente definidas nas Loterias CAIXA**, reduzindo a quantidade de telas e decisões necessárias para concluir uma compra no canal oficial.

O aplicativo deverá permitir que o usuário:

1. cadastre ou selecione um jogo favorito previamente configurado;
2. visualize o concurso, o preço e os números antes da compra;
3. inicie uma sessão no canal oficial da CAIXA;
4. conclua manualmente autenticações adicionais, quando exigidas;
5. utilize um cartão já salvo no ambiente oficial da CAIXA ou escolha Pix;
6. informe o código de segurança do cartão diretamente no ambiente de pagamento oficial;
7. confirme explicitamente a aposta;
8. receba e armazene somente o comprovante e os metadados não sensíveis da transação.

A primeira versão **não deverá realizar apostas de forma silenciosa, agendada ou sem confirmação humana**. O sistema também não deverá armazenar senha da CAIXA, código recebido por e-mail, número completo do cartão, CVV ou dados capazes de efetuar uma compra sem nova autorização do usuário.

### Decisão central de produto

O produto será desenhado como uma **camada de conveniência e orquestração sobre o canal oficial**, e não como uma implementação paralela do sistema de apostas.

Caso não exista uma API oficial, contrato de integração ou autorização expressa da CAIXA, a solução de produção deverá:

- preparar a intenção de aposta;
- direcionar o usuário ao site ou aplicativo oficial;
- acompanhar o estado da jornada apenas quando tecnicamente e contratualmente permitido;
- exigir que autenticação, pagamento e confirmação final ocorram no ambiente oficial.

Automação por scraping, engenharia reversa de endpoints privados, bypass de CAPTCHA, interceptação automática de autenticação multifator ou simulação de comportamento humano não faz parte do escopo aprovado para produção.

---

## 2. Contexto e problema

O fluxo atual para repetir um jogo salvo pode ser trabalhoso devido a:

- experiência de navegação pouco direta;
- necessidade de localizar um jogo salvo ou favorito;
- autenticação com código adicional;
- alternância entre navegador, e-mail e página de pagamento;
- necessidade de informar o código de segurança do cartão a cada compra;
- risco de o usuário selecionar o concurso ou jogo errado;
- ausência de uma visão consolidada das apostas repetidas;
- dificuldade de acompanhar comprovantes, concursos e resultados.

O usuário não quer escolher números novamente. Ele quer repetir uma aposta conhecida, revisar os dados essenciais e concluir a compra com o menor número possível de interações, sem reduzir a segurança.

### Hipótese de produto

Se o aplicativo transformar a jornada em um fluxo guiado, preservar o jogo favorito e eliminar etapas redundantes, então o usuário conseguirá concluir uma aposta com menos esforço e menor chance de erro, mantendo autenticação e pagamento sob seu controle.

---

## 3. Objetivos

### 3.1 Objetivos do MVP

- Permitir que o usuário mantenha um catálogo de jogos favoritos.
- Permitir selecionar rapidamente um jogo e iniciar uma nova aposta.
- Mostrar modalidade, números, concurso, data limite e valor antes da compra.
- Direcionar a autenticação e o pagamento ao canal oficial.
- Exigir confirmação humana imediatamente antes da compra.
- Nunca armazenar CVV, senha ou código de autenticação.
- Registrar comprovante, valor, concurso e status da aposta.
- Notificar o usuário sobre confirmação da compra e disponibilidade do resultado.
- Implementar controles de jogo responsável e limites de gasto.
- Gerar trilha de auditoria das ações relevantes.

### 3.2 Resultados esperados

- Redução do tempo mediano para repetir uma aposta.
- Redução da quantidade de telas e decisões do usuário.
- Redução de erros de concurso, números ou modalidade.
- Aumento da taxa de conclusão das jornadas iniciadas.
- Zero armazenamento de dados de cartão ou autenticação sensíveis.
- Zero apostas realizadas sem consentimento explícito.

---

## 4. Não objetivos

O produto não tem como objetivo:

- operar como casa de apostas ou loteria independente;
- receber, custodiar ou transferir dinheiro do usuário;
- vender apostas fora dos canais autorizados;
- sugerir que uma combinação possui maior probabilidade de ganhar quando isso não for matematicamente verdadeiro;
- oferecer crédito para apostas;
- permitir apostas para menores de 18 anos;
- automatizar compras recorrentes sem confirmação individual;
- armazenar CVV, senha da CAIXA ou códigos de autenticação;
- contornar CAPTCHA, antifraude, autenticação multifator ou limites da CAIXA;
- utilizar endpoints privados ou não documentados sem autorização;
- prometer prêmio, retorno financeiro ou estratégia vencedora;
- coletar e-mails além do estritamente necessário para a funcionalidade autorizada;
- acessar a caixa de e-mail completa do usuário sem necessidade e consentimento específicos.

---

## 5. Premissas e dependências

### 5.1 Premissas

- O usuário possui 18 anos ou mais.
- O usuário possui cadastro válido no canal oficial das Loterias CAIXA.
- O jogo favorito já existe no canal oficial ou foi cadastrado no aplicativo com números válidos.
- O usuário possui um método de pagamento aceito pelo canal oficial.
- A compra é processada exclusivamente pela CAIXA ou por seu processador autorizado.
- O usuário tem acesso ao e-mail ou outro fator de autenticação associado à conta.
- O usuário entende que a confirmação da intenção no aplicativo não equivale à efetivação da aposta.
- A aposta só é considerada concluída após recebimento de comprovante oficial.

### 5.2 Dependências externas

- Disponibilidade do site ou aplicativo das Loterias CAIXA.
- Existência de API, deep link, App Link, Universal Link ou parceria oficial.
- Regras de autenticação e antifraude da CAIXA.
- Disponibilidade do provedor de pagamento.
- Disponibilidade do provedor de e-mail do usuário, quando aplicável.
- Publicação oficial de concursos, horários, preços e resultados.
- Aprovação jurídica, regulatória, de privacidade e de segurança.
- Aprovação do produto pelo programa de distribuição da Apple e/ou Google.

### 5.3 Gate obrigatório antes do desenvolvimento da compra

Antes de implementar qualquer automação transacional, as equipes de Produto, Jurídico e Engenharia deverão responder formalmente:

1. A CAIXA oferece API pública ou programa de parceiros para criação de apostas?
2. Os termos do canal digital permitem automação por software de terceiros?
3. É permitido apresentar o canal oficial dentro de WebView?
4. É permitido utilizar deep links para uma aposta ou carrinho previamente montado?
5. É permitido consultar comprovantes e resultados em nome do usuário?
6. Há restrições de marca, publicidade ou distribuição?
7. Quais licenças ou autorizações são necessárias?
8. Quais requisitos de jogo responsável devem ser implementados?

Sem respostas favoráveis, o produto permanecerá no modo **assistente não transacional**, em que prepara a aposta e conduz o usuário ao canal oficial.

---

## 6. Personas

### 6.1 Apostador recorrente

**Perfil:** adulto que costuma repetir uma combinação específica em concursos diferentes.

**Necessidades:**

- repetir o jogo com poucos passos;
- não esquecer o prazo do concurso;
- evitar digitar os números novamente;
- confirmar que a aposta foi realmente registrada;
- consultar comprovantes e resultados em um único lugar.

### 6.2 Apostador ocasional organizado

**Perfil:** adulto que possui alguns jogos favoritos, mas aposta apenas em concursos especiais ou quando decide manualmente.

**Necessidades:**

- organizar jogos favoritos;
- receber lembrete sem incentivo excessivo;
- conhecer o valor antes de iniciar a compra;
- manter controle de gasto.

### 6.3 Operações e suporte

**Perfil:** equipe interna responsável por incidentes, contestação de status e suporte.

**Necessidades:**

- identificar em qual etapa a jornada falhou;
- diferenciar intenção, pagamento e aposta confirmada;
- não visualizar dados sensíveis;
- acessar trilhas de auditoria e IDs de correlação.

---

## 7. Jobs to be Done

### Job principal

> Quando eu decidir repetir uma aposta já conhecida, quero selecionar meu jogo favorito, revisar o concurso e concluir a compra com segurança e poucos passos, para não precisar navegar manualmente por toda a jornada da CAIXA.

### Jobs secundários

- Quando uma compra estiver em andamento, quero saber exatamente qual etapa falta.
- Quando a autenticação exigir um código, quero alternar facilmente para meu e-mail e voltar ao fluxo.
- Quando o cartão exigir CVV, quero digitá-lo no ambiente oficial sem que o aplicativo o armazene.
- Quando a aposta for concluída, quero receber um comprovante oficial.
- Quando o resultado for publicado, quero saber se meu comprovante contém uma combinação premiada.
- Quando eu atingir meu limite de gasto, quero que o aplicativo bloqueie novas jornadas.

---

## 8. Princípios do produto

1. **Consentimento por transação:** toda aposta exige uma confirmação explícita e recente.
2. **Canal oficial como fonte de verdade:** o status oficial prevalece sobre qualquer estado local.
3. **Segurança antes de conveniência:** nenhuma redução de etapas justifica enfraquecer autenticação ou pagamento.
4. **Dados mínimos:** coletar e reter apenas o necessário.
5. **Sem dark patterns:** não usar contagem regressiva artificial, urgência enganosa ou estímulo compulsivo.
6. **Jogo responsável por padrão:** limites e histórico de gasto são recursos centrais, não acessórios.
7. **Falha segura:** em dúvida, não apostar e não cobrar novamente.
8. **Idempotência:** uma intenção de aposta não pode gerar compras duplicadas.
9. **Transparência:** mostrar quando o usuário está no aplicativo e quando está no ambiente oficial.
10. **Reversibilidade até a confirmação:** permitir cancelar o fluxo antes da compra.

---

## 9. Escopo funcional

### 9.1 Cadastro e autenticação no aplicativo

O aplicativo deverá:

- permitir cadastro com e-mail ou provedor de identidade;
- exigir verificação de idade e aceite dos termos;
- oferecer autenticação forte, preferencialmente passkey ou biometria;
- exigir reautenticação para iniciar uma aposta após período de inatividade;
- permitir encerramento de sessões e revogação de dispositivos;
- manter a conta do aplicativo separada da conta CAIXA.

O aplicativo não deverá solicitar nem armazenar a senha da conta CAIXA.

### 9.2 Integração com a conta CAIXA

Ordem de preferência:

1. OAuth ou autorização oficial fornecida pela CAIXA;
2. API oficial com consentimento explícito;
3. App Link ou Universal Link para o aplicativo oficial;
4. abertura do navegador externo no canal oficial;
5. WebView somente com aprovação formal e suporte técnico da CAIXA.

Não serão aceitos em produção:

- captura de usuário e senha da CAIXA pelo aplicativo;
- replay de cookies de sessão;
- automação de navegador com credenciais do usuário;
- engenharia reversa de APIs internas;
- bypass de CAPTCHA ou mecanismos antifraude.

### 9.3 Jogos favoritos

O usuário poderá:

- criar um jogo favorito no aplicativo;
- importar um jogo favorito por integração oficial, quando disponível;
- informar modalidade e números;
- dar um nome ao jogo, por exemplo “Mega da família”;
- definir se aceita concursos regulares, especiais ou ambos;
- arquivar e excluir favoritos;
- revisar a validade dos números conforme as regras atuais da modalidade.

Cada favorito deverá conter:

- ID interno;
- proprietário;
- modalidade;
- números ou seleções;
- configurações adicionais, como Teimosinha, quando suportado;
- data de criação;
- origem: manual, importado ou oficial;
- versão das regras utilizadas na validação;
- status: ativo, arquivado ou inválido.

O favorito não representa uma aposta realizada.

### 9.4 Seleção do concurso

O aplicativo deverá:

- consultar concursos disponíveis por fonte oficial;
- destacar número do concurso e data do sorteio;
- mostrar horário limite para apostar;
- bloquear concursos encerrados;
- atualizar preço e regras imediatamente antes da confirmação;
- informar quando os dados não puderem ser validados.

Caso o preço, o concurso ou as regras mudem depois da preparação, o usuário deverá revisar e confirmar novamente.

### 9.5 Resumo da aposta

Antes de sair para o ambiente oficial, mostrar:

- modalidade;
- jogo favorito selecionado;
- números;
- concurso;
- data do sorteio;
- valor unitário;
- quantidade de apostas;
- valor total estimado;
- método de pagamento pretendido;
- gasto acumulado no período;
- limite disponível;
- aviso de que a compra só será válida após comprovante oficial.

### 9.6 Autenticação por código recebido por e-mail

#### Requisito original

O rascunho propõe que o aplicativo acesse a conta Gmail do usuário para localizar automaticamente o código de segurança.

#### Decisão para o MVP

A leitura automática e o preenchimento silencioso do código **não serão implementados no MVP**.

Fluxo aprovado:

1. o canal oficial envia o código;
2. o aplicativo informa que o usuário deve consultar o e-mail;
3. o usuário abre o Gmail por um botão de atalho;
4. o usuário copia o código;
5. o usuário retorna ao canal oficial;
6. o usuário cola ou digita o código diretamente no canal oficial.

O código nunca deverá passar pelo backend do aplicativo.

#### Possível evolução, condicionada a aprovação

Uma funcionalidade de conveniência para localizar a mensagem poderá ser considerada somente se:

- a CAIXA autorizar esse modelo;
- Google OAuth e a verificação do aplicativo forem aprovados;
- o usuário conceder consentimento granular;
- o processamento ocorrer localmente no dispositivo;
- o código não for enviado ao backend;
- o usuário ainda confirmar a utilização;
- o acesso for limitado a mensagens recentes, remetentes autorizados e janela temporal curta;
- o token de acesso puder ser revogado a qualquer momento;
- a equipe jurídica aprovar a finalidade segundo a LGPD.

Mesmo nessa evolução, o aplicativo não deverá usar o código para criar uma aposta sem uma ação explícita do usuário.

### 9.7 Pagamento

O aplicativo deverá utilizar apenas métodos de pagamento disponibilizados pelo canal oficial.

#### Cartão já salvo

- O cartão deverá permanecer salvo exclusivamente no ambiente oficial ou no processador autorizado.
- O aplicativo poderá mostrar somente dados mascarados retornados oficialmente, por exemplo bandeira e últimos quatro dígitos.
- O usuário selecionará o cartão no ambiente oficial.
- O código de segurança será digitado diretamente no formulário oficial.
- O aplicativo não deverá capturar, ler, registrar, retransmitir ou armazenar CVV.

#### Pix

- Quando disponibilizado, o usuário poderá escolher Pix no canal oficial.
- O aplicativo não deverá apresentar uma chave ou QR Code próprio para receber recursos.
- O comprovante de pagamento não substitui o comprovante oficial da aposta.

### 9.8 Confirmação final

A tela de confirmação deverá:

- exibir modalidade, números, concurso e valor;
- exibir aviso de jogo responsável;
- exigir ação deliberada do usuário;
- usar texto inequívoco, como “Confirmar aposta de R$ X”; 
- impedir confirmação por gesto acidental;
- exigir nova confirmação caso o valor ou concurso mude;
- impedir compra se o limite de gasto for excedido;
- gerar uma chave de idempotência por tentativa.

Não utilizar:

- botão pré-selecionado;
- confirmação automática por temporizador;
- biometria como único elemento sem resumo visível;
- repetição automática após falha ambígua.

### 9.9 Status e comprovante

Estados possíveis:

- `DRAFT` — intenção criada;
- `VALIDATING` — concurso e preço sendo verificados;
- `READY_FOR_USER` — pronta para iniciar no canal oficial;
- `AUTHENTICATION_REQUIRED` — autenticação adicional necessária;
- `PAYMENT_REQUIRED` — aguardando pagamento no canal oficial;
- `SUBMITTED` — solicitação enviada, ainda sem confirmação final;
- `CONFIRMED` — comprovante oficial recebido;
- `FAILED` — falha definitiva conhecida;
- `UNKNOWN` — resultado ambíguo; requer consulta antes de nova tentativa;
- `EXPIRED` — concurso ou sessão expirou;
- `CANCELLED` — cancelada pelo usuário.

A aposta só poderá ser apresentada como concluída no estado `CONFIRMED`.

O comprovante deverá conter, quando retornado pela fonte oficial:

- identificador oficial;
- concurso;
- modalidade;
- números;
- valor;
- data e hora;
- canal;
- status;
- referência externa;
- hash do documento, quando aplicável.

### 9.10 Resultados

O aplicativo poderá:

- consultar resultados por fonte oficial;
- comparar os números do comprovante com o resultado;
- notificar o usuário sobre a publicação;
- indicar “possível premiação” quando a validação local não for suficiente;
- direcionar o usuário ao canal oficial para confirmação e resgate.

O aplicativo não deverá declarar definitivamente um prêmio sem validação oficial.

### 9.11 Histórico e relatórios

O usuário poderá visualizar:

- apostas confirmadas;
- apostas não concluídas;
- gastos por semana e mês;
- modalidade;
- resultados;
- possíveis premiações;
- limites configurados;
- comprovantes oficiais.

Não mostrar “retorno sobre investimento” de forma que incentive comportamento compulsivo. Quando exibido, o histórico deverá mostrar de forma equilibrada gasto total, prêmios confirmados e resultado líquido.

---

## 10. Fluxos do usuário

### 10.1 Fluxo feliz — integração oficial

```text
Usuário abre o aplicativo
        |
        v
Seleciona jogo favorito
        |
        v
Aplicativo consulta concurso, preço e elegibilidade
        |
        v
Usuário revisa resumo e limite de gasto
        |
        v
Aplicativo solicita autorização oficial da CAIXA
        |
        v
CAIXA exige autenticação adicional?
    |                     |
   não                   sim
    |                     |
    |             Usuário consulta e-mail
    |                     |
    |             Digita código na CAIXA
    |                     |
    +-----------> Sessão autorizada
                          |
                          v
                Usuário seleciona cartão salvo
                          |
                          v
                Digita CVV na página oficial
                          |
                          v
                Revisa e confirma a aposta
                          |
                          v
                CAIXA processa a operação
                          |
                          v
                Aplicativo recebe comprovante oficial
                          |
                          v
                Status = CONFIRMED
```

### 10.2 Fluxo permitido sem API oficial

```text
Usuário seleciona favorito
        |
        v
Aplicativo monta instruções e resumo
        |
        v
Usuário toca em "Continuar na CAIXA"
        |
        v
Navegador ou aplicativo oficial é aberto
        |
        v
Usuário autentica, localiza ou recria o jogo
        |
        v
Usuário paga e confirma no canal oficial
        |
        v
Usuário retorna ao aplicativo
        |
        v
Aplicativo consulta confirmação oficial, se permitido,
ou solicita importação manual do comprovante
```

### 10.3 Fluxo de status ambíguo

1. O usuário confirma a compra.
2. A conexão é interrompida.
3. O aplicativo não recebe resposta definitiva.
4. O status passa para `UNKNOWN`.
5. O botão “Tentar novamente” permanece bloqueado.
6. O sistema consulta o status pela referência/idempotency key.
7. Se houver comprovante, atualiza para `CONFIRMED`.
8. Se a CAIXA confirmar que não houve compra, atualiza para `FAILED` e libera nova tentativa.
9. Se continuar ambíguo, orienta o usuário a consultar o histórico oficial ou suporte.

---

## 11. User stories e critérios de aceite

### US-01 — Selecionar jogo favorito

**Como** usuário adulto,  
**quero** selecionar um jogo salvo,  
**para** não redigitar os números.

**Critérios de aceite:**

- Dado que tenho jogos ativos, quando abro a lista, então vejo nome, modalidade e números.
- Quando seleciono um jogo, o aplicativo valida se a combinação ainda é permitida.
- Um favorito inválido não pode iniciar uma compra.
- A seleção não gera cobrança nem aposta.

### US-02 — Revisar concurso e valor

**Como** usuário,  
**quero** revisar concurso, sorteio e valor,  
**para** saber exatamente o que estou comprando.

**Critérios de aceite:**

- O concurso é obtido de fonte oficial.
- A data e o horário limite são mostrados em horário de Brasília.
- O valor é atualizado imediatamente antes da confirmação.
- Mudanças de valor exigem nova confirmação.

### US-03 — Autenticar com código

**Como** usuário,  
**quero** acessar rapidamente meu e-mail,  
**para** concluir a autenticação exigida pela CAIXA.

**Critérios de aceite:**

- O aplicativo oferece atalho para abrir o provedor de e-mail.
- O usuário digita ou cola o código no ambiente oficial.
- O backend não recebe o código.
- O código não aparece em logs, analytics ou crash reports.
- Expiração ou erro do código apresenta orientação, sem repetição automática.

### US-04 — Pagar com cartão salvo

**Como** usuário,  
**quero** usar um cartão já salvo na CAIXA,  
**para** evitar redigitar todos os dados.

**Critérios de aceite:**

- O aplicativo não armazena PAN, data de validade ou CVV.
- O cartão é selecionado no ambiente oficial.
- O CVV é digitado no componente oficial de pagamento.
- O valor total permanece visível antes da confirmação.

### US-05 — Confirmar aposta

**Como** usuário,  
**quero** confirmar explicitamente a aposta,  
**para** evitar compras acidentais.

**Critérios de aceite:**

- A tela apresenta todos os dados essenciais.
- O texto do botão inclui o valor.
- O sistema verifica os limites de gasto.
- Cada confirmação gera uma idempotency key única.
- Um duplo toque não gera duas compras.

### US-06 — Receber comprovante

**Como** usuário,  
**quero** receber o comprovante oficial,  
**para** saber que a aposta foi efetivada.

**Critérios de aceite:**

- O aplicativo não marca a aposta como confirmada antes do comprovante.
- O comprovante contém referência oficial ou documento importado validado.
- O usuário pode abrir ou exportar o comprovante.
- Falha de armazenamento local não altera o status oficial.

### US-07 — Controlar gasto

**Como** usuário,  
**quero** definir um limite de gasto,  
**para** manter controle sobre minhas apostas.

**Critérios de aceite:**

- O usuário pode definir limites diário, semanal e mensal.
- Reduzir o limite tem efeito imediato.
- Aumentar o limite pode exigir período de espera.
- Ao atingir o limite, novas apostas são bloqueadas.
- O bloqueio não pode ser removido na mesma tela de compra.

### US-08 — Evitar duplicidade

**Como** usuário,  
**quero** que uma falha de rede não gere duas apostas,  
**para** não ser cobrado em duplicidade.

**Critérios de aceite:**

- O sistema cria uma idempotency key por intenção.
- Requisições repetidas com a mesma chave não criam nova compra.
- Estado `UNKNOWN` bloqueia retentativa até reconciliação.
- O sistema executa reconciliação com a fonte oficial.

---

## 12. Requisitos não funcionais

### 12.1 Segurança

- TLS 1.2 ou superior em trânsito.
- Criptografia forte em repouso.
- Segredos armazenados em secret manager.
- Tokens de integração com menor escopo e curta duração.
- Rotação e revogação de tokens.
- Proteção contra credential stuffing e brute force.
- Biometria ou passkey para ações sensíveis.
- Certificate pinning avaliado para aplicativos móveis.
- Proteção contra root/jailbreak avaliada conforme risco.
- Nenhum dado sensível em URL, query string, logs ou analytics.
- Redação automática de campos sensíveis em observabilidade.
- Testes SAST, DAST, SCA e pentest antes do lançamento.
- Threat modeling obrigatório para autenticação, pagamento e comprovante.

### 12.2 Privacidade e LGPD

- Consentimento específico para cada integração.
- Política de privacidade clara e acessível.
- Finalidade e base legal documentadas.
- Minimização de dados.
- Direito de acesso, correção, exportação e exclusão.
- Retenção configurável e documentada.
- Registro de consentimento e revogação.
- Data Protection Impact Assessment antes de integrar Gmail.
- Não utilizar conteúdo de e-mail para publicidade, perfil ou recomendação.
- Não compartilhar dados de aposta com terceiros não essenciais.

### 12.3 Confiabilidade

- Disponibilidade alvo do aplicativo: 99,9%, excluindo dependências externas.
- Operações transacionais devem usar idempotência.
- Reconciliação automática de status pendente ou desconhecido.
- Circuit breaker para serviços externos.
- Retentativas somente em operações comprovadamente seguras.
- Timeouts explícitos.
- Dead-letter queue para eventos não processados.
- Backups e plano de recuperação.
- RPO e RTO definidos antes do lançamento.

### 12.4 Performance

- Home carregada em até 2 segundos no percentil 95, em rede adequada.
- Lista de favoritos em até 1 segundo no percentil 95.
- Validação de concurso em até 3 segundos no percentil 95, sem contar indisponibilidade externa.
- Ações locais devem fornecer feedback visual em até 100 ms.

### 12.5 Acessibilidade

- Compatibilidade com leitores de tela.
- Contraste adequado.
- Alvos de toque acessíveis.
- Não depender apenas de cor para status.
- Valores monetários e números lidos corretamente.
- Texto simples e sem linguagem manipulativa.

### 12.6 Observabilidade

Cada jornada deverá possuir:

- `correlation_id`;
- `user_id` pseudonimizado;
- `bet_intent_id`;
- `idempotency_key_hash`;
- timestamps por etapa;
- status anterior e novo;
- código de erro normalizado;
- dependência externa envolvida;
- indicador de confirmação oficial.

Nunca registrar:

- senha;
- código de autenticação;
- token OAuth completo;
- cookies de sessão;
- PAN completo;
- CVV;
- conteúdo integral de e-mail;
- comprovante sem proteção de acesso.

---

## 13. Arquitetura proposta

### 13.1 Visão de alto nível

```text
+------------------------+
| Mobile / Web Client    |
| - favoritos            |
| - resumo               |
| - limites              |
| - comprovantes         |
+-----------+------------+
            |
            | OAuth/passkey + TLS
            v
+------------------------+
| Backend for Frontend   |
| - sessão               |
| - autorização          |
| - rate limiting        |
+-----------+------------+
            |
   +--------+---------+----------------+----------------+
   |                  |                |                |
   v                  v                v                v
+----------+   +-------------+  +-------------+  +-------------+
| Favorites|   | Bet Intent  |  | Responsible |  | Notification|
| Service  |   | Orchestrator|  | Gaming      |  | Service     |
+----------+   +------+------+  +-------------+  +-------------+
                     |
                     | somente integração autorizada
                     v
             +---------------------+
             | CAIXA Integration   |
             | Adapter             |
             +----------+----------+
                        |
                        v
             +---------------------+
             | Canal oficial CAIXA |
             | / parceiro de       |
             | pagamento           |
             +---------------------+
```

### 13.2 Componentes

#### Client

- armazenamento local seguro para tokens do próprio aplicativo;
- exibição de favoritos, limites e comprovantes;
- abertura do canal oficial;
- biometria/passkey;
- nenhuma captura de senha, CVV ou OTP da CAIXA.

#### Backend for Frontend

- autenticação do usuário;
- autorização por recurso;
- rate limiting;
- agregação de dados;
- geração de correlation ID;
- aplicação de políticas de segurança.

#### Favorites Service

- CRUD de jogos favoritos;
- validação de combinações;
- versionamento das regras;
- importação autorizada.

#### Bet Intent Orchestrator

- criação da intenção;
- máquina de estados;
- idempotência;
- coordenação com integração oficial;
- reconciliação;
- emissão de eventos de domínio.

#### Responsible Gaming Service

- limites de gasto;
- cooldown;
- autoexclusão;
- alertas de comportamento;
- bloqueio de jornada.

#### CAIXA Integration Adapter

- encapsulamento da integração oficial;
- tradução de contratos;
- autenticação delegada;
- tratamento de erros;
- circuit breaker;
- nenhuma dependência de endpoints privados.

#### Receipt Service

- armazenamento seguro de metadados;
- documento criptografado;
- controle de acesso;
- retenção;
- verificação de integridade.

---

## 14. Modelo de dados inicial

### 14.1 User

```text
User
- id: UUID
- email: string
- birth_date_verification_status: enum
- account_status: enum
- created_at: timestamp
- updated_at: timestamp
- self_excluded_until: timestamp?
```

Evitar armazenar data de nascimento completa quando uma declaração ou verificação tokenizada de maioridade for suficiente.

### 14.2 FavoriteGame

```text
FavoriteGame
- id: UUID
- user_id: UUID
- nickname: string
- lottery_type: string
- selections: encrypted/json
- configuration: encrypted/json
- source: enum
- rule_version: string
- status: enum
- created_at: timestamp
- updated_at: timestamp
```

### 14.3 BetIntent

```text
BetIntent
- id: UUID
- user_id: UUID
- favorite_game_id: UUID
- lottery_type: string
- contest_number: string
- draw_at: timestamp
- estimated_amount: decimal
- confirmed_amount: decimal?
- currency: BRL
- status: enum
- idempotency_key_hash: string
- external_reference: string?
- expires_at: timestamp
- created_at: timestamp
- updated_at: timestamp
```

### 14.4 OfficialReceipt

```text
OfficialReceipt
- id: UUID
- bet_intent_id: UUID
- external_reference: string
- official_status: string
- amount: decimal
- contest_number: string
- issued_at: timestamp
- encrypted_document_location: string?
- document_hash: string?
- created_at: timestamp
```

### 14.5 SpendingLimit

```text
SpendingLimit
- id: UUID
- user_id: UUID
- daily_limit: decimal?
- weekly_limit: decimal?
- monthly_limit: decimal?
- increase_effective_at: timestamp?
- created_at: timestamp
- updated_at: timestamp
```

### 14.6 AuditEvent

```text
AuditEvent
- id: UUID
- actor_id: UUID/string
- event_type: string
- entity_type: string
- entity_id: UUID
- correlation_id: string
- metadata_redacted: json
- occurred_at: timestamp
```

---

## 15. APIs internas sugeridas

> Estes contratos são internos. A integração transacional externa depende de API oficial.

### Criar intenção

```http
POST /v1/bet-intents
Idempotency-Key: <uuid>
Authorization: Bearer <token>
Content-Type: application/json

{
  "favoriteGameId": "uuid",
  "contestNumber": "optional"
}
```

Resposta:

```json
{
  "id": "uuid",
  "status": "VALIDATING",
  "correlationId": "string"
}
```

### Obter resumo

```http
GET /v1/bet-intents/{id}/summary
```

### Confirmar intenção local

A confirmação local autoriza apenas o início da jornada oficial. Não equivale à compra.

```http
POST /v1/bet-intents/{id}/authorize-handoff
Idempotency-Key: <uuid>
```

Resposta:

```json
{
  "handoffUrl": "official-or-approved-url",
  "expiresAt": "timestamp"
}
```

### Consultar status

```http
GET /v1/bet-intents/{id}
```

### Importar comprovante manualmente

```http
POST /v1/bet-intents/{id}/receipt-import
Content-Type: multipart/form-data
```

O upload deverá passar por antivírus, validação de tipo, limite de tamanho e criptografia.

---

## 16. Idempotência e prevenção de duplicidade

### Estratégia

- O cliente gera uma chave única para cada tentativa deliberada.
- O backend associa a chave ao usuário, operação e payload normalizado.
- A mesma chave com o mesmo payload retorna o resultado anterior.
- A mesma chave com payload diferente retorna conflito.
- A chave é propagada à integração oficial, quando suportada.
- O comprovante oficial é a fonte de verdade.

### Regras de retentativa

- `DRAFT`, `VALIDATING` e `READY_FOR_USER`: retentativas locais permitidas quando idempotentes.
- `SUBMITTED`: não reenviar compra automaticamente.
- `UNKNOWN`: bloquear nova tentativa e reconciliar.
- `FAILED`: permitir nova tentativa apenas quando a falha definitiva indicar que nenhuma compra ocorreu.
- `CONFIRMED`: nunca repetir automaticamente.

### Reconciliação

Executar reconciliação para intenções em `SUBMITTED` ou `UNKNOWN`:

1. consultar a referência oficial;
2. verificar histórico da conta, quando autorizado;
3. procurar comprovante correspondente;
4. comparar concurso, valor e timestamp;
5. atualizar o estado;
6. gerar alerta operacional se persistir ambíguo.

---

## 17. Segurança de e-mail e Gmail

### Riscos

- acesso excessivo à caixa de entrada;
- exposição de códigos de autenticação de outros serviços;
- comprometimento do token OAuth;
- preenchimento automático de MFA sem intenção atual;
- reprovação do aplicativo pelo provedor;
- violação de finalidade e privacidade;
- códigos registrados acidentalmente em logs;
- tomada de conta caso dispositivo e e-mail sejam comprometidos juntos.

### Requisitos para qualquer futura integração

- OAuth; nunca solicitar senha do Gmail.
- Menor escopo possível.
- Consentimento separado da funcionalidade principal.
- Funcionalidade opcional e desativada por padrão.
- Revogação dentro do aplicativo.
- Tokens criptografados e vinculados ao dispositivo, quando possível.
- Filtro estrito por remetente, assunto e janela temporal.
- Processamento local preferencial.
- Não persistir corpo de mensagem.
- Não enviar OTP ao backend.
- Não usar a permissão para analytics, marketing ou treinamento.
- Auditoria de acesso sem conteúdo sensível.
- Revisão de segurança e privacidade independente.

### Recomendação

Para o MVP, substituir “ler automaticamente o código do Gmail” por **atalho para abrir o Gmail + retorno facilitado ao fluxo**, preservando o usuário como parte ativa da autenticação.

---

## 18. Segurança de pagamento e PCI

### Regras obrigatórias

- Não armazenar CVV em nenhuma circunstância.
- Não armazenar número completo do cartão.
- Não fazer proxy de campos de cartão pelo backend.
- Utilizar página, SDK ou componente hospedado pelo processador autorizado.
- Não registrar conteúdo de formulário de pagamento.
- Desabilitar captura de tela em telas sensíveis, quando apropriado.
- Impedir que ferramentas de sessão gravem campos sensíveis.
- Revisar escopo PCI DSS com especialista antes do lançamento.
- Preferir tokenização e referências fornecidas pelo processador.

### Exibição permitida

Somente quando fornecida oficialmente:

- bandeira;
- últimos quatro dígitos;
- nome amigável;
- status do método;
- data de validade mascarada, se necessária.

---

## 19. Jogo responsável

### Requisitos mínimos

- confirmação de maioridade;
- limites diário, semanal e mensal;
- histórico de gasto facilmente acessível;
- opção de pausa temporária;
- autoexclusão;
- mensagens de uso responsável;
- ausência de notificações agressivas;
- proibição de linguagem como “dinheiro fácil”;
- bloqueio de crédito e parcelamento oferecidos pelo próprio aplicativo;
- suporte a pedido de encerramento de conta;
- canal de ajuda e recursos oficiais.

### Notificações permitidas

- confirmação de aposta;
- publicação de resultado;
- expiração de uma intenção já iniciada;
- alteração relevante em jogo favorito;
- aviso de limite atingido.

### Notificações proibidas ou restritas

- “Você está com sorte”; 
- “Não perca a chance de recuperar suas perdas”; 
- notificações repetidas para estimular aposta;
- urgência artificial;
- uso de prêmio estimado sem contexto;
- campanha direcionada a usuário autoexcluído.

---

## 20. Tratamento de erros

### Categorias

- autenticação expirada;
- código inválido ou expirado;
- concurso encerrado;
- jogo inválido;
- alteração de preço;
- método de pagamento recusado;
- indisponibilidade da CAIXA;
- timeout do processador;
- resposta ambígua;
- duplicidade detectada;
- limite de gasto atingido;
- conta autoexcluída;
- integração revogada.

### Princípios de mensagem

- explicar o que aconteceu em linguagem simples;
- informar se houve ou não confirmação da aposta;
- não sugerir nova tentativa quando o estado for ambíguo;
- fornecer ação segura seguinte;
- não expor stack trace, IDs internos ou dados sensíveis;
- incluir referência de suporte quando necessário.

Exemplo para falha ambígua:

> Não foi possível confirmar se a aposta foi registrada. Para evitar uma compra duplicada, uma nova tentativa está temporariamente bloqueada enquanto verificamos o status no canal oficial.

---

## 21. Métricas

### 21.1 North Star Metric

**Percentual de intenções iniciadas que resultam em comprovante oficial, sem erro, duplicidade ou intervenção do suporte.**

### 21.2 Métricas de funil

- visualização de favoritos;
- favorito selecionado;
- resumo validado;
- handoff iniciado;
- autenticação concluída;
- pagamento iniciado;
- compra submetida;
- comprovante confirmado.

### 21.3 Métricas de experiência

- tempo mediano para concluir a jornada;
- número de passos percebidos;
- taxa de abandono por etapa;
- taxa de retorno após abrir o e-mail;
- taxa de importação manual de comprovante;
- CSAT após a jornada.

### 21.4 Métricas de segurança e qualidade

- apostas duplicadas: meta zero;
- compras sem consentimento: meta zero;
- exposição de CVV ou OTP: meta zero;
- incidentes de acesso indevido a e-mail: meta zero;
- intenções em `UNKNOWN` por 1.000 jornadas;
- tempo médio de reconciliação;
- falhas por dependência externa;
- tokens OAuth revogados ou expirados;
- acessos bloqueados por risco.

### 21.5 Métricas de jogo responsável

- usuários com limite configurado;
- bloqueios por limite;
- uso de pausa e autoexclusão;
- notificações enviadas por usuário;
- reclamações por estímulo excessivo;
- tentativas bloqueadas durante autoexclusão.

Métricas de crescimento nunca poderão se sobrepor a controles de segurança ou jogo responsável.

---

## 22. Analytics e eventos

Eventos sugeridos:

```text
favorite_created
favorite_selected
bet_intent_created
contest_validated
summary_viewed
handoff_started
authentication_required
email_app_opened
payment_step_reached
user_confirmed_purchase
bet_submitted
bet_confirmed
bet_status_unknown
bet_failed
receipt_imported
result_published
possible_prize_detected
spending_limit_reached
self_exclusion_enabled
```

Propriedades proibidas:

- números completos do cartão;
- CVV;
- OTP;
- senha;
- corpo de e-mail;
- cookies;
- token OAuth;
- conteúdo integral do comprovante.

Os números apostados devem ser tratados como dados privados e só enviados ao analytics após avaliação de necessidade, preferencialmente de forma agregada ou pseudonimizada.

---

## 23. Riscos e mitigação

| Risco | Impacto | Probabilidade | Mitigação |
|---|---:|---:|---|
| Termos da CAIXA não permitem automação | Crítico | Alta até validação | Gate jurídico e uso apenas de integração oficial |
| Mudança no site quebra o fluxo | Alto | Alta em scraping | Não usar scraping em produção; adapter oficial |
| Código de e-mail exposto | Crítico | Média | Não processar OTP no backend; fluxo manual no MVP |
| CVV armazenado acidentalmente | Crítico | Baixa com desenho correto | Campos hospedados, redaction, testes e revisão PCI |
| Aposta duplicada por timeout | Crítico | Média | Idempotência, estado UNKNOWN e reconciliação |
| Menor de idade usa o produto | Crítico | Média | Verificação de maioridade, controles e auditoria |
| Incentivo a jogo compulsivo | Alto | Média | Limites, autoexclusão e políticas de notificação |
| Comprovante local diverge do oficial | Alto | Média | Canal oficial como fonte de verdade |
| Conta Gmail comprometida | Crítico | Média | Sem integração no MVP; OAuth mínimo em evolução |
| App Store rejeita o aplicativo | Alto | Média | Revisão antecipada das políticas e licenças |
| CAIXA indisponível próximo ao prazo | Médio | Alta | Mostrar indisponibilidade; nunca prometer conclusão |
| Usuário confunde intenção com aposta | Alto | Média | Linguagem e estados explícitos; comprovante obrigatório |

---

## 24. Plano de entrega

### Fase 0 — Discovery e viabilidade

- pesquisa com usuários;
- mapeamento da jornada atual;
- análise de termos e regulação;
- contato com a CAIXA para parceria/API;
- threat modeling inicial;
- avaliação de políticas Apple/Google;
- protótipo de baixa fidelidade;
- decisão go/no-go.

**Saída:** parecer formal sobre o modelo permitido.

### Fase 1 — Assistente não transacional

- cadastro e autenticação;
- jogos favoritos;
- consulta de concursos e resultados oficiais;
- resumo da intenção;
- limites de gasto;
- abertura do canal oficial;
- retorno manual;
- importação de comprovante;
- notificações de resultado.

**Objetivo:** validar conveniência sem automatizar compra.

### Fase 2 — Handoff oficial

Condicionada a parceria ou mecanismo suportado:

- deep link ou sessão autorizada;
- transferência de intenção ao canal oficial;
- callback de status;
- comprovante oficial;
- reconciliação automática.

### Fase 3 — Integração transacional oficial

Condicionada a contrato e APIs:

- criação da aposta por API oficial;
- autenticação delegada;
- pagamento tokenizado no ambiente autorizado;
- idempotência ponta a ponta;
- auditoria e reconciliação.

### Fase 4 — Conveniência de e-mail opcional

Somente após aprovação específica:

- OAuth do Gmail;
- filtro local de mensagem;
- consentimento granular;
- revisão independente de privacidade e segurança;
- testes de abuso e tomada de conta.

---

## 25. Critérios de lançamento do MVP

O MVP só poderá ser liberado quando:

- parecer jurídico aprovar o modelo;
- fluxo não utilizar scraping transacional;
- idade mínima for verificada;
- limites de gasto estiverem ativos;
- CVV e OTP não passarem pelo backend;
- threat model estiver aprovado;
- pentest não apresentar vulnerabilidade crítica ou alta não tratada;
- política de privacidade estiver publicada;
- observabilidade possuir redaction validada;
- estados `UNKNOWN` e reconciliação estiverem testados;
- não houver possibilidade conhecida de duplicidade por duplo clique ou retentativa;
- suporte possuir runbooks;
- mensagens não confundirem intenção com compra confirmada;
- a confirmação depender de comprovante oficial.

---

## 26. Testes essenciais

### Funcionais

- criar, editar, arquivar e excluir favorito;
- validar combinações por modalidade;
- selecionar concurso disponível;
- bloquear concurso encerrado;
- recalcular valor;
- aplicar limites;
- abrir canal oficial;
- importar comprovante;
- comparar resultado.

### Segurança

- tentativa de inserir CVV em campo local;
- vazamento de OTP em log;
- token OAuth revogado;
- sessão roubada;
- IDOR em comprovantes;
- brute force;
- replay de idempotency key;
- payload modificado com mesma chave;
- malware no arquivo de comprovante;
- captura de dados por analytics.

### Resiliência

- timeout antes da submissão;
- timeout depois da submissão;
- callback duplicado;
- eventos fora de ordem;
- indisponibilidade da CAIXA;
- indisponibilidade do banco de dados;
- retentativa do cliente;
- troca de concurso durante a jornada;
- preço alterado antes da confirmação.

### Jogo responsável

- menor de idade;
- limite diário atingido;
- aumento de limite com cooldown;
- autoexclusão ativa;
- tentativa de reativação imediata;
- usuário autoexcluído recebendo campanha.

---

## 27. Runbooks operacionais

Criar runbooks para:

- aposta em estado `UNKNOWN`;
- suspeita de duplicidade;
- comprovante não localizado;
- indisponibilidade da CAIXA;
- incidente de privacidade;
- token Gmail comprometido;
- vazamento potencial de CVV ou OTP;
- concurso ou preço divergente;
- usuário menor de idade;
- solicitação de autoexclusão;
- exclusão de conta e dados;
- contestação de cobrança;
- recall de versão móvel.

O suporte não deverá solicitar senha, CVV ou código de autenticação ao usuário.

---

## 28. Questões em aberto

1. Existe API oficial para criação e consulta de apostas?
2. A CAIXA permite que terceiros iniciem uma aposta em nome do usuário?
3. Existe deep link para favorito, modalidade, carrinho ou concurso?
4. Como a CAIXA identifica uma operação para idempotência?
5. É possível receber webhook de confirmação?
6. O comprovante possui assinatura ou mecanismo de validação?
7. O usuário poderá importar favoritos da CAIXA?
8. Quais modalidades entram no MVP?
9. Qual é o prazo máximo aceitável para reconciliação?
10. Qual abordagem de verificação de maioridade será aceita?
11. Quais exigências adicionais as lojas de aplicativos impõem?
12. Qual retenção é necessária para comprovantes?
13. O produto será pessoal, fechado para um usuário, ou comercial?
14. Quem será o controlador e quem será o operador de dados?
15. A integração com Gmail é realmente necessária após testar o fluxo de handoff?
16. O Pix reduz etapas e risco em comparação com cartão salvo?
17. Como impedir que notificações sejam interpretadas como incentivo a apostar?

---

## 29. Decisões registradas

### ADR-PROD-001 — Não armazenar CVV

**Decisão:** o CVV será informado somente no ambiente oficial de pagamento.  
**Motivo:** reduzir risco, escopo PCI e possibilidade de fraude.  
**Consequência:** o usuário continuará participando manualmente de cada compra.

### ADR-PROD-002 — Não automatizar OTP no MVP

**Decisão:** o usuário abrirá o e-mail e copiará o código.  
**Motivo:** preservar a finalidade da autenticação, reduzir risco de tomada de conta e evitar acesso excessivo ao Gmail.  
**Consequência:** a jornada terá uma etapa manual, mitigada por atalho e retorno facilitado.

### ADR-PROD-003 — Comprovante oficial como fonte de verdade

**Decisão:** somente o comprovante oficial muda o estado para `CONFIRMED`.  
**Motivo:** uma cobrança ou submissão não garante que a aposta foi registrada.  
**Consequência:** estados ambíguos exigem reconciliação.

### ADR-PROD-004 — Sem automação transacional não autorizada

**Decisão:** scraping, headless browser e endpoints privados não serão usados em produção para efetuar apostas.  
**Motivo:** fragilidade, segurança, termos de uso e risco regulatório.  
**Consequência:** a primeira versão pode ser um assistente com handoff ao canal oficial.

### ADR-PROD-005 — Confirmação humana por aposta

**Decisão:** toda aposta exige ação explícita imediatamente antes da compra.  
**Motivo:** consentimento, segurança e jogo responsável.  
**Consequência:** não haverá execução silenciosa, recorrente ou agendada.

---

## 30. Referências oficiais consultadas

As seguintes páginas oficiais foram utilizadas apenas para validar premissas gerais deste rascunho:

- Loterias Online CAIXA — canal oficial de vendas de apostas pela internet.
- Aplicativo Loterias CAIXA — informações sobre apostas e formas de pagamento digitais.
- CAIXA Notícias — informações históricas sobre uso de cartão salvo no portal.
- CAIXA Jogo Responsável — maioridade, limites e prevenção de danos associados ao jogo.
- CAIXA Notícias sobre Bolão — cadastro, maioridade e formas de pagamento nos canais digitais.

As regras, preços, horários, meios de pagamento e condições comerciais deverão ser novamente verificados na fase de discovery e antes de cada release.

---

## 31. Definição resumida do MVP aprovado

> Um aplicativo que organiza jogos favoritos, valida concurso e valor, aplica limites de jogo responsável e conduz o usuário ao canal oficial da CAIXA para autenticação, pagamento e confirmação. O usuário consulta manualmente o código de segurança no e-mail e informa manualmente o CVV no ambiente oficial. O aplicativo registra a aposta somente após obter ou importar um comprovante oficial.

