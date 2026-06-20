/*
 * test_email_function.js
 *
 * Guards the Supabase Edge Function source file at
 *   supabase/functions/email-estimate/index.ts
 *
 * Background: this file got accidentally overwritten with contractor-bid-api
 * code at one point. The corruption wasn't caught until someone tried to
 * redeploy. This test runs on every test pass and fails loudly the moment
 * the file drifts from being a valid email-estimate function — so future
 * corruption is caught the instant you run tests, long before any redeploy.
 *
 * Checks:
 *   1. The file exists and is non-empty.
 *   2. It identifies itself as the email-estimate service.
 *   3. It does NOT contain stale contractor-bid-api markers.
 *   4. The expected payload contract is referenced (to / cc / subject /
 *      body / pdfBase64 / filename).
 *   5. A ping / health-check action is implemented.
 *   6. Resend integration is wired up (fetch to api.resend.com).
 *   7. Required env vars are referenced.
 */
const fs   = require("fs");
const path = require("path");

const FUNCTION_PATH = path.join(__dirname, "supabase", "functions", "email-estimate", "index.ts");

let failures = 0;
function check(name, condition, hint) {
  if (condition) {
    console.log("  ✓ " + name);
  } else {
    console.log("  ✗ " + name + (hint ? "  — " + hint : ""));
    failures++;
  }
}

if (!fs.existsSync(FUNCTION_PATH)) {
  console.log("FAIL: email-estimate source file is MISSING at " + FUNCTION_PATH);
  console.log("Fix: restore from git or re-create. See INVOICE_EMAIL_SETUP.md.");
  process.exit(2);
}

const src = fs.readFileSync(FUNCTION_PATH, "utf8");
console.log("Loaded email-estimate source (" + src.length + " chars)\n");

// 1. Non-empty + has substantial content.
check(
  "File has substantial content (>1000 chars)",
  src.length > 1000,
  "File looks empty or stub. Restore from git history."
);

// 2. Self-identifies as email-estimate.
check(
  "File identifies itself as the email-estimate service",
  /email-estimate/i.test(src),
  "Header comment is missing or wrong service name. File may have been overwritten."
);

// 3. No stale contractor-bid-api leakage. The exact bug we're guarding
//    against: this file got overwritten with contractor-bid-api code once.
check(
  "File does NOT contain stale contractor-bid-api code",
  !/contractor[-_]bid[-_]api/i.test(src) &&
  !/bid_token/.test(src) &&
  !/contractor_bids/.test(src),
  "File appears to contain contractor-bid-api code. This is the known regression — restore the real email-estimate source."
);

// 4. Payload contract is implemented. We just spot-check for the field
//    names being referenced in the source.
const requiredFields = ["to", "cc", "subject", "body", "pdfBase64", "filename"];
requiredFields.forEach((f) => {
  // Look for the field name as a property access (.f or "f" or f:)
  const re = new RegExp("[\\.\\b\"']" + f + "(\\b|[\":])");
  check(
    "Payload field referenced: " + f,
    re.test(src),
    "Function doesn't appear to handle the '" + f + "' field expected by the client."
  );
});

// 5. Health-check ping action.
check(
  "Health-check ping action implemented",
  /action.{0,4}===?.{0,4}["']ping["']/.test(src) ||
  /"?ping"?\s*:\s*true/.test(src),
  "Function should support {action: 'ping'} for the Test Email button + scheduled health check."
);

// 6. Resend API integration.
check(
  "Calls Resend API (fetch to api.resend.com)",
  /api\.resend\.com\/emails/.test(src),
  "Function doesn't call Resend. Did the implementation get swapped out?"
);

// 7. Required env vars referenced.
check(
  "Reads RESEND_API_KEY env var",
  /RESEND_API_KEY/.test(src),
  "RESEND_API_KEY is not referenced — the function can't authenticate to Resend."
);
check(
  "Reads RESEND_FROM_ADDRESS env var",
  /RESEND_FROM_ADDRESS/.test(src),
  "RESEND_FROM_ADDRESS is not referenced — from-address won't be configurable."
);

// 8. Sanity: function must call serve() (Deno HTTP handler).
check(
  "Wraps a serve(req → Response) handler",
  /\bserve\s*\(/.test(src),
  "No serve() call — this isn't a working Deno HTTP function."
);

// 9. Sanity: function must handle OPTIONS for CORS.
check(
  "Handles CORS preflight (OPTIONS)",
  /method\s*===?\s*["']OPTIONS["']/.test(src),
  "No CORS preflight handling — browser requests will be blocked."
);

if (failures > 0) {
  console.log("\nFAIL: " + failures + " email-estimate source check" + (failures === 1 ? "" : "s") + " failed");
  console.log("");
  console.log("This usually means supabase/functions/email-estimate/index.ts has been");
  console.log("corrupted, overwritten, or partially deleted. Recover from git history");
  console.log("OR restore from the known-good version recreated in INVOICE_EMAIL_SETUP.md.");
  console.log("");
  console.log("DO NOT run `supabase functions deploy email-estimate` until this is fixed");
  console.log("— you'll push broken code and silently break every email send.");
  process.exit(3);
}
console.log("\nPASS: email-estimate source file is intact and deployment-safe");
