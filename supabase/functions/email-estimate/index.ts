// Supabase Edge Function — email-estimate
//
// Sends a PDF-attached email via Resend. Used by THREE flows in the
// estimator: Email to Client (estimate PDF), Email Contractor Bid
// (contractor bid PDF), and Send to Client on invoices (invoice PDF).
// The function itself is GENERIC — it doesn't care what kind of PDF
// it's sending, just that one was supplied. Each calling flow builds
// its own PDF on the client side and posts the base64 here.
//
// Payload (POST body):
//   {
//     to:        string[]    // primary recipients, required
//     cc:        string[]    // CC recipients, optional (we use this as the
//                            //   BCC channel for the "BCC me a copy" toggle;
//                            //   Resend treats `cc` as visible CC headers)
//     subject:   string      // required
//     body:      string      // required, plain text — wrapped in branded HTML
//     pdfBase64: string      // required, base64-encoded PDF (no data: prefix)
//     filename:  string      // required, the attachment filename
//   }
//
// Health-check:
//   GET  /                        → { ok: true, service: "email-estimate" }
//   POST { action: "ping" }       → { ok: true, ping: true }
//   Used by the in-app "Test Email" button and the optional weekly health
//   check to verify the function is alive WITHOUT actually sending mail.
//
// REQUIRED SECRETS:
//   supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//   supabase secrets set RESEND_FROM_ADDRESS=estimates@renotosold.homes
//   supabase secrets set RESEND_FROM_NAME="Reno to Sold Inc."
//   (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are auto-injected.)
//
// DEPLOY:
//   supabase functions deploy email-estimate

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const SERVICE_NAME = "email-estimate";
const SERVICE_VERSION = "2.0.0";   // bump on any structural change

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface EmailPayload {
  to?: string[];
  cc?: string[];
  subject?: string;
  body?: string;
  pdfBase64?: string;
  filename?: string;
  action?: string;          // "ping" for health check
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // GET → health check (no auth, no body).
  if (req.method === "GET") {
    return jsonResponse({ ok: true, service: SERVICE_NAME, version: SERVICE_VERSION });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Parse the body.
  let payload: EmailPayload;
  try { payload = (await req.json()) as EmailPayload; }
  catch { return jsonResponse({ error: "Invalid JSON body" }, 400); }

  // Ping action — bypass all validation and Resend, just confirm we're alive
  // and that the Resend secrets are present (without actually sending).
  if (payload?.action === "ping") {
    const hasKey  = !!Deno.env.get("RESEND_API_KEY");
    const fromOk  = !!Deno.env.get("RESEND_FROM_ADDRESS");
    return jsonResponse({
      ok: true,
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      ping: true,
      resend_key_present:    hasKey,
      resend_from_configured: fromOk,
    });
  }

  // Validate the actual email payload.
  const errors: string[] = [];
  if (!Array.isArray(payload.to) || payload.to.length === 0) errors.push("to[] is required");
  if (!payload.subject)   errors.push("subject is required");
  if (!payload.body)      errors.push("body is required");
  if (!payload.pdfBase64) errors.push("pdfBase64 is required");
  if (!payload.filename)  errors.push("filename is required");
  if (errors.length > 0) {
    return jsonResponse({ error: "Validation failed: " + errors.join("; ") }, 400);
  }

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    return jsonResponse({
      error: "RESEND_API_KEY secret is not set on this Supabase project. Run: supabase secrets set RESEND_API_KEY=re_xxx"
    }, 500);
  }
  const FROM_ADDR = Deno.env.get("RESEND_FROM_ADDRESS") || "estimates@renotosold.homes";
  const FROM_NAME = Deno.env.get("RESEND_FROM_NAME")    || "Reno to Sold Inc.";

  // Wrap the plain-text body in a branded HTML email. Resend supports both
  // `html` and `text` simultaneously — clients that block HTML get the
  // plain-text version, everyone else sees the branded layout.
  const html = brandedHtml(payload.body!, payload.subject!);

  const resendBody: Record<string, unknown> = {
    from: `${FROM_NAME} <${FROM_ADDR}>`,
    to: payload.to,
    subject: payload.subject,
    html,
    text: payload.body,
    attachments: [
      { filename: payload.filename, content: payload.pdfBase64 },
    ],
  };
  if (Array.isArray(payload.cc) && payload.cc.length > 0) {
    resendBody.cc = payload.cc;
  }

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(resendBody),
    });
    // Resend always returns JSON, even for errors.
    let result: any;
    try { result = await resp.json(); }
    catch { result = { error: { message: "Resend returned non-JSON response" } }; }

    if (!resp.ok) {
      // Pass through Resend's error message so the caller can classify it.
      const msg = (result && (result.message || (result.error && result.error.message))) || "Unknown Resend error";
      return jsonResponse({
        error: `Resend ${resp.status}: ${msg}`,
        resend_status: resp.status,
        resend_detail: result,
      }, 502);
    }

    return jsonResponse({ ok: true, id: result.id, accepted: payload.to });
  } catch (e) {
    const msg = (e && (e as Error).message) || String(e);
    return jsonResponse({ error: `Network error reaching Resend: ${msg}` }, 502);
  }
});

/* Wrap a plain-text body in a branded HTML email matching the estimator's
   gold + black palette. Preserves paragraph breaks (blank lines) and
   single line breaks within paragraphs. Escapes HTML special chars. */
function brandedHtml(plainText: string, _subject: string): string {
  const escaped = plainText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escaped
    .split(/\n\n+/)
    .map((p) => `<p style="margin:0 0 14px;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f4f3ef;-webkit-font-smoothing:antialiased;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:#0a0a0a;padding:20px 24px;border-radius:8px 8px 0 0;text-align:center;border-bottom:3px solid #d4af6a;">
      <div style="font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:24px;font-weight:800;letter-spacing:.10em;color:#d4af6a;">RENO TO SOLD</div>
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:10px;color:#a8853f;letter-spacing:.14em;text-transform:uppercase;margin-top:4px;">RE/MAX West Realty Inc., Brokerage</div>
    </div>
    <div style="background:#ffffff;padding:26px 28px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.6;font-size:14px;">
      ${paragraphs}
    </div>
    <div style="text-align:center;color:#888;font-size:11px;margin-top:14px;font-family:Helvetica,Arial,sans-serif;line-height:1.5;">
      Reno to Sold Inc. &middot; Mississauga, ON L4Y 0G4 &middot; 416-832-3779<br>
      <a href="mailto:renotosold@gmail.com" style="color:#a8853f;text-decoration:none;">renotosold@gmail.com</a>
    </div>
  </div>
</body>
</html>`;
}
