# PROD.md — Product Requirements Document (Draft v0.1)

## Product: "Aposta Fácil" — Automated Bet Placement for Loterias CAIXA

| Field | Value |
|---|---|
| Author | Product Management — TI Projects |
| Status | Draft — for discussion |
| Last updated | 2026-07-16 |
| Target release | MVP — TBD |
| Stakeholders | Product, Engineering, Security, Legal/Compliance |

---

## 1. Overview

A personal-use application that automates the placement of a lottery bet (aposta) on the **Loterias CAIXA** website (loteriasonline.caixa.gov.br), reusing:

1. A **pre-existing saved game** (jogo salvo / volante favorito) already registered in the user's Loterias account, and
2. A **pre-existing registered credit card** on that account.

The app must orchestrate an end-to-end flow that today is manual, slow, and error-prone due to the website's poor UX, including handling the **security code sent by e-mail (OTP)** via the user's Gmail account, while keeping the **credit card CVV entry strictly manual** (entered by the user at purchase time, never stored).

## 2. Problem Statement

Placing a recurring bet on Loterias CAIXA requires ~8–12 manual steps across a slow, unfriendly UI: login, e-mail OTP retrieval, navigating to saved games, adding to cart, checkout, card selection, CVV entry, and confirmation. Users who bet the same game every contest (concurso) waste time and frequently abandon or miss the cutoff time (usually 19h/20h BRT on draw days).

**Goal:** reduce a ~5–10 minute manual flow to under 60 seconds of user attention, where the only required human action is confirming the purchase and typing the CVV.

## 3. Goals & Non-Goals

### Goals
- G1. Automate login on Loterias CAIXA using stored credentials (encrypted at rest).
- G2. Automatically retrieve the login/security OTP from the user's Gmail inbox.
- G3. Select a pre-saved game and add it to the cart for the next available contest.
- G4. Drive checkout up to the payment step using the pre-registered credit card.
- G5. Pause and prompt the user to **manually enter the CVV** and confirm the purchase.
- G6. Capture and store the purchase receipt / bet confirmation number.
- G7. Notify the user of success or failure (push/e-mail).

### Non-Goals (MVP)
- NG1. No storage of CVV, ever (compliance and security requirement, not just scope).
- NG2. No creation/editing of games — only reuse of saved games.
- NG3. No card registration flow — card must already exist in the CAIXA account.
- NG4. No multi-user / commercial betting service (see §10 Legal).
- NG5. No result checking / prize claiming (Phase 2 candidate).

## 4. Personas

- **P1 — Recurring bettor (primary):** bets the same Mega-Sena/Lotofácil game every contest; tech-comfortable; owns the CAIXA account, Gmail, and card used.

## 5. User Stories

- US1. As a bettor, I want to trigger "place my saved bet" with one action, so I don't navigate the CAIXA site manually.
- US2. As a bettor, I want the app to fetch the e-mail security code automatically, so login doesn't require me to switch to my inbox.
- US3. As a bettor, I want to be prompted only for the CVV and a final confirmation, so I stay in control of the payment.
- US4. As a bettor, I want a receipt and confirmation stored locally, so I can prove the bet was placed.
- US5. As a bettor, I want a clear failure reason (site down, CAPTCHA, cutoff passed, payment declined) so I can act manually in time.

## 6. End-to-End Flow (Happy Path)

1. User triggers run (manual button or schedule before contest cutoff).
2. App opens automated browser session → Loterias CAIXA login.
3. Site sends security code to user's e-mail.
4. App polls Gmail (OAuth, read-only, filtered query) → extracts OTP → submits.
5. App navigates to saved games → selects configured game → adds to cart for next contest.
6. App proceeds to checkout → selects registered credit card.
7. **HITL step (Human-in-the-loop):** app notifies user → user enters CVV in the app UI → app injects it into the payment form → user confirms.
8. App submits payment → captures confirmation number + receipt (PDF/screenshot).
9. App notifies user: "Aposta confirmada — Concurso #XXXX".

### Key Failure Paths
- OTP e-mail not received within N seconds → retry login → escalate to user.
- CAPTCHA / anti-bot challenge presented → escalate to user with remote view or deep link to finish manually.
- Cutoff time passed / contest closed → abort with clear message.
- Payment declined → surface bank message; never retry payment automatically.
- Site layout changed (selector break) → abort safely before payment; alert maintainer.

## 7. Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-01 | Store CAIXA login credentials encrypted at rest (OS keychain / AES-256). | Must |
| FR-02 | Gmail integration via **OAuth 2.0** with minimal scope (`gmail.readonly`), never password storage. | Must |
| FR-03 | OTP extraction: filter by sender/subject, parse code, discard e-mail content after use. | Must |
| FR-04 | Browser automation of login → saved game → cart → checkout (headless or visible). | Must |
| FR-05 | Configurable saved-game selection (by name/ID) and number of contests (teimosinha optional). | Must |
| FR-06 | CVV: prompted at runtime, held in memory only, zeroed after submission. Never logged, never persisted. | Must |
| FR-07 | Explicit user confirmation screen (game, contest, amount, card last-4) before payment submit. | Must |
| FR-08 | Receipt capture (confirmation number + screenshot/PDF) stored locally. | Must |
| FR-09 | Notifications: success, failure with reason, "action needed" (CVV / CAPTCHA). | Must |
| FR-10 | Scheduler: run X hours before contest cutoff, with cutoff-time awareness per lottery. | Should |
| FR-11 | Dry-run mode: full flow stopping before payment, for testing selectors. | Should |
| FR-12 | Spend guardrail: max amount per run and per month, hard-blocked in app. | Should |

## 8. Non-Functional Requirements

- **NFR-01 Security:** no card number stored by the app (card lives in CAIXA account); CVV in volatile memory only; secrets in OS keychain; logs must redact OTPs, tokens, and any PII.
- **NFR-02 Privacy:** Gmail access limited to read-only + narrow search query; no e-mail content retained. Align with LGPD principles (minimization, purpose limitation) even for personal use.
- **NFR-03 Reliability:** end-to-end run ≤ 3 min excluding user CVV wait; automatic single retry for transient failures; never retry after payment submission.
- **NFR-04 Observability:** structured run log per attempt (redacted), step-level status for debugging selector breaks.
- **NFR-05 Maintainability:** all site selectors centralized in one config module — the CAIXA site changes without notice; expect recurring maintenance.

## 9. Technical Approach (proposed, for Eng discussion)

- **Automation:** Playwright (preferred over Selenium for stability/anti-flaky waits). Persistent browser profile to reduce login friction and OTP frequency.
- **Gmail:** Google API client with OAuth consent for the user's own account; polling with exponential backoff (e.g., every 3s, up to 90s).
- **App shell:** local desktop app or self-hosted service with mobile push (options: Electron/Tauri UI, or headless service + Telegram/WhatsApp-style notification for the CVV prompt — CVV entry must happen in the app UI, not chat).
- **Anti-bot reality check:** the site may use CAPTCHA, device fingerprinting, or bot detection. Mitigations: non-headless mode, human-like pacing, persistent profile, HITL fallback. **We will not attempt to bypass CAPTCHAs automatically** — user solves them when presented.

## 10. Risks, Compliance & Open Questions

### Risks
- **R1 — ToS risk (High):** automating the Loterias CAIXA site very likely violates its terms of use; possible consequences include account suspension. Must be surfaced to the user in onboarding; single-account personal use only.
- **R2 — Site fragility (High):** UI changes break the flow silently → mitigated by dry-run mode, selector config, abort-before-payment policy.
- **R3 — Anti-bot escalation (Medium):** CAPTCHA frequency may make automation impractical → HITL fallback is a first-class feature, not an edge case.
- **R4 — Payment/security exposure (Medium):** mishandling OTP/CVV would be severe → FR-06, NFR-01/02 are release blockers.
- **R5 — Missed cutoff (Medium):** scheduling too close to cutoff → default trigger ≥ 2h before cutoff.

### Open Questions
1. Does CAIXA offer any official API or "Teimosinha" (repeat bet for N contests) feature that removes the need for automation entirely? **Investigate first — Teimosinha may solve 80% of the problem natively.**
2. Is OTP required on every login, or only on new devices? (Persistent profile may eliminate the Gmail dependency.)
3. Which lotteries in scope for MVP? (Proposal: Mega-Sena + Lotofácil only.)
4. Desktop-only MVP, or mobile notification for CVV entry required from day one?

## 11. Success Metrics (MVP)

- ≥ 95% of runs complete or fail safely (no "unknown state" after payment).
- User active time per bet ≤ 60s (CVV + confirm).
- 0 incidents of CVV/OTP persistence found in logs or storage (security audit gate).
- Selector-break detection before payment in 100% of layout-change cases.

## 12. Phasing

- **Phase 0 (Spike, 1–2 wks):** manual walkthrough with HAR capture; verify OTP behavior, CAPTCHA presence, Teimosinha viability; dry-run automation to cart.
- **Phase 1 (MVP):** happy path + HITL CVV + receipts + notifications + guardrails.
- **Phase 2:** scheduler, multi-lottery, result checking, mobile CVV prompt.
