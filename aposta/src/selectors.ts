// SINGLE SOURCE OF TRUTH for CAIXA DOM selectors.
// Values marked CONFIRMAR are placeholders — fill from `npx playwright codegen`
// against loteriasonline.caixa.gov.br during the Phase 0 walkthrough (Task 9).
export const CAIXA_URL = 'https://loteriasonline.caixa.gov.br/';

export const selectors = {
  login: {
    cpfInput: 'input[name="cpf"]',          // CONFIRMAR
    passwordInput: 'input[name="senha"]',   // CONFIRMAR
    submitButton: 'button[type="submit"]',  // CONFIRMAR
  },
  otp: {
    codeInput: 'input[name="codigo"]',      // CONFIRMAR
    submitButton: 'button[type="submit"]',  // CONFIRMAR
  },
  carrinhos: {
    menuLink: 'text=Carrinhos Favoritos',   // CONFIRMAR
    itemByName: (name: string) => `text=${name}`, // CONFIRMAR
    addToCartButton: 'text=Adicionar',      // CONFIRMAR
  },
  checkout: {
    goToCheckoutButton: 'text=Ir para pagamento', // CONFIRMAR
    totalAmount: '.total',                  // CONFIRMAR
    contestNumber: '.concurso',             // CONFIRMAR
    cardOptionByLast4: (l4: string) => `text=•••• ${l4}`, // CONFIRMAR
  },
  payment: {
    cvvInput: 'input[name="cvv"]',          // CONFIRMAR
    payButton: 'text=Confirmar pagamento',  // CONFIRMAR
  },
  receipt: {
    confirmationNumber: '.comprovante-numero', // CONFIRMAR
  },
} as const;
