// SINGLE SOURCE OF TRUTH for CAIXA DOM selectors.
// Filled from a real capture session (2026-07-16). The login happens on a
// separate Keycloak host (login.caixa.gov.br) as a multi-step wizard, and the
// order is: CPF -> request email code -> enter code -> enter password.
// Values still marked CONFIRMAR need one more live dry-run to nail down.
export const CAIXA_URL = 'https://www.loteriasonline.caixa.gov.br/silce-web/#/home';
export const CARRINHOS_FAVORITOS_URL = 'https://www.loteriasonline.caixa.gov.br/silce-web/#/carrinhos/favoritos';
export const CARRINHO_URL = 'https://www.loteriasonline.caixa.gov.br/silce-web/#/carrinho';
export const COMPRAS_URL = 'https://www.loteriasonline.caixa.gov.br/silce-web/#/compras';
export const KEYCLOAK_HOST = 'login.caixa.gov.br';
export const LOGGED_IN_URL_FRAGMENT = '/silce-web/#/home';

export const selectors = {
  // Terms-of-use modal shown before reaching home; must be accepted first.
  terms: {
    acceptButtonIds: ['#botaosim', '#confirmarModalSim'],
    acceptButtonTexts: ['Sim', 'Confirmar', 'Entendi'],
  },

  // Promotion/notification modals (e.g. "LOTOFÁCIL DA INDEPENDÊNCIA") shown
  // mainly on home. No stable ids — detected generically by container class.
  // Two container classes exist: Bootstrap `.modal.in` dialogs, and the
  // header-rendered `.modal-notificacao-container` (ng-if on
  // notificacaoNaoVisualizada — seen blocking Carrinhos Favoritos 2026-07-23).
  // Designs: docs/superpowers/specs/2026-07-19-promo-modal-guard-design.md
  //          docs/superpowers/specs/2026-07-23-modal-resilience-design.md
  promo: {
    modalContainer: '.modal.in',
    notificationContainer: '.modal-notificacao-container',
    backdrop: '.modal-backdrop.in',
    closeButtonText: 'Fechar', // exact-match; never an affirmative button
    dontShowAgainLabel: /não mostrar mais/i, // "Não mostrar mais essa notificação"
  },

  // "Existem N concursos abertos para a X. Deseja incluir no carrinho qual
  // concurso?" — radios (special contest / plain name / "Ambos" pre-selected)
  // + "Incluir no carrinho". Shown when a special contest (Mega da Virada,
  // Lotofácil da Independência, ...) is open. Design:
  // docs/superpowers/specs/2026-07-23-contest-choice-modal-design.md
  contestChoice: {
    modalText: /concursos abertos/i,
    includeButtonText: 'Incluir no carrinho', // exact
  },

  home: {
    loginLink: 'a#btnLogin', // "Acessar" (shown when logged out)
    loggedInIndicator: 'a#suaconta', // "Minha Conta" (shown when logged in)
  },

  // Keycloak wizard on login.caixa.gov.br
  login: {
    cpfInput: 'input#username',
    cpfNextButton: 'button#button-submit', // "Próximo"
    mailRadio: 'input[name="mail"]', // choose which email receives the code
    requestCodeButton: 'button[name="login"]', // "Receber código" (sends the OTP email)
    passwordInput: 'input#password',
    passwordSubmitText: 'Entrar', // final "Entrar" button (no stable id)
  },

  // Email security code (OTP), also on the Keycloak host. Distinct from the
  // payment CVV field. Comes BEFORE the password step.
  otp: {
    codeInput: 'input#codigo',
    codeSubmitButton: 'button[name="login"]', // "Enviar"
  },

  carrinhos: {
    // Reached by navigating to CARRINHOS_FAVORITOS_URL directly (the menu tab
    // is not reliably clickable from home).
    rowContainer: 'tr', // each saved cart is a table row
    includeIcon: 'a.incluir_carrinho', // "Incluir no carrinho" icon within a row
  },

  carrinho: {
    goToPaymentButton: 'button#irparapagamento', // "Ir para pagamento"
    clearCartButton: 'button#limparcarrinho',
  },

  checkout: {
    // The saved card is NOT a <select>: it's a clickable row/cell showing
    // "**** <last4>" with ng-click="vm.opcoesCollapse(false, cartao, meio.id)".
    // Mapped from a real user click. Select by clicking the cell with the last4.
    cardCellByLast4: (l4: string) => `td:has-text("${l4}"), h4:has-text("${l4}")`,
    proceedButton: 'button#pay', // "Continuar" (ng-click vm.abreModal()) -> opens the CVV popup
    totalAmount: 'span#valortotalapostas', // e.g. "R$ 26,00" — confirmed live
    contestNumber: 'CONFIRMAR', // label "Concurso:" exists; value element not yet pinned
  },

  // CVV popup (shown after clicking checkout.proceedButton / #pay).
  payment: {
    cvvInput: 'input#securityCode',
    confirmButton: 'button#confirmarModalConfirmacao', // "Confirmar" == FINAL PAYMENT (mapped from real click)
    cancelButton: 'button:has-text("Cancelar")',
  },

  receipt: {
    confirmationNumber: 'CONFIRMAR', // only capturable from a real completed bet (Task 11)
  },
} as const;
