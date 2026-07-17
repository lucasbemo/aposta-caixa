// SINGLE SOURCE OF TRUTH for CAIXA DOM selectors.
// Filled from a real capture session (2026-07-16). The login happens on a
// separate Keycloak host (login.caixa.gov.br) as a multi-step wizard, and the
// order is: CPF -> request email code -> enter code -> enter password.
// Values still marked CONFIRMAR need one more live dry-run to nail down.
export const CAIXA_URL = 'https://www.loteriasonline.caixa.gov.br/silce-web/#/home';
export const CARRINHOS_FAVORITOS_URL = 'https://www.loteriasonline.caixa.gov.br/silce-web/#/carrinhos/favoritos';
export const CARRINHO_URL = 'https://www.loteriasonline.caixa.gov.br/silce-web/#/carrinho';
export const KEYCLOAK_HOST = 'login.caixa.gov.br';
export const LOGGED_IN_URL_FRAGMENT = '/silce-web/#/home';

export const selectors = {
  // Terms-of-use modal shown before reaching home; must be accepted first.
  terms: {
    acceptButtonIds: ['#botaosim', '#confirmarModalSim'],
    acceptButtonTexts: ['Sim', 'Confirmar', 'Entendi'],
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
    // NOTE: in the automated flow the saved-card <select id="cardId"> did NOT
    // render/populate on the payment page (only a "terminado em" placeholder),
    // and the "Continuar"/CVV controls were not visible — the payment-method
    // step ("#container-meio-pagamento") needs interaction the automation has
    // not reliably reproduced. This is why the design leans to HITL at payment.
    cardSelect: 'select#cardId', // saved-card select (seen in a manual session; not reliable via automation)
    proceedButton: 'button#pay', // "Continuar" -> opens the CVV confirmation modal
    totalAmount: 'span#valortotalapostas', // e.g. "R$ 78,00" — confirmed live
    contestNumber: 'CONFIRMAR', // label "Concurso:" exists; value element not yet pinned
  },

  // CVV confirmation modal (shown after clicking checkout.proceedButton).
  payment: {
    cvvInput: 'input#securityCode',
    confirmButton: 'button#confirmarModalConfirmacao', // "Confirmar" == FINAL PAYMENT
    cancelButton: 'button.data-cancelar-modal-confirmacao', // "Cancelar"
  },

  receipt: {
    confirmationNumber: 'CONFIRMAR', // only capturable from a real completed bet (Task 11)
  },
} as const;
