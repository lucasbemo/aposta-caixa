# PROD.md — AutoBet Loterias Caixa

**Product:** AutoBet Caixa — Intelligent Lottery Betting Agent  
**Version:** 1.0-Draft  
**Date:** 2026-07-16  
**Author:** Product Manager — TI Projects  
**Status:** Draft — Requirements Elicitation  

---

## 1. Context & Problem Statement

### 1.1 Current Pain
Loterias da Caixa (loterias.caixa.gov.br) is the official Brazilian lottery portal. Despite being the sole channel for online betting, the UX is notoriously unfriendly:
- **Fragmented flows:** Selecting a saved game (aposta salva), choosing payment, and confirming requires navigating multiple non-obvious screens.
- **2FA friction:** Security codes are sent via email (often to Gmail). The user must context-switch between browser, email client, copy-paste codes, and return before session timeout.
- **Payment rigidity:** Credit card data can be saved, but the CVV must be entered manually every session. There is no "one-tap repeat my last bet" feature.
- **Session volatility:** Short-lived sessions and aggressive timeouts force users to restart the flow frequently.
- **No API:** There is no public or partner API for programmatic betting. All interaction must be done via browser automation (RPA).

### 1.2 Opportunity
Build a desktop/mobile agent that automates the end-to-end betting flow using:
- Pre-saved game templates (apostas salvas)
- Pre-saved credit cards
- Automated Gmail security-code retrieval
- Manual CVV input at the critical payment step (user-in-the-loop)

### 1.3 Vision
> *"One command to bet. The agent handles the bureaucracy; the user only provides intent and the final CVV."*

---

## 2. Goals & Success Criteria

| ID | Goal | Metric |
|--|--|--|
| G1 | Reduce time-to-bet from >5 min to <60 sec | Average session duration |
| G2 | Eliminate manual email code copy-paste | 100% automated 2FA retrieval |
| G3 | Zero missed bets due to session timeout | Timeout error rate = 0% |
| G4 | Secure handling of sensitive credentials | Pass security audit, no plaintext storage |
| G5 | Reliability on critical path | 99.5% success rate on "happy path" (saved game + saved card + Gmail 2FA) |

---

## 3. Target Persona

**Primary Persona: "Marcelo — The Recurring Bettor"**
- Plays the same numbers every week (Mega-Sena, Quina, or Lotofácil)
- Has 2–3 saved games (apostas salvas) on Loterias da Caixa
- Uses a single credit card registered on the site
- Uses Gmail as primary email for Caixa notifications
- Tech-savvy enough to install a desktop app but wants zero friction
- Security-conscious: wants automation, but refuses to store CVV or give full email access blindly

---

## 4. User Stories

### US-001 — Initiate Bet
> *As Marcelo, I want to open the app and select one of my saved games with a single tap, so that I don't have to navigate the Caixa website manually.*

**Acceptance Criteria:**
- App displays a list of locally cached saved-game metadata (name, lottery type, numbers, last played date).
- Tapping a game initiates the betting session.

### US-002 — Authenticate with Caixa
> *As Marcelo, I want the app to log me into Loterias da Caixa automatically using my stored credentials, so that I don't need to type my CPF and password every time.*

**Acceptance Criteria:**
- App stores CPF and password in OS-native secure storage (Keychain/Windows Credential Manager).
- App uses headless browser or HTTP client to perform login.
- If a CAPTCHA appears, the app surfaces it to the user for manual resolution (fallback).

### US-003 — Auto-Retrieve Security Code from Gmail
> *As Marcelo, I want the app to read my Gmail inbox, find the latest security code from Loterias da Caixa, and paste it into the website automatically, so that I never have to switch apps.*

**Acceptance Criteria:**
- App uses Gmail OAuth2 (read-only, restricted scope) to poll the inbox.
- App identifies the email sender (`@caixa.gov.br` or `@loterias.caixa.gov.br`) and extracts the numeric code using regex.
- App submits the code within the valid time window (before session expires).
- App never stores email contents; only extracts the code transiently.

### US-004 — Select Pre-Saved Credit Card
> *As Marcelo, I want the app to automatically select my pre-saved credit card on the payment screen, so that I don't have to search for it in a dropdown.*

**Acceptance Criteria:**
- App detects the payment screen and selects the card based on user preference (last used, or explicitly configured default).
- Masked card number (last 4 digits) is displayed for user confirmation.

### US-005 — Manual CVV Input
> *As Marcelo, I want to be prompted to enter my credit card CVV at the exact moment of payment, so that I maintain full control over the final authorization while still enjoying automation for everything else.*

**Acceptance Criteria:**
- App pauses automation, presents a secure native input modal for CVV.
- CVV is held in memory only (never persisted to disk, never logged).
- After input, automation resumes and submits the payment form.
- If CVV is incorrect, the app surfaces the error and allows retry (max 3 attempts).

### US-006 — Confirmation & Receipt
> *As Marcelo, I want to receive a confirmation inside the app with the bet receipt (comprovante) and a summary of the transaction, so that I have proof of purchase without downloading a PDF manually.*

**Acceptance Criteria:**
- App captures the receipt page/screenshot and stores it locally (encrypted at rest).
- App sends a push notification: "Bet confirmed — Mega-Sena, R$ X,00. Receipt saved."
- App logs the transaction (date, lottery, amount, receipt ID) in a local history view.

### US-007 — Fail-Safe & Timeout Handling
> *As Marcelo, if any step fails (timeout, wrong code, payment declined), I want the app to stop immediately, notify me with a clear error, and never retry a payment blindly, so that I don't get double-charged.*

**Acceptance Criteria:**
- No automatic retry on payment submission.
- All errors are surfaced with actionable messages (e.g., "Session expired — please restart", "CVV declined — check with your bank").
- App logs the failure reason for debugging (PII redacted).

---

## 5. Functional Requirements

### 5.1 Core Flow (Happy Path)

```
[User] → Select Saved Game
    ↓
[Agent] → Launch headless browser → Navigate to loterias.caixa.gov.br
    ↓
[Agent] → Auto-fill CPF + Password → Submit Login
    ↓
[Caixa] → Redirects to 2FA screen + sends email with code
    ↓
[Agent] → Poll Gmail API (OAuth2) → Parse code from latest Caixa email
    ↓
[Agent] → Submit 2FA code → Access account dashboard
    ↓
[Agent] → Navigate to "Apostas Salvas" → Select chosen game → Add to cart
    ↓
[Agent] → Proceed to checkout → Select default saved credit card
    ↓
[Agent] → PAUSE → Prompt user for CVV (native modal)
    ↓
[User] → Enters CVV → Submit
    ↓
[Agent] → Submit payment → Wait for confirmation page
    ↓
[Agent] → Capture receipt → Save locally → Notify user
    ↓
[Agent] → Close session → Clear transient data (CVV, session cookies)
```

### 5.2 Module Breakdown

| Module | Responsibility |
|--------|---------------|
| **Auth Manager** | Secure credential storage (CPF/password), login orchestration, session cookie handling. |
| **Browser Agent** | Headless browser control (Puppeteer/Playwright/Selenium). DOM interaction, navigation, screenshot capture. |
| **Gmail Scanner** | OAuth2 Gmail integration. Poll inbox, filter sender, extract security code, expose code via internal API. |
| **Payment Handler** | Detect payment page, select saved card, orchestrate CVV prompt, submit payment, detect confirmation/decline. |
| **CVV Vault (Transient)** | In-memory-only CVV holder. Zero persistence. Auto-wipe after 5 minutes or session end. |
| **Receipt Manager** | Capture confirmation page, generate PDF, encrypt and store in local filesystem. |
| **Notifier** | Push notifications (OS native) for success, failure, or required user action. |
| **Audit Logger** | Local-only, structured log of transactions (no PII). For debugging and user history. |

### 5.3 Configuration & Onboarding

**First-Run Setup (One-Time):**
1. **Caixa Credentials:** User inputs CPF + password. Encrypted and stored in OS keychain.
2. **Gmail OAuth:** User authenticates via Google OAuth2 consent screen. App requests **readonly** scope with restricted access to emails from `caixa.gov.br` domain only (if possible via Gmail filters/API). Minimum viable: `gmail.readonly` scope with user-trust explanation.
3. **Saved Game Sync:** Agent logs into Caixa, scrapes the "Apostas Salvas" page, and caches metadata locally (game name, lottery type, numbers, price).
4. **Default Card Selection:** User selects which saved credit card should be the default for future bets.
5. **Security PIN (Optional):** App-level PIN or biometric lock to open the app.

---

## 6. Non-Functional Requirements

### 6.1 Security (Critical)
- **Credential Storage:** All persistent credentials (CPF, password, Gmail token) must use OS-native secure storage (macOS Keychain, Windows DPAPI/Credential Manager, Linux Secret Service).
- **CVV Handling:** CVV must **never** be written to disk, logged, or transmitted outside the local automation context. Hold in memory only for the duration of the payment step.
- **Gmail Scope:** Use minimal OAuth2 scope. Prefer `gmail.readonly`. If possible, implement server-side filtering or local filtering to only process emails from Caixa domains.
- **No Cloud:** This is a **local-first** app. No user data, credentials, or betting history should be sent to external servers. All automation runs on the user's machine.
- **Encryption at Rest:** Receipts and local logs encrypted using AES-256 with a key derived from the user's app PIN or OS user credentials.
- **Session Isolation:** Browser session must be isolated (incognito/private mode) and all cookies/session data wiped after each betting session.

### 6.2 Compliance & Legal
- **Terms of Service:** The app operates as a "user-agent" (RPA) on behalf of the user. It does not scrape data for commercial redistribution. We must include a disclaimer that users are responsible for ensuring their use complies with Loterias da Caixa Terms of Service.
- **Gambling Regulations:** In Brazil, lottery betting is a state monopoly (Caixa Econômica Federal). The app does not act as a betting intermediary; it merely automates the user's own interaction with the official state portal. Legal review required.
- **PCI-DSS Awareness:** While the app does not store CVV, it handles cardholder data in transit during automation. Follow PCI-DSS principles: never store CVV, minimize exposure, secure the environment.
- **LGPD (Lei Geral de Proteção de Dados):** Brazilian data protection law applies. The app processes CPF, email content, and financial data. A privacy policy must be provided, and data processing must be justified (legitimate interest / consent).

### 6.3 Reliability & Performance
- **Session Timeout Tolerance:** The entire flow from login to payment must complete within the Caixa session timeout window (assumed ~10–15 minutes). Target: <3 minutes end-to-end.
- **Gmail Polling Latency:** Code must be retrieved from Gmail within 30 seconds of email arrival. Implement push notification via Gmail Pub/Sub or efficient polling (exponential backoff, max 1 req/5 sec).
- **Browser Stability:** Headless browser must handle dynamic JS-heavy pages. Retry on transient DOM failures (max 2 retries), but never retry payment submission.
- **Offline Resilience:** App works only when online. If connection drops mid-flow, gracefully abort and notify user.

### 6.4 Usability
- **One-Tap Bet (MVP):** After setup, the ideal flow is: Open app → Tap saved game → Enter CVV → Done.
- **Fallback for CAPTCHA:** If Caixa presents a visual CAPTCHA, the app must surface it in a native WebView or screenshot for manual user resolution.
- **Dark Mode:** Native app UI should support system dark mode.
- **Accessibility:** Minimum WCAG 2.1 AA for all native UI elements.

---

## 7. Technical Architecture (High-Level)

### 7.1 Recommended Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Frontend / Native App** | Electron (cross-platform desktop) or Tauri (lighter) or Flutter (if mobile desired) | User needs a native-feeling app for secure CVV input and notifications. |
| **Browser Automation** | Playwright (preferred) or Puppeteer | Superior handling of modern SPAs, auto-wait, screenshot, and mobile emulation. |
| **Gmail Integration** | Google Gmail API (REST) via OAuth2 | Official, stable, supports readonly scope. |
| **Secure Storage** | node-keytar (Electron) or Tauri secure storage API | OS-native credential vault abstraction. |
| **Local DB** | SQLite (encrypted via SQLCipher) | Lightweight, local, encrypted storage for receipts and history. |
| **Notifications** | node-notifier (desktop) or OS-native APIs | Cross-platform push notifications. |
| **Build & Packaging** | electron-builder or Tauri bundler | Auto-update, code-signing, installer generation. |

### 7.2 Architecture Diagram (Textual)

```
┌─────────────────────────────────────────────────────────────┐
│                    AutoBet Caixa App                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Native UI  │  │  Auth Mgr   │  │  Gmail Scanner      │  │
│  │  (React/Vue)│  │  (Keychain) │  │  (Gmail API OAuth2) │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                      │            │
│  ┌──────┴──────┐  ┌──────┴──────┐  ┌───────────┴──────────┐  │
│  │ Browser     │  │ CVV Vault   │  │ Receipt & History    │  │
│  │ Agent       │  │ (In-Mem)    │  │ (SQLite + Encrypt)   │  │
│  │ (Playwright)│  │             │  │                      │  │
│  └──────┬──────┘  └─────────────┘  └──────────────────────┘  │
│         │                                                    │
│  ┌──────┴──────┐                                              │
│  │  Network    │  → HTTPS only                                 │
│  │  Layer      │  → loterias.caixa.gov.br                      │
│  └─────────────┘  → gmail.googleapis.com                       │
└─────────────────────────────────────────────────────────────┘
```

### 7.3 Data Flow Detail

1. **Setup Phase:**
   - User enters CPF/password → encrypted via keytar → stored in OS vault.
   - User approves Gmail OAuth → refresh token stored in OS vault.
   - Agent scrapes "Apostas Salvas" → metadata written to local SQLite.

2. **Betting Phase:**
   - User selects game → App launches Playwright in incognito context.
   - Playwright navigates to Caixa → fills CPF/password from keytar.
   - Caixa sends email → Gmail API polled → code extracted → submitted.
   - Playwright navigates to saved game → adds to cart → checkout.
   - Payment page detected → App pauses Playwright → Native CVV modal shown.
   - User enters CVV → CVV held in memory → Playwright fills form → submits.
   - Confirmation page detected → screenshot + PDF generated → saved to SQLite.
   - Playwright context closed → CVV variable nullified → session cookies cleared.

---

## 8. Security Deep Dive

### 8.1 Threat Model

| Threat | Likelihood | Impact | Mitigation |
|--------|-----------|--------|------------|
| Malware steals local credential DB | Medium | Critical | Use OS keychain (not a flat file). Encrypt local DB with user PIN. |
| CVV leaked in memory dump | Low | Critical | CVV stored in a volatile variable only. Wipe immediately after use. App runs as user process (not root). |
| Gmail token compromised | Medium | High | Readonly scope. Token stored in OS keychain. User can revoke via Google Account anytime. |
| Man-in-the-middle on Caixa site | Low | Critical | Enforce certificate pinning or strict TLS validation in Playwright. |
| Double-charge due to retry bug | Low | Critical | **No retry on payment submission.** Single attempt only. |
| Caixa site changes DOM → bot detection | High | Medium | Robust selectors, fallback to manual mode, monitoring for site changes. |

### 8.2 Gmail Access — User Trust
- The app must display a **clear consent screen** during onboarding:
  > *"This app will access your Gmail inbox to read security codes from Loterias da Caixa only. It cannot send emails, delete messages, or access other senders. All processing happens on your device."*
- Implement **local filtering:** Even with `gmail.readonly`, fetch only emails matching `from:caixa.gov.br` and `subject:(código OR segurança OR token)` to minimize data exposure.

### 8.3 Audit & Logging
- **What to log:** Timestamp, lottery type, amount, success/failure, error type (no CVV, no PII).
- **What NOT to log:** CPF, password, CVV, full credit card number, email body, security codes.
- **Log destination:** Local encrypted SQLite only. No remote telemetry in MVP.

---

## 9. Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| **Caixa blocks automation** (bot detection, IP ban) | High | Critical | Implement human-like delays (random 1–3 sec between actions). Use residential IP (user's own). Provide manual fallback mode. Monitor for blocking and alert user. |
| **Caixa website redesign breaks selectors** | High | High | Abstract DOM selectors into a config file. Implement health-check script that validates selectors daily. Design fallback to manual WebView. |
| **Gmail OAuth scope changes or deprecation** | Low | High | Use standard Gmail API (not scraping). Monitor Google API changelogs. Have fallback to IMAP if OAuth is restricted. |
| **Legal challenge — violates Caixa ToS** | Medium | Critical | Legal review. Position as accessibility/user-agent tool. Include ToS compliance disclaimer. No commercial betting service — purely personal automation. |
| **User enters wrong CVV → account locked** | Medium | Medium | Max 3 attempts. Clear error messaging. Do not auto-retry. |
| **Email delay → code expires** | Medium | Medium | Pre-warm Gmail session. Use push notifications (Gmail Pub/Sub) instead of polling if possible. Fallback: alert user to check inbox manually. |
| **Mobile app store rejection** (if mobile) | Medium | High | If building mobile, app stores may reject gambling-related automation. Start with desktop (sideload/website download) to avoid store policies. |

---

## 10. MVP Scope (Phase 1)

### In Scope
- [ ] Desktop app (Windows/macOS/Linux) — local only, no cloud backend.
- [ ] Login automation with CPF/password stored in OS keychain.
- [ ] Gmail OAuth2 integration — read-only, Caixa-email filtering, auto-extract code.
- [ ] Scraping and caching of "Apostas Salvas" list.
- [ ] One-tap bet initiation from cached list.
- [ ] Auto-selection of pre-saved default credit card.
- [ ] Native CVV input modal (manual user-in-the-loop).
- [ ] Receipt capture and local history.
- [ ] Basic error handling and user notifications.
- [ ] CAPTCHA fallback (manual WebView popup).

### Out of Scope (Future Phases)
- [ ] Mobile app (iOS/Android).
- [ ] Multiple credit card profiles.
- [ ] Scheduled/recurring bets (e.g., "every Wednesday").
- [ ] Betting on multiple lotteries in one session.
- [ ] Integration with other email providers (Outlook, Yahoo).
- [ ] Cloud sync of history across devices.
- [ ] Analytics/telemetry (even anonymized).
- [ ] Betting suggestion engine / number generation.

---

## 11. Success Metrics & KPIs

| Metric | Baseline | Target (30 days post-launch) |
|--------|----------|------------------------------|
| End-to-end bet time | ~5–8 min (manual) | <90 seconds |
| Automation success rate (happy path) | N/A | ≥95% |
| User-reported "friction" score (1–10) | 8 (high friction) | ≤3 |
| CVV prompt → completion time | N/A | <15 seconds |
| Security audit findings | N/A | 0 critical, 0 high |
| Support tickets per user | N/A | <0.5 |

---

## 12. Open Questions & Decisions

| ID | Question | Owner | Status |
|----|----------|-------|--------|
| Q1 | Does Caixa's login flow currently use CAPTCHA by default, or only after failed attempts? | Tech Lead | **To Research** |
| Q2 | What is the exact session timeout duration on loterias.caixa.gov.br? | Tech Lead | **To Research** |
| Q3 | Can we use Gmail API's `label:` or `q:` query parameters to restrict reads to Caixa emails only, reducing privacy exposure? | Tech Lead | **To Research** |
| Q4 | Is Playwright's stealth mode sufficient to avoid Caixa's bot detection, or do we need a more sophisticated approach (e.g., undetected-chromedriver)? | Security | **To Research** |
| Q5 | Should we implement a "manual mode" where the app only assists (fills forms, fetches code) but user clicks every button, to reduce legal risk? | Product | **To Decide** |
| Q6 | What is the exact DOM structure of the "Apostas Salvas" page? Do we need to handle pagination? | Tech Lead | **To Research** |
| Q7 | Does the payment confirmation page provide a downloadable PDF, or only an HTML receipt? | Tech Lead | **To Research** |
| Q8 | Should we add a "panic button" that instantly kills the browser session and wipes memory? | Security | **To Decide** |

---

## 13. Appendices

### A. Glossary
- **Aposta Salva:** A pre-configured set of lottery numbers saved to the user's Caixa account for quick replay.
- **CVV:** Card Verification Value — the 3 or 4 digit security code on the credit card, required for every online transaction.
- **LGPD:** Lei Geral de Proteção de Dados — Brazilian General Data Protection Law.
- **RPA:** Robotic Process Automation — software that emulates human actions in digital systems.

### B. Related Documents
- `TECH-SPEC.md` — Detailed technical specification (to be created).
- `SECURITY-AUDIT.md` — Third-party security review checklist.
- `PRIVACY-POLICY.md` — LGPD-compliant privacy policy for end users.
- `QA-TESTPLAN.md` — Test cases for happy path, error paths, and edge cases.

---

**End of Document**

*This PROD.md is a living document. All team members should contribute to refining requirements as research and prototyping reveal constraints.*
