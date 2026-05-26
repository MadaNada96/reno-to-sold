// ============================================================
// SITE ACCESS GATE — config
// This file is intentionally separate from index.html so future
// updates to index.html never wipe out your PIN setting.
//
// To change the PIN: generate a new SHA-256 hash in the browser
// console with
//   crypto.subtle.digest("SHA-256", new TextEncoder().encode(prompt("PIN:")))
//     .then(h => console.log(Array.from(new Uint8Array(h))
//     .map(b => b.toString(16).padStart(2,'0')).join('')))
// and paste the resulting 64-char hex string into SITE_ACCESS_HASH below.
//
// To DISABLE the gate entirely: set SITE_ACCESS_HASH to "".
// ============================================================
// ----- Site-wide gate (locks the whole site) -----
window.SITE_ACCESS_HASH     = "70252984654c35f9f8f37247ae126116e93be2f3acf82061cf06981916e8f828";
window.SITE_ACCESS_TTL_DAYS = 30;            // how long an unlocked browser stays unlocked
window.SITE_ACCESS_KEY      = "reno_site_access_v1";

// ----- Internal Cost Analysis Mode (margins, contractor pricing) -----
// Different PIN from the site gate so you can share site access with the team
// without exposing cost margins. Unlock state is runtime-only — every page
// refresh re-prompts. There is intentionally no "reset" path in the UI:
// the only way to change this is to update the hash below.
window.INTERNAL_ACCESS_HASH = "3157fb5efb99f26b67b76b54bc8cc16b8d9e3d905a7ef8af0e01042083a08b2d";
