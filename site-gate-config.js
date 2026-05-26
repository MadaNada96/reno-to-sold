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
window.SITE_ACCESS_HASH     = "a9ee0daf1402a9053c05a149fd28dbe7bc273d66428b3aa9cba74e51c4fcc8fa";
window.SITE_ACCESS_TTL_DAYS = 30;            // how long an unlocked browser stays unlocked
window.SITE_ACCESS_KEY      = "reno_site_access_v1";
