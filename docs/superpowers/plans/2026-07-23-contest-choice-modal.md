# Contest-Choice Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the "Existem N concursos abertos para a X" modal appears while including the favorite cart, select the lottery's plain-name radio (never "Ambos"), then click "Incluir no carrinho" — aborting with evidence if the radio cannot be selected.

**Architecture:** A pure, unit-tested chooser (`chooseContestLabel`) plus a module-private Playwright helper (`handleContestChoiceModals`) called at the include-cart call site in `aposta/src/flow.ts`, with a new `contestChoice` selector group. No other flow changes.

**Tech Stack:** TypeScript (ESM), Playwright, vitest. Build `make build`, tests `make test` (repo root).

**Spec:** `docs/superpowers/specs/2026-07-23-contest-choice-modal-design.md`

## Global Constraints

- `clickVisibleModalConfirm()` and the blocking-modal guard (`dismissBlockingModals`) must NOT be modified.
- The helper must NEVER confirm the contest modal while "Ambos" is the selection — the failure path is evidence + `AbortBeforePayment`, not a best-effort confirm.
- Test policy: unit tests for the pure chooser only; the Playwright helper is validated live by the operator. Suite goes 18 → 22; `make build` clean.
- Test files live in `aposta/tests/<name>.test.ts`, vitest flat `test()` style, importing from `../src/flow.js`.
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Pure chooser `chooseContestLabel` (TDD)

**Files:**
- Modify: `aposta/src/flow.ts` (add exported function near `parseAmount`)
- Test: `aposta/tests/contest.test.ts` (new)

**Interfaces:**
- Produces: `chooseContestLabel(text: string, labels: string[]): string | null` — exported from `aposta/src/flow.ts`; consumed by Task 2.

- [ ] **Step 1: Write the failing tests**

Create `aposta/tests/contest.test.ts`:

```ts
import { expect, test } from 'vitest';
import { chooseContestLabel } from '../src/flow.js';

const MODAL_TEXT =
  'Existem 2 concursos abertos para a Lotofácil. Deseja incluir no carrinho qual concurso?';

test('chooseContestLabel picks the plain lottery name from the modal text', () => {
  expect(
    chooseContestLabel(MODAL_TEXT, ['Lotofácil da Independência', 'Lotofácil', 'Ambos']),
  ).toBe('Lotofácil');
});

test('chooseContestLabel falls back to the shortest non-Ambos label', () => {
  expect(
    chooseContestLabel('texto irreconhecível', ['Mega-Sena da Virada', 'Mega-Sena', 'Ambos']),
  ).toBe('Mega-Sena');
});

test('chooseContestLabel never returns Ambos even when it is shortest', () => {
  expect(chooseContestLabel('texto irreconhecível', ['Lotofácil da Independência', 'Ambos'])).toBe(
    'Lotofácil da Independência',
  );
});

test('chooseContestLabel returns null when only Ambos/empty labels exist', () => {
  expect(chooseContestLabel(MODAL_TEXT, ['Ambos', '  '])).toBeNull();
  expect(chooseContestLabel(MODAL_TEXT, [])).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd aposta && npx vitest run tests/contest.test.ts`
Expected: FAIL — `chooseContestLabel` is not exported.

- [ ] **Step 3: Implement the function**

In `aposta/src/flow.ts`, immediately after the `parseAmount` function, add:

```ts
/**
 * Pure: pick the "normal" (plain-name, never "Ambos") contest label from a
 * contest-choice modal ("Existem N concursos abertos para a X..."). `text` is
 * the modal's full text, `labels` the radio labels. Returns the label to
 * select, or null when no safe choice exists (caller escalates).
 */
export function chooseContestLabel(text: string, labels: string[]): string | null {
  const candidates = labels.map((l) => l.trim()).filter((l) => l && !/^ambos$/i.test(l));
  if (!candidates.length) return null;
  const base = text.match(/para [ao] (.+?)[.?]/i)?.[1]?.trim();
  if (base) {
    const exact = candidates.find(
      (l) => l.localeCompare(base, 'pt-BR', { sensitivity: 'base' }) === 0,
    );
    if (exact) return exact;
  }
  // Special contests are "X da Y" — strictly longer than the plain name.
  return candidates.reduce((a, b) => (b.length < a.length ? b : a));
}
```

- [ ] **Step 4: Run the full suite**

Run: `make build && make test`
Expected: build clean, 22/22 tests pass (18 existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add aposta/src/flow.ts aposta/tests/contest.test.ts
git commit -m "feat: chooseContestLabel — pick plain contest name, never Ambos

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `handleContestChoiceModals` + selectors + call site

**Files:**
- Modify: `aposta/src/selectors.ts` (new `contestChoice` group after `promo`)
- Modify: `aposta/src/flow.ts` (new module-private helper + one call-site line)

**Interfaces:**
- Consumes: `chooseContestLabel(text, labels)` (Task 1), `selectors.promo.modalContainer`, `AbortBeforePayment`, `debugVisibleControls`.
- Produces: module-private `handleContestChoiceModals(page: Page, log: Logger): Promise<void>`, called once in `selectCarrinhoFavoritoAndCheckout`.

- [ ] **Step 1: Add the selector group**

In `aposta/src/selectors.ts`, immediately after the `promo` group's closing `},`, add:

```ts
  // "Existem N concursos abertos para a X. Deseja incluir no carrinho qual
  // concurso?" — radios (special contest / plain name / "Ambos" pre-selected)
  // + "Incluir no carrinho". Shown when a special contest (Mega da Virada,
  // Lotofácil da Independência, ...) is open. Design:
  // docs/superpowers/specs/2026-07-23-contest-choice-modal-design.md
  contestChoice: {
    modalText: /concursos abertos/i,
    includeButtonText: 'Incluir no carrinho', // exact
  },
```

- [ ] **Step 2: Add the helper**

In `aposta/src/flow.ts`, immediately after the closing brace of `clickVisibleModalConfirm`, add:

```ts
/**
 * Handle the "Existem N concursos abertos para a X" modal(s) shown after
 * including the favorite cart when a special contest (Mega da Virada,
 * Lotofácil da Independência, ...) is open. "Ambos" comes PRE-SELECTED and
 * would duplicate every game of that lottery, so: pick the plain-name radio
 * via chooseContestLabel, verify the selection, then click that modal's
 * "Incluir no carrinho". Up to 3 rounds — the favorite cart mixes lotteries,
 * so one modal per lottery can appear in sequence. If the modal is present
 * but a radio cannot be selected, save evidence and throw AbortBeforePayment:
 * aborting beats silently confirming a duplicated cart.
 */
async function handleContestChoiceModals(page: Page, log: Logger): Promise<void> {
  for (let round = 0; round < 3; round++) {
    const modal = page
      .locator(`${selectors.promo.modalContainer}:visible`)
      .filter({ hasText: selectors.contestChoice.modalText })
      .first();
    if (!(await modal.count())) return;

    const text = await modal.innerText().catch(() => '');
    // Radio labels: accessible names first, then <label> text via evaluate
    // (the site's styled radios may hide the input itself).
    const radios = modal.getByRole('radio');
    const n = await radios.count();
    const labels: string[] = [];
    for (let i = 0; i < n; i++) {
      const name =
        (await radios.nth(i).getAttribute('aria-label').catch(() => null)) ??
        (await radios
          .nth(i)
          .evaluate((el) => el.closest('label')?.textContent ?? '')
          .catch(() => ''));
      labels.push((name ?? '').replace(/\s+/g, ' ').trim());
    }

    const chosen = chooseContestLabel(text, labels);
    let selected = false;
    if (chosen) {
      const byRole = modal.getByRole('radio', { name: chosen, exact: true });
      if (await byRole.count()) {
        await byRole.first().check({ timeout: 2500 }).catch(() => {});
        selected = await byRole.first().isChecked().catch(() => false);
      }
      if (!selected) {
        const byLabel = modal.locator('label').filter({ hasText: chosen }).first();
        if (await byLabel.count()) {
          await byLabel.click({ timeout: 2500 }).catch(() => {});
          const input = byLabel.locator('input[type="radio"]');
          selected = (await input.count())
            ? await input.first().isChecked().catch(() => false)
            : false;
        }
      }
    }

    if (!selected) {
      const ts = Date.now();
      const dumpDir = path.resolve('dom-dumps');
      const base = path.join(dumpDir, `contest_modal_${ts}`);
      try {
        fs.mkdirSync(dumpDir, { recursive: true });
        fs.writeFileSync(`${base}.txt`, await debugVisibleControls(page));
      } catch {
        // evidence is best-effort; never mask the abort
      }
      await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {});
      throw new AbortBeforePayment(
        `Modal de escolha de concurso não tratado (opção "${chosen ?? '?'}" não selecionável) — evidências em dom-dumps/contest_modal_${ts}.*`,
      );
    }
    log.info(`Concurso selecionado: ${chosen}`);

    // Confirm THIS modal only: visible exact-text "Incluir no carrinho".
    const btn = modal.getByRole('button', {
      name: selectors.contestChoice.includeButtonText,
      exact: true,
    });
    const bn = await btn.count();
    for (let i = 0; i < bn; i++) {
      const b = btn.nth(i);
      if (await b.isVisible().catch(() => false)) {
        await b.click({ timeout: 2500 }).catch(() => {});
        break;
      }
    }
    await sleep(1500);
  }
}
```

- [ ] **Step 3: Wire the call site**

In `selectCarrinhoFavoritoAndCheckout`, replace:

```ts
  await sleep(1200);
  await clickVisibleModalConfirm(page); // include may raise a confirm popup
```

with:

```ts
  await sleep(1200);
  await handleContestChoiceModals(page, log); // special-contest choice: plain name, never "Ambos"
  await clickVisibleModalConfirm(page); // include may raise a confirm popup
```

(Only this call site — the one right after the include-icon click. The other `clickVisibleModalConfirm` calls stay untouched.)

- [ ] **Step 4: Verify build and tests**

Run: `make build && make test`
Expected: build clean, 22/22 tests pass.

- [ ] **Step 5: Commit**

```bash
git add aposta/src/selectors.ts aposta/src/flow.ts
git commit -m "feat: handle contest-choice modal — select plain contest, never Ambos

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Final verification (operator — not an agent task)

Live: `make bet` (or `make dry-run`) while a special contest is open. Expect
`Concurso selecionado: Lotofácil` (and/or `Mega-Sena`) in the log, exactly one
contest per lottery in the cart, and the total amount matching the favorite
cart's normal price. If the modal's DOM defeats radio selection, the run must
abort pre-payment with `Modal de escolha de concurso não tratado — evidências
em dom-dumps/contest_modal_<ts>.*`.
