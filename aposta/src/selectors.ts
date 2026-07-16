// SINGLE SOURCE OF TRUTH for CAIXA DOM selectors.
// Filled from a real capture session (2026-07-16). The login happens on a
// separate Keycloak host (login.caixa.gov.br) as a multi-step wizard, and the
// order is: CPF -> request email code -> enter code -> enter password.
// Values still marked CONFIRMAR need one more live dry-run to nail down.
export const CAIXA_URL = 'https://www.loteriasonline.caixa.gov.br/silce-web/#/home';
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
    menuTab: 'a#carrinhotxt', // "Carrinhos Favoritos"
    // Each saved cart row exposes an "Incluir no carrinho" icon:
    includeIcon: 'a.incluir_carrinho',
    // Selecting the RIGHT cart by name: locate the row containing the exact
    // cart name text, then click the include icon within it. The precise row
    // container class is CONFIRMAR (needs the dry-run to pin down).
    rowContainer: 'CONFIRMAR', // e.g. '.carrinho-favorito-item'
    viewBetsLink: 'a:has-text("Ver apostas")',
  },

  carrinho: {
    goToPaymentButton: 'button#irparapagamento', // "Ir para pagamento"
    clearCartButton: 'button#limparcarrinho',
  },

  checkout: {
    cardSelect: 'select#cardId', // <select> of saved cards; options like "Mastercard terminado em 9088"
    proceedButton: 'button#pay', // "Continuar" -> opens the CVV confirmation modal
    totalAmount: 'CONFIRMAR', // amount element — pin down in dry-run
    contestNumber: 'CONFIRMAR', // contest element — pin down in dry-run
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
