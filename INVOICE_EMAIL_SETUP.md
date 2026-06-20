# Invoice Email — Deployment Guide

**TL;DR:** Nothing new to deploy. The "Send to Client" button on each invoice
reuses the existing `email-estimate` Edge Function. If your Email-to-Client
flow already works, invoice email already works.

If invoice send fails or you want to verify the setup from scratch, follow the
checklist below.

---

## Why no new function?

When we planned Phase 2, the intent was to ship a dedicated `email-invoice`
Supabase Edge Function. While wiring up the front-end, I realized the existing
`email-estimate` function is **already generic** — it accepts:

```json
{ "to": [...], "cc": [...], "subject": "...", "body": "...", "pdfBase64": "...", "filename": "..." }
```

There is nothing estimate-specific in that contract. So the invoice send path
just builds an invoice PDF (via the same `buildInvoicePdfEl` + `pdfFromElement`
helpers used by the Download button) and calls `email-estimate` with the
invoice payload. One function, one set of Resend secrets, less to maintain.

Functionally identical to what a new `email-invoice` function would do.

---

## Prerequisites (one-time)

These should already be in place if you've ever successfully used **Email to
Client** from the estimator. If anything below is missing, set it once and
you're good for every future invoice email.

### 1. Supabase secrets

Run from the project root:

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
supabase secrets set RESEND_FROM_ADDRESS=estimates@renotosold.homes
supabase secrets set RESEND_FROM_NAME="Reno to Sold Inc."
```

The `RESEND_API_KEY` value is the API key from your Resend dashboard
(<https://resend.com/api-keys>). **Don't share it — treat it like a credit
card.** Replace the `re_xxx…` placeholder above with the real key when running
the command; never paste the live key into chat, a commit, or a file.

`SUPABASE_SERVICE_ROLE_KEY` is auto-injected by Supabase at runtime — you don't
set it manually.

### 2. Resend sender domain

In Resend, the `estimates@renotosold.homes` sender must be on a verified
domain. If you've used Email-to-Client successfully before, this is already
verified. Otherwise, go to <https://resend.com/domains> and add
`renotosold.homes`, then add the DNS records Resend gives you.

### 3. `email-estimate` function deployed

If you've never deployed it, or you blew it away during a refactor:

```bash
supabase functions deploy email-estimate
```

The function source lives at `supabase/functions/email-estimate/index.ts`. (If
that file's content is stale or wrong — there was a known case where it got
overwritten with contractor-bid-api code — recover from git history or
re-create from the Email-to-Client flow.)

---

## Verification checklist

Run through these once to confirm invoice email works end-to-end. Once verified,
you won't have to do it again.

### Step 1: Sign in

The Edge Function requires a Supabase session (user auth gates Resend access).
Click **Sign in** in the estimator toolbar and complete the OAuth flow.

### Step 2: Create a test invoice

1. Open or save an estimate that has a kitchen (so you get the 5-milestone
   schedule, including the Kitchen Design Lock-In).
2. Click **Invoicing** in the toolbar.
3. Click any milestone card — say **10% Deposit**. An invoice appears in the
   "All Invoices" list with status `DRAFT`.

### Step 3: Send it

1. Click the invoice row to open the detail modal.
2. Click **Send to Client** (the new primary button).
3. The Email Invoice modal opens. Verify:
   - **To** field is auto-filled with sellers' emails (or empty if no sellers)
   - **Subject** reads `Invoice RTS-INV-NNNN — <property address>`
   - **Message** has the milestone label, the dollar amount, the due date,
     and the cheque/e-transfer payment instructions
   - **BCC me a copy at \<your email\>** is checked by default
4. Replace the To field with your own email so the test message lands in your
   inbox.
5. Click **Generate PDF & Send**.

### Step 4: Verify

- Status pill in the modal flips through "Generating PDF…" → "Sending (NN KB
  attachment)…" → "Sent to \<your email\> (BCC'd to you). Invoice marked Sent."
- The modal auto-closes after ~2 seconds.
- The invoice status pill in the All Invoices list flips from **DRAFT** to
  **SENT**.
- Check your inbox: you should receive the email with the PDF attached. Open
  the PDF and confirm the layout matches what Download PDF produces.
- If you BCC'd yourself, check that copy too.

### Step 5: Overdue verification (optional)

To verify the overdue pill works without waiting for time to pass:

1. Open the sent invoice's detail modal.
2. Edit the **Due Date** to yesterday's date.
3. Close the modal — the invoice list should now show a red pulsing **OVERDUE**
   pill instead of blue **SENT**.
4. Open the **All Projects** view via the scope toggle, click the **Overdue**
   chip — only the test invoice should be visible.
5. Restore the original due date when done.

---

## Troubleshooting

### "Sign in to send emails."

You're not signed in to Supabase. Click **Sign in** in the toolbar.

### "Edge Function error" or "Failed: Function not found"

The `email-estimate` function isn't deployed in this Supabase project. Run:

```bash
supabase functions deploy email-estimate
```

### "Failed: Resend ... 401" or "Forbidden"

`RESEND_API_KEY` is missing, invalid, or expired. Re-set it:

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Then redeploy:

```bash
supabase functions deploy email-estimate
```

### "Failed: ... domain not verified"

The `estimates@renotosold.homes` sender domain is unverified in Resend. Visit
<https://resend.com/domains>, verify `renotosold.homes`, and try again.

### PDF generates but email doesn't arrive

1. Check spam.
2. Check Resend dashboard → **Emails** for the most recent send — if it shows
   `delivered`, the recipient's mail server got it.
3. If Resend shows `bounced`, the To address is invalid or the recipient
   server rejected the message.

### Function logs

To see what the Edge Function actually saw:

```bash
supabase functions logs email-estimate --tail
```

Then try a send and watch the logs scroll. Useful when the front-end says
"Failed" but you can't tell which side broke.

---

## What this guide does NOT cover

- Editing the email-estimate function source. If you need to add features
  (custom HTML body, attachments other than PDF, real BCC headers instead of
  CC), edit `supabase/functions/email-estimate/index.ts` and redeploy.
- Adding ANOTHER Edge Function. Phase 2 explicitly chose to reuse rather than
  duplicate. If you ever want a dedicated `email-invoice` function (for
  example, to give invoices their own from-address like `invoices@…`), copy
  the existing function as a starting point.

---

---

## Reliability safeguards (built-in)

Four guardrails make sure email doesn't silently break:

### 1. Source-integrity test
`test_email_function.js` runs as part of your normal test suite. It opens
`supabase/functions/email-estimate/index.ts` and asserts:
- File exists and is non-empty
- Self-identifies as the email-estimate service
- Does NOT contain stale contractor-bid-api code (the exact past regression)
- All six payload fields are referenced (to / cc / subject / body / pdfBase64 / filename)
- Ping action is implemented
- Calls api.resend.com
- Reads `RESEND_API_KEY` and `RESEND_FROM_ADDRESS` env vars
- Wraps a `serve()` handler
- Handles CORS preflight

Catches future corruption the instant you run tests — long before any redeploy.
Run anytime with: `node test_email_function.js`

### 2. "Test Email" button (Invoicing modal header)
Opens the Invoicing modal → top right next to "Done" → click **Test Email**.

What it does:
1. Pings the Edge Function (`{ action: "ping" }`) and verifies the function is
   reachable + that the Resend secrets are set on Supabase
2. Sends a tiny test email (1px PNG attachment) to your own address
3. Reports OK or an actionable error

Run it whenever you're not sure things still work — e.g. before sending a real
client invoice if anything feels off.

### 3. Smart error messages
When a send fails, the inline error now classifies the failure into one of:
- **Not signed in** → click Sign in
- **Email function not deployed** → `supabase functions deploy email-estimate`
- **Resend API key invalid/missing** → `supabase secrets set RESEND_API_KEY=...`
- **Sender domain not verified** → fix DNS on Resend
- **Recipient address rejected** → fix the typo
- **Rate limit / 429** → wait and retry
- **Network error** → check connection
- **Validation failed** → app bug, report it
- **Unknown** → falls back to running the Test Email button

Each comes with the exact fix listed inline — no Stack Overflow detour needed.

### 4. Scheduled weekly health check
A Cowork scheduled task (`renotosold-email-health-check`) runs every Monday at
8:10 AM:
- Auto-runs `test_email_function.js` to verify the source file is intact
- Reports green if all good, red with recovery steps if not
- Reminds you to click "Test Email" in the app to verify the live pipeline

If you ever want to change the schedule, run `Tomorrow morning at 9am` or
similar in chat — Claude will use `update_scheduled_task` to adjust.

---

*Last updated: when Phase 2 of invoicing shipped + the email reliability batch.
Reno to Sold — single-file estimator at renotosold.homes.*
