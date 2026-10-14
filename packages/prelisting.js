/* =====================================================================
   RENO TO SOLD — PRE-LISTING PACKAGES (portal tool)
   File: packages/prelisting.js   ·   Route: #/packages   ·   Feature: "prelisting_packages"
   ---------------------------------------------------------------------
   ALL of the Pre-Listing Packages tool lives in this one file:
   its styles, its page layout, pricing, readiness score, saving,
   emails, admin view and settings. To change the tool, edit this file
   and upload it to the repo's packages/ folder — index.html does not
   need to change.

   TEST WITHOUT AFFECTING USERS
   Upload a copy as packages/prelisting-test.js and open
     https://renotosold.homes/?pl=test#/packages
   That browser loads the test file; everyone else keeps this one.
   When you're happy, copy the test file over this one.

   WHAT STAYS IN index.html (small hooks — rarely need touching)
   • <div id="view-packages" class="view"></div>  (this file fills it)
   • sidebar button + dashboard card + "packages" route
   • feature flag "prelisting_packages" (ON by default for every role)
   • the loader <script> that includes this file (supports ?pl=test)
   • estimator hooks this file relies on: buildCategoryCard(),
     renderCategories() hosting check, renderTotals() → PL.onHostedChange()
   • the Cleaning & Decluttering estimator category (an estimator
     feature, used by Package 1)

   HOW IT WORKS
   • One source of truth for pricing: a quote is priced by building a
     real estimator `state` (plBuildEstState) and running the
     estimator's computeCategory(). "Generate estimate" saves that same
     object, so the estimate always matches the quote.
   • Kitchen & Bath (Package 4) hosts the estimator's own Kitchen and
     Bathrooms cards. While hosting, the global `state` is swapped for
     the package's estimator state; PL.release() always restores it.
   • Quotes are stored in public.estimates with type = "package"
     (existing RLS). Local cache: localStorage "rts_pl_quotes_v1".
   • Settings (range %, CAS rep) live in prices.packages and sync to all
     users with the rest of the pricing.
   • Photos: Supabase Storage bucket "package-photos"
     (supabase/migrations/prelisting_packages.sql).
   ===================================================================== */

/* ---------- Styles (injected once) ---------- */
(function plInjectStyles(){
  if(document.getElementById("plStyles")) return;
  const el = document.createElement("style");
  el.id = "plStyles";
  el.textContent = `
  /* ===== Pre-Listing Packages (#view-packages, namespaced pl-*) ===== */
  .pl-wrap{max-width:1100px;margin:0 auto;}
  .pl-top{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin:0 0 18px;}
  .pl-eyebrow{font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);font-weight:700;}
  .pl-h1{font-family:'Times New Roman',serif;font-weight:400;font-size:30px;line-height:1.1;margin:6px 0 6px;color:var(--ink);}
  .pl-h1 em{font-style:normal;color:var(--gold-bright);}
  .pl-lede{margin:0;color:var(--muted);font-size:13px;max-width:520px;line-height:1.5;}
  .pl-top-actions{display:flex;gap:8px;flex-wrap:wrap;}
  .pl-top-actions .ti, .pl-actions .ti, .pl-nav .ti{font-size:15px;vertical-align:-2px;}

  .pl-card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin-bottom:14px;}
  .pl-card-quiet{background:transparent;border-style:dashed;}
  .pl-card-h{margin-bottom:14px;}
  .pl-card-h h3{margin:0;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold-bright);font-weight:700;}
  .pl-card-h p{margin:5px 0 0;color:var(--muted);font-size:12.5px;line-height:1.5;}
  .pl-sub-h{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);font-weight:700;margin:16px 0 8px;border-top:1px solid var(--line);padding-top:14px;}
  .pl-field{margin-bottom:12px;min-width:0;}
  .pl-field label, .pl-f3 label{display:block;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:700;margin-bottom:5px;}
  .pl-field input, .pl-field textarea, .pl-f3 input{width:100%;}
  .pl-field input[type=date]{background:var(--panel-2);color:var(--ink);border:1px solid var(--line-strong);border-radius:8px;padding:10px 12px;font:inherit;color-scheme:dark;min-height:42px;}
  .pl-req{color:var(--gold);font-weight:600;letter-spacing:.06em;text-transform:none;font-size:10.5px;margin-left:4px;}
  .pl-opt{color:var(--muted);font-weight:500;letter-spacing:.04em;text-transform:none;font-size:10.5px;margin-left:4px;}
  .pl-hint{color:var(--muted);font-size:11.5px;line-height:1.5;margin-top:5px;}
  .pl-f2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 14px;}
  .pl-f3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0 12px;}
  .pl-f3 > div{margin-bottom:10px;min-width:0;}
  .pl-seller{border-bottom:1px solid var(--line);margin-bottom:10px;padding-bottom:4px;}
  .pl-link{background:none;border:none;color:var(--gold-bright);padding:4px 0;font-size:12px;font-weight:600;}
  .pl-link:hover{background:none;text-decoration:underline;}
  .pl-indent{margin-left:28px;}

  .pl-ac-wrap{position:relative;}
  .pl-ac-list{display:none;position:absolute;left:0;right:0;top:100%;z-index:40;background:var(--panel-2);border:1px solid var(--line-strong);border-radius:8px;margin-top:4px;overflow:hidden;box-shadow:var(--shadow);}
  .pl-ac-list.show{display:block;}
  .pl-ac-item{padding:9px 12px;font-size:13px;cursor:pointer;border-bottom:1px solid var(--line);}
  .pl-ac-item:last-child{border-bottom:none;}
  .pl-ac-item:hover{background:rgba(212,175,106,.10);color:var(--gold-bright);}

  /* steps */
  .pl-steps{display:flex;gap:6px;margin-bottom:14px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px;}
  .pl-steps::-webkit-scrollbar{display:none;}
  .pl-step{display:flex;align-items:center;gap:8px;white-space:nowrap;border:1px solid var(--line);background:var(--panel);border-radius:999px;padding:6px 14px 6px 6px;font-size:12px;color:var(--muted);}
  .pl-step-n{width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:var(--panel-2);border:1px solid var(--line-strong);font-size:11px;font-weight:700;color:var(--muted);}
  .pl-step.on{border-color:var(--gold-deep);color:var(--gold-bright);background:rgba(212,175,106,.08);}
  .pl-step.on .pl-step-n{background:var(--gold-grad);color:#0a0a0a;border-color:transparent;}
  .pl-step.done{color:var(--ink);}
  .pl-step.done .pl-step-n{color:var(--gold-bright);border-color:var(--gold-deep);}

  .pl-grid{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px;align-items:start;}
  .pl-side{position:sticky;top:16px;}
  .pl-summary{background:#000;border:1px solid var(--gold-deep);border-radius:12px;padding:18px;box-shadow:var(--gold-glow);}
  .pl-sum-eyebrow{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold);font-weight:700;}
  .pl-sum-range{font-size:26px;font-weight:800;color:var(--gold-bright);margin-top:8px;font-variant-numeric:tabular-nums;line-height:1.15;}
  .pl-sum-note{font-size:11px;color:var(--muted);margin-top:3px;}
  .pl-sum-empty{color:var(--muted);font-size:12.5px;margin-top:8px;line-height:1.5;}
  .pl-sum-lines{margin-top:14px;border-top:1px solid var(--line);padding-top:8px;}
  .pl-sum-lines > div{display:flex;justify-content:space-between;gap:10px;font-size:12px;padding:5px 0;color:var(--ink);}
  .pl-sum-lines b{font-weight:600;white-space:nowrap;font-variant-numeric:tabular-nums;}
  .pl-sum-tbd{margin-top:6px;font-size:11px;color:var(--muted);font-style:italic;line-height:1.5;}
  .pl-sum-addr{margin-top:12px;font-size:11.5px;color:var(--muted);border-top:1px solid var(--line);padding-top:10px;}
  .pl-sum-score{display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:11.5px;color:var(--muted);}
  .pl-mobilebar{display:none;}

  .pl-nav{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:4px;}
  .pl-save-state{font-size:11px;color:var(--muted);}

  /* packages */
  .pl-pkgs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;}
  .pl-pkg{text-align:left;display:flex;flex-direction:column;gap:4px;padding:16px;border-radius:12px;border:1px solid var(--line-strong);background:var(--panel-2);color:var(--ink);font-weight:400;}
  .pl-pkg:hover{border-color:var(--gold-deep);background:var(--panel-2);color:var(--ink);}
  .pl-pkg.on{border-color:var(--gold);box-shadow:var(--gold-glow);background:linear-gradient(180deg,rgba(212,175,106,.10),rgba(212,175,106,.02));}
  .pl-pkg-top{display:flex;justify-content:space-between;align-items:center;}
  .pl-pkg-n{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold);font-weight:700;}
  .pl-pkg-sel{font-size:11px;color:var(--gold-bright);font-weight:600;}
  .pl-pkg-name{font-size:16px;font-weight:700;color:var(--ink-strong);margin-top:2px;}
  .pl-pkg-tag{font-size:12px;color:var(--muted);}
  .pl-pkg-svc{list-style:none;margin:10px 0 0;padding:0;font-size:12.5px;line-height:1.9;}
  .pl-pkg-svc li{color:var(--muted);opacity:.55;}
  .pl-pkg-svc li.on{color:var(--ink);opacity:1;}
  .pl-pkg-svc .ti{margin-right:7px;font-size:14px;vertical-align:-2px;}
  .pl-pkg-svc li.on .ti{color:var(--gold-bright);}
  .pl-pkg-price{margin-top:auto;padding-top:12px;font-size:18px;font-weight:800;color:var(--gold-bright);font-variant-numeric:tabular-nums;}
  .pl-pkg-from{font-size:10.5px;color:var(--muted);font-weight:600;letter-spacing:.08em;text-transform:uppercase;margin-right:4px;}
  .pl-pkg-plus{font-size:11.5px;color:var(--muted);font-weight:500;}

  .pl-levels, .pl-floors, .pl-tiers{display:grid;gap:10px;margin-bottom:14px;}
  .pl-levels{grid-template-columns:repeat(2,minmax(0,1fr));}
  .pl-floors{grid-template-columns:repeat(2,minmax(0,1fr));}
  .pl-tiers{grid-template-columns:repeat(3,minmax(0,1fr));}
  .pl-level, .pl-floor, .pl-tier{text-align:left;display:flex;flex-direction:column;gap:3px;padding:12px 14px;border-radius:10px;border:1px solid var(--line-strong);background:var(--panel-2);color:var(--ink);font-weight:400;}
  .pl-level b, .pl-floor b, .pl-tier b{font-size:13.5px;color:var(--ink-strong);}
  .pl-level span, .pl-floor span, .pl-tier span{font-size:11.5px;color:var(--muted);line-height:1.45;}
  .pl-level:hover, .pl-floor:hover, .pl-tier:hover{border-color:var(--gold-deep);background:var(--panel-2);color:var(--ink);}
  .pl-level.on, .pl-floor.on, .pl-tier.on{border-color:var(--gold);background:rgba(212,175,106,.08);}
  .pl-level.on b, .pl-floor.on b, .pl-tier.on b{color:var(--gold-bright);}

  .pl-check{display:flex;gap:10px;align-items:flex-start;font-size:13px;margin:10px 0;cursor:pointer;text-transform:none;letter-spacing:normal;font-weight:400;color:var(--ink);}
  .pl-check b{font-weight:600;}
  .pl-photo-add{text-transform:none;letter-spacing:normal;}
  .pl-check input{margin-top:3px;accent-color:var(--gold);}
  .pl-check em{font-style:normal;color:var(--muted);font-size:12px;}
  .pl-incl{border:1px solid var(--line);border-radius:8px;padding:10px 14px;margin:4px 0 12px;background:var(--panel-2);}
  .pl-incl summary{cursor:pointer;color:var(--gold-bright);font-size:12px;font-weight:600;letter-spacing:.04em;}
  .pl-incl .cln-group:first-of-type{margin-top:10px;}

  .pl-photos{display:flex;flex-wrap:wrap;gap:10px;}
  .pl-photo{position:relative;width:96px;height:96px;border-radius:8px;overflow:hidden;border:1px solid var(--line-strong);}
  .pl-photo img{width:100%;height:100%;object-fit:cover;display:block;}
  .pl-photo button{position:absolute;top:4px;right:4px;width:24px;height:24px;padding:0;border-radius:50%;background:rgba(0,0,0,.7);border:none;color:#fff;display:flex;align-items:center;justify-content:center;}
  .pl-photo-add{width:96px;height:96px;border-radius:8px;border:1px dashed var(--line-strong);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:var(--muted);font-size:11px;cursor:pointer;}
  .pl-photo-add:hover{border-color:var(--gold-deep);color:var(--gold-bright);}
  .pl-photo-add input{display:none;}
  .pl-photo-add .ti{font-size:22px;}

  /* readiness */
  .pl-q{margin-bottom:14px;}
  .pl-q-t{font-size:13px;font-weight:600;margin-bottom:7px;color:var(--ink);}
  .pl-pills{display:flex;flex-wrap:wrap;gap:6px;}
  .pl-pills button{padding:7px 12px;border-radius:999px;font-size:12px;border:1px solid var(--line-strong);background:var(--panel-2);color:var(--ink);font-weight:500;}
  .pl-pills button.on{background:var(--gold-grad);color:#0a0a0a;border-color:transparent;font-weight:700;}
  .pl-score{background:var(--panel-2);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-bottom:16px;}
  .pl-score-top{display:flex;justify-content:space-between;align-items:baseline;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:700;}
  .pl-score-top b{font-size:18px;color:var(--gold-bright);letter-spacing:0;}
  .pl-meter{height:6px;background:#000;border-radius:99px;margin:8px 0 6px;overflow:hidden;}
  .pl-meter div{height:100%;background:var(--gold-grad);border-radius:99px;transition:width .25s;}
  .pl-score-sub{font-size:11.5px;color:var(--muted);}
  .pl-heat{font-weight:700;}
  .pl-heat.hot{color:#ff8a5c;} .pl-heat.warm{color:var(--gold-bright);} .pl-heat.cool{color:#8fb3d9;}

  /* quote */
  .pl-quote{border-color:var(--gold-deep);}
  .pl-q-eyebrow{font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold);font-weight:700;}
  .pl-q-addr{color:var(--muted);font-size:12.5px;margin-top:4px;}
  .pl-q-range{font-size:38px;font-weight:800;color:var(--gold-bright);margin:12px 0 4px;font-variant-numeric:tabular-nums;line-height:1.1;}
  .pl-q-guarantee{font-size:12.5px;color:var(--ink);line-height:1.5;}
  .pl-q-guarantee .ti{color:var(--gold-bright);font-size:15px;vertical-align:-2px;}
  .pl-q-lines{margin:16px 0;border-top:1px solid var(--line);}
  .pl-q-lines > div{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--line);font-size:13px;}
  .pl-q-lines b{white-space:nowrap;font-variant-numeric:tabular-nums;}
  .pl-q-lines .tbd{color:var(--muted);font-style:italic;}
  .pl-ro-sec{margin-top:10px;}
  .pl-ro-t{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);font-weight:700;}
  .pl-ro-sec ul{margin:5px 0 0;padding-left:18px;font-size:12.5px;line-height:1.6;color:var(--ink);}
  .pl-ro-more{font-size:11.5px;color:var(--muted);line-height:1.6;margin-top:6px;}
  .pl-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:14px;}
  .pl-big{padding:12px 20px;font-size:14px;}
  .pl-danger{border-color:rgba(226,109,109,.5);color:var(--danger);}
  .pl-danger:hover{background:rgba(226,109,109,.1);color:var(--danger);}
  .pl-admin{border-color:var(--line-strong);background:linear-gradient(180deg,rgba(212,175,106,.05),transparent);}
  .pl-admin-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;}
  .pl-admin-grid span, .pl-admin-notes span, .pl-rates span{display:block;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:700;margin-bottom:3px;}
  .pl-admin-grid b{font-size:13px;}
  .pl-admin-notes{margin-top:12px;font-size:12.5px;line-height:1.5;background:var(--panel-2);border-radius:8px;padding:10px 12px;}
  .pl-appl-items{margin-bottom:12px;}
  .pl-rates{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;}
  .pl-rates b{font-size:14px;color:var(--gold-bright);}
  .pl-hist > div{font-size:12px;padding:6px 0;border-bottom:1px solid var(--line);}
  .pl-hist span{color:var(--muted);margin-right:10px;font-variant-numeric:tabular-nums;}
  .pl-hist em{color:var(--muted);font-style:normal;}
  .pl-hist-note{color:var(--muted);margin-top:2px;padding-left:2px;}

  .pl-banner{border-radius:10px;padding:12px 16px;margin-bottom:14px;border:1px solid var(--gold-deep);background:rgba(212,175,106,.08);font-size:13px;}
  .pl-banner-sub{font-size:12px;color:var(--muted);margin-top:3px;}
  .pl-banner.closed{border-color:var(--line-strong);background:var(--panel);}
  .pl-locked .pl-main input:not([type=file]):not(#plWtDate):not(#plWtNote),
  .pl-locked .pl-main textarea{pointer-events:none;opacity:.7;}
  .pl-locked .pl-pkg, .pl-locked .pl-level, .pl-locked .pl-floor,
  .pl-locked .pl-q .pl-pills button, .pl-locked .pl-check{pointer-events:none;}
  .pl-locked .pl-appl input, .pl-locked .pl-appl button, .pl-locked .pl-appl .pl-pills button{pointer-events:auto;opacity:1;}

  /* list */
  .pl-filter{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;}
  .pl-filter button{border-radius:999px;padding:6px 14px;font-size:12px;}
  .pl-filter button span{margin-left:8px;background:var(--panel-2);border-radius:99px;padding:1px 7px;font-size:11px;color:var(--muted);}
  .pl-filter button.on{border-color:var(--gold-deep);color:var(--gold-bright);background:rgba(212,175,106,.08);}
  .pl-list{display:flex;flex-direction:column;gap:8px;}
  .pl-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:16px;align-items:center;text-align:left;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px 16px;color:var(--ink);font-weight:400;}
  .pl-row:hover{border-color:var(--gold-deep);background:var(--panel);color:var(--ink);}
  .pl-row-addr{font-weight:600;font-size:14px;color:var(--ink-strong);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .pl-row-sub{font-size:12px;color:var(--muted);margin-top:2px;}
  .pl-row-range{font-weight:700;color:var(--gold-bright);font-variant-numeric:tabular-nums;white-space:nowrap;}
  .pl-row-meta{display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap;}
  .pl-status{font-size:10.5px;letter-spacing:.06em;font-weight:700;border-radius:99px;padding:3px 9px;border:1px solid var(--line-strong);color:var(--muted);white-space:nowrap;}
  .pl-status.req{border-color:#c98e2a;color:#f5c878;}
  .pl-status.sched{border-color:#2e7e4e;color:#5fce86;}
  .pl-status.est{border-color:var(--gold-deep);color:var(--gold-bright);}
  .pl-row-meta .pl-heat{font-size:11px;}
  .pl-empty{text-align:center;padding:40px 20px;border:1px dashed var(--line-strong);border-radius:12px;color:var(--muted);font-size:13px;}
  .pl-empty-t{color:var(--ink);font-weight:600;font-size:15px;margin-bottom:6px;}

  /* hosted estimator cards inside the package tool */
  .pl-kb-host .cat{margin-bottom:12px;}
  .pl-ro-sec + .pl-ro-sec{margin-top:14px;}

  /* walkthrough time picker + preferences */
  .pl-bk-days{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin-bottom:10px;}
  .pl-bk-day{display:flex;flex-direction:column;align-items:center;gap:1px;padding:8px 4px;border-radius:10px;background:var(--panel-2);border:1px solid var(--line-strong);}
  .pl-bk-day small{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;}
  .pl-bk-day b{font-size:17px;color:var(--ink-strong);}
  .pl-bk-day.on{background:var(--gold-grad);border-color:var(--gold);}
  .pl-bk-day.on b, .pl-bk-day.on small{color:#1a1405;}
  .pl-bk-day:disabled{opacity:.35;cursor:not-allowed;}
  .pl-bk-pref{display:grid;grid-template-columns:26px minmax(0,1fr) 150px;gap:8px;align-items:center;padding:7px 0;border-bottom:1px dashed var(--line);}
  .pl-bk-n{width:24px;height:24px;border-radius:50%;background:var(--gold-grad);color:#1a1405;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;}
  .pl-bk-d{font-size:13.5px;font-weight:600;}
  .pl-bk-pref select{padding:7px 8px;font-size:13px;}
  .pl-prefs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:8px;}
  .pl-pref{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;padding:10px 12px;border-radius:10px;background:var(--panel);border:1px solid var(--line-strong);font-weight:400;}
  .pl-pref b{font-size:13px;color:var(--ink-strong);}
  .pl-pref span{font-size:12px;color:var(--muted);}
  .pl-pref em{font-style:normal;font-size:11px;color:var(--gold-bright);font-weight:600;margin-top:4px;}
  .pl-pref:hover{border-color:var(--gold-deep);background:var(--panel);}
  .pl-pref.on{border-color:#2e7e4e;background:rgba(95,206,134,.08);}
  .pl-pref.on em{color:#5fce86;}
  @media (max-width:640px){
    .pl-bk-days{grid-template-columns:repeat(3,minmax(0,1fr));}
    .pl-bk-pref{grid-template-columns:24px minmax(0,1fr);}
    .pl-bk-pref select{grid-column:2;}
    .pl-prefs{grid-template-columns:minmax(0,1fr);}
  }
  /* send modal */
  .pl-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px;}
  .pl-modal{background:var(--panel);border:1px solid var(--line-strong);border-radius:12px;width:100%;max-width:560px;max-height:calc(100vh - 32px);display:flex;flex-direction:column;box-shadow:var(--shadow);}
  .pl-modal-h{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid var(--line);color:var(--gold-bright);letter-spacing:.06em;}
  .pl-modal-h button{border:none;padding:4px 8px;}
  .pl-modal-b{padding:16px 18px;overflow:auto;}
  .pl-modal-f{display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid var(--line);}

  @media (max-width:900px){
    .pl-grid{grid-template-columns:minmax(0,1fr);}
    .pl-side{position:static;order:-1;display:none;}
    .pl-mobilebar{display:block;position:sticky;bottom:0;z-index:30;margin:12px -4px 0;background:#000;border:1px solid var(--gold-deep);border-radius:12px;padding:10px 14px;}
    .pl-mobilebar > div{display:flex;justify-content:space-between;align-items:center;}
    .pl-mb-l{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold);font-weight:700;}
    .pl-mb-r{font-size:17px;font-weight:800;color:var(--gold-bright);font-variant-numeric:tabular-nums;}
  }
  @media (max-width:640px){
    .pl-h1{font-size:24px;}
    .pl-card{padding:14px;}
    .pl-f2, .pl-f3, .pl-pkgs, .pl-levels, .pl-floors, .pl-tiers, .pl-admin-grid, .pl-rates{grid-template-columns:minmax(0,1fr);}
    .pl-step .pl-step-t{display:none;}
    .pl-step.on .pl-step-t{display:inline;}
    .pl-step{padding:4px;}
    .pl-step.on{padding-right:12px;}
    .pl-q-range{font-size:30px;}
    .pl-row{grid-template-columns:minmax(0,1fr);gap:6px;}
    .pl-row-meta{justify-content:flex-start;}
    .pl-actions button{flex:1 1 auto;}
    .pl-indent{margin-left:0;}
  }

`;
  document.head.appendChild(el);
})();

/* ---------- Page layout (filled into #view-packages on first open) ---------- */
const PL_VIEW_HTML = `
<div class="pl-wrap">
          <div class="pl-top">
            <div>
              <div class="pl-eyebrow">Pre-Listing Packages</div>
              <h1 class="pl-h1">Get the listing <em>market-ready.</em></h1>
              <p class="pl-lede">Pick a package, enter the property details and get an instant, guaranteed price range — then send it to your seller or book a walkthrough.</p>
            </div>
            <div class="pl-top-actions" id="plTopActions"></div>
          </div>
          <div id="plBody"></div>
        </div>`;

/* ---------- Default settings (admin can change them in Package settings) ---------- */
const PL_DEFAULT_SETTINGS = {
  rangePct: 15,                       // quote range = calculated → +rangePct %
  casName:  "",                       // Canadian Appliance Source rep name
  casEmail: "",                       // rep email (appliance requests go here)
  ccEmail:  "renotosold@gmail.com"    // cc'd on every appliance request
};

/* ---------- Walkthrough booking rules (same as the public page) ----------
   The requester picks 3 preferred times, each on a different business day;
   the earliest day is 2 business days out. Admin confirms one. */
const PL_HOLIDAYS = [   // Ontario statutory holidays + Civic Holiday — extend yearly
  "2026-01-01","2026-02-16","2026-04-03","2026-05-18","2026-07-01","2026-08-03","2026-09-07","2026-10-12","2026-12-25","2026-12-28",
  "2027-01-01","2027-02-15","2027-03-26","2027-05-24","2027-07-01","2027-08-02","2027-09-06","2027-10-11","2027-12-27","2027-12-28"
];
const PL_WINDOWS = ["9 – 11 AM", "11 AM – 1 PM", "1 – 3 PM", "3 – 5 PM"];
const PL_LEAD_BUSINESS_DAYS = 2;
const PL_DAYS_SHOWN = 15;
function plYmd(d){ return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); }
function plIsBusinessDay(d){ const w = d.getDay(); return w !== 0 && w !== 6 && !PL_HOLIDAYS.includes(plYmd(d)); }
function plBookableDays(){
  const out = [], d = new Date(); d.setHours(12,0,0,0);
  let lead = 0;
  while(lead < PL_LEAD_BUSINESS_DAYS){ d.setDate(d.getDate()+1); if(plIsBusinessDay(d)) lead++; }
  while(out.length < PL_DAYS_SHOWN){ if(plIsBusinessDay(d)) out.push(plYmd(d)); d.setDate(d.getDate()+1); }
  return out;
}
function plNiceDay(ymd, long){
  return new Date(ymd + "T12:00").toLocaleDateString("en-CA", long ? { weekday:"long", month:"long", day:"numeric" } : { weekday:"short", month:"short", day:"numeric" });
}
/* Opens the 3-preference picker. Resolves with [{date, window} x3] or null. */
function plPickTimes(title, intro){
  return new Promise(resolve => {
    let prefs = [];
    const days = plBookableDays();
    const ov = document.createElement("div");
    ov.className = "pl-modal-bg"; ov.id = "plTimesModal";
    const finish = (val) => { ov.remove(); resolve(val); };
    const draw = () => {
      const picked = prefs.map(p => p.date);
      ov.querySelector("#plBkDays").innerHTML = days.map(d => {
        const on = picked.includes(d), dis = !on && picked.length >= 3, dt = new Date(d + "T12:00");
        return `<button type="button" class="pl-bk-day ${on ? "on" : ""}" ${dis ? "disabled" : ""} data-d="${d}"><small>${dt.toLocaleDateString("en-CA",{weekday:"short"})}</small><b>${dt.getDate()}</b><small>${dt.toLocaleDateString("en-CA",{month:"short"})}</small></button>`;
      }).join("");
      ov.querySelector("#plBkPrefs").innerHTML = prefs.map((p, i) => `
        <div class="pl-bk-pref"><span class="pl-bk-n">${i+1}</span><span class="pl-bk-d">${plNiceDay(p.date, true)}</span>
          <select data-i="${i}" aria-label="Time for choice ${i+1}">${PL_WINDOWS.map(w => `<option ${p.window === w ? "selected" : ""}>${w}</option>`).join("")}</select></div>`).join("")
        + (prefs.length < 3 ? `<div class="pl-hint">${3 - prefs.length} more day${3 - prefs.length === 1 ? "" : "s"} to pick.</div>` : "");
      ov.querySelector("#plBkOk").disabled = prefs.length !== 3;
    };
    ov.innerHTML = `
      <div class="pl-modal" role="dialog" aria-label="${plEsc(title)}">
        <div class="pl-modal-h"><b>${plEsc(title)}</b><button type="button" data-x aria-label="Close">✕</button></div>
        <div class="pl-modal-b">
          <div class="pl-hint" style="margin:0 0 10px;">${intro} Earliest available: <b>${plNiceDay(days[0], true)}</b>.</div>
          <div class="pl-bk-days" id="plBkDays"></div>
          <div id="plBkPrefs"></div>
        </div>
        <div class="pl-modal-f"><button type="button" data-x>Cancel</button><button type="button" class="primary" id="plBkOk" disabled>Submit</button></div>
      </div>`;
    ov.addEventListener("click", e => {
      if(e.target === ov || e.target.closest("[data-x]")) return finish(null);
      const b = e.target.closest(".pl-bk-day");
      if(b && !b.disabled){
        const d = b.getAttribute("data-d"), i = prefs.findIndex(p => p.date === d);
        if(i >= 0) prefs.splice(i, 1); else if(prefs.length < 3) prefs.push({ date:d, window: PL_WINDOWS[0] });
        prefs.sort((a, c) => a.date.localeCompare(c.date));
        draw();
      }
      if(e.target.id === "plBkOk" && prefs.length === 3) finish(prefs);
    });
    ov.addEventListener("change", e => { const i = e.target.getAttribute && e.target.getAttribute("data-i"); if(i != null) prefs[+i].window = e.target.value; });
    document.body.appendChild(ov);
    draw();
  });
}

const PL_PACKAGES = [
  { id:1, name:"Clean & Declutter", services:["cleaning"],
    tagline:"Show-ready in days",
    blurb:"A full pre-listing deep clean so the home photographs and shows at its best." },
  { id:2, name:"Clean + Paint", services:["cleaning","painting"],
    tagline:"Fresh, neutral, move-in ready",
    blurb:"Everything in Package 1, plus professional interior painting." },
  { id:3, name:"Clean + Paint + Floors", services:["cleaning","painting","flooring"],
    tagline:"The biggest visual lift",
    blurb:"Everything in Package 2, plus new flooring with new baseboards." },
  { id:4, name:"Full Pre-Listing Refresh", services:["cleaning","painting","flooring","kitchen","bathroom"],
    tagline:"Kitchen & bath included",
    blurb:"Everything in Package 3, with the option to add kitchen and bathroom renovations." }
];

const PL_SERVICE_LABELS = {
  cleaning:"Deep cleaning", painting:"Painting", flooring:"Flooring",
  kitchen:"Kitchen", bathroom:"Bathrooms"
};

const PL_STATUS = {
  draft:                 { label:"Draft",                 cls:"draft" },
  walkthrough_requested: { label:"Walkthrough requested", cls:"req" },
  walkthrough_scheduled: { label:"Walkthrough scheduled", cls:"sched" },
  estimate_created:      { label:"Estimate created",      cls:"est" },
  closed:                { label:"Closed",                cls:"closed" }
};

/* Readiness questions. Points add up to a 0–100 score (target listing
   date adds up to 5). Hot ≥ 75 · Warm 50–74 · Cool < 50. */
const PL_READINESS = [
  { key:"start", label:"When can work start?", opts:[
    ["now","Ready now",30], ["2wk","Within 2 weeks",24], ["30d","Within 30 days",16], ["90d","1–3 months",8], ["unsure","Not sure yet",2] ] },
  { key:"commit", label:"Where is the seller on doing the work?", opts:[
    ["committed","Committed — wants to go ahead",25], ["numbers","Interested — needs the numbers",15], ["exploring","Just exploring",4] ] },
  { key:"listing", label:"Is the listing agreement signed?", opts:[
    ["signed","Yes, signed",12], ["soon","Signing soon",8], ["no","Not yet",2] ] },
  { key:"vacant", label:"Is the property vacant?", opts:[
    ["vacant","Vacant",12], ["moving","Occupied — moving out before work",8], ["occupied","Occupied during the work",3] ] },
  { key:"furniture", label:"Is there furniture in the property?", opts:[
    ["none","Empty",8], ["some","Some furniture",5], ["full","Fully furnished",2] ] },
  { key:"access", label:"How will we access the property?", opts:[
    ["lockbox","Lockbox / keys available",8], ["appt","By appointment",5], ["unknown","Not arranged yet",1] ] }
];

const PL_FLOOR_INFO = {
  vinyl:      "Waterproof, durable and budget-friendly — the most popular pre-listing choice.",
  laminate:   "Waterproof laminate with a realistic wood look and a harder-wearing surface.",
  engineered: "Real hardwood veneer on a stable core — a premium look buyers notice.",
  hardwood:   "Solid hardwood — top-end finish for high-value listings."
};

const PL_APPLIANCE_TIERS = [
  { k:"good",   t:"Good",   d:"Reliable, budget-friendly stainless appliances — a clean, matching set." },
  { k:"better", t:"Better", d:"Mid-range brands with upgraded finishes and features buyers look for." },
  { k:"best",   t:"Best",   d:"Premium brands and built-in style for higher-end listings." }
];
const PL_APPLIANCE_ITEMS = [
  ["fridge","Fridge"], ["range","Range / stove"], ["dishwasher","Dishwasher"],
  ["microwave","Microwave / hood fan"], ["washer","Washer"], ["dryer","Dryer"]
];

const PL_FLOOR_SCOPE = [
  ["Removal", "Removal and disposal of the existing flooring."],
  ["New floor", "Supply and installation of the chosen floor — luxury vinyl plank, waterproof laminate, engineered hardwood or solid hardwood — with the waste allowance included."],
  ["Baseboards", "New baseboards supplied and installed throughout the flooring area."],
  ["Area", "Priced on the flooring area. Tiled areas being kept, like bathrooms, aren't included."]
];
const PL_KB_SCOPE = [
  ["Kitchen", "Demolition and disposal of the existing kitchen (cabinet removal, countertop tear-out, haul-away and dump fees). New semi-custom or custom cabinets including sink, faucet, plumbing adjustments and all hardware; standard or premium quartz countertops; backsplash in tile or matching quartz; optional island and under-cabinet LED lighting."],
  ["Bathrooms", "Demolition and disposal of the existing bathroom (tile removal, fixture tear-out, haul-away). Full refresh with a new toilet, vanity, mirror, light fixture, faucet and accessories, plus new floor tile. Tub surround or stand-up shower tile with waterproofing and a glass enclosure where applicable. Options include a new or freestanding tub, double vanity or a new stand-up shower."],
  ["How it's priced", "Designed to the home's layout in the Kitchen & Bath step (Package 4), using the same setup as the estimator."]
];
const PL_PTYPES = [["condo","Condo"],["townhouse","Townhouse"],["semi","Semi-detached"],["detached","Detached"]];
function plPropLine(q){
  const t = (PL_PTYPES.find(x => x[0] === q.propType) || [, ""])[1];
  return [t, num(q.beds) ? num(q.beds) + " bed" : "", num(q.baths) ? num(q.baths) + " bath" : "",
    num(q.propSqft) ? num(q.propSqft) + " sqft" + (q.propType && q.propType !== "condo" ? (q.basementIncluded ? " (basement included)" : " (basement not included)") : "") : ""].filter(Boolean).join(" · ");
}
function plUid(){ return "pk_" + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function plClone(o){ return o == null ? o : JSON.parse(JSON.stringify(o)); }
function plEsc(s){ return escapeHtml(s == null ? "" : String(s)); }
function plTrimLf(sqft){ return sqft > 0 ? Math.round((sqft * 0.30) / 5) * 5 : 0; }
function plSettings(){
  const d = PL_DEFAULT_SETTINGS;
  return Object.assign({}, d, (prices && prices.packages) || {});
}
function plRangePct(){ const v = parseFloat(plSettings().rangePct); return isFinite(v) && v >= 0 ? v : 15; }
function plRange(amount){
  const pct = plRangePct();
  const low  = Math.floor(amount / 50) * 50;
  const high = Math.ceil((amount * (1 + pct/100)) / 50) * 50;
  return { low, high };
}
function plMoneyRange(r){ return fmt(r.low) + " – " + fmt(r.high); }
function plPackage(id){ return PL_PACKAGES.find(p => p.id === id) || null; }

function plNewQuote(){
  return {
    id: plUid(), v: 1,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    owner_id: currentUser ? currentUser.id : "", owner_email: currentUser ? currentUser.email : "",
    owner_name: (currentProfile && currentProfile.full_name) || "",
    owner_phone: (currentProfile && currentProfile.phone) || "",
    owner_brokerage: (currentProfile && currentProfile.brokerage) || "",
    status: "draft", packageId: null,
    propName: "", propAddress: "", propSqft: "", targetListDate: "",
    propType: "", beds: "", baths: "", basementIncluded: false,
    sellers: [ { name:"", phone:"", email:"" } ],
    readiness: {}, notes: "",
    cleaning: { sqft:"", carpet:false, carpetSqft:"", declutter:false },
    painting: { level:"walls", sqft:"", ceilings:true, doorCount:"" },
    flooring: { type:"vinyl", sqft:"" },
    kb: { enabled:{ kitchen:false, bathroom:false }, kitchen:null, bathroom:null },
    appliances: { tier:"", items:{}, notes:"", requests:[] },
    photos: [],
    quote: null, submission: null, walkthrough: null,
    estimateId: null, history: []
  };
}

/* Build an estimator-shaped state from a package quote. This object is
   used to PRICE the quote and, unchanged, to GENERATE the estimate. */
function plBuildEstState(q){
  const st = freshState();
  const pk = plPackage(q.packageId);
  const svc = pk ? pk.services : [];
  const propSqft = num(q.propSqft);
  st.propName = (q.propName || "").trim() || (q.propAddress || "").trim();
  st.propAddress = q.propAddress || "";
  st.propSqft = q.propSqft || "";
  st.sellers = plClone(q.sellers && q.sellers.length ? q.sellers : [{ name:"", phone:"", email:"" }]);

  if(svc.includes("cleaning")){
    st.enabled.cleaning = true;
    st.cleaning = {
      sqft: q.cleaning.sqft || "",
      carpet: !!q.cleaning.carpet, carpetSqft: q.cleaning.carpetSqft || "",
      declutter: !!q.cleaning.declutter, declutterSqft: ""
    };
  }
  if(svc.includes("painting")){
    const p = q.painting;
    const psq = num(p.sqft) || propSqft;
    const full = p.level === "full";
    st.enabled.painting = true;
    Object.assign(st.painting, {
      coats: "one",
      scope: (num(p.sqft) && num(p.sqft) !== propSqft) ? "custom" : "whole",
      sqft: (num(p.sqft) && num(p.sqft) !== propSqft) ? String(num(p.sqft)) : "",
      trimInWalls: true,            // owner spec: baseboards & trim included in the wall price
      trim: false, trimLinFt: "",
      ceiling: full && p.ceilings !== false, ceilingTier: "flat", ceilingSqft: (full && p.ceilings !== false) ? String(psq || "") : "",
      doors: full && num(p.doorCount) > 0, doorCount: full ? String(num(p.doorCount) || "") : ""
    });
  }
  if(svc.includes("flooring")){
    const f = q.flooring;
    const fsq = num(f.sqft) || propSqft;
    st.enabled.flooring = true;
    Object.assign(st.flooring, {
      type: f.type || "vinyl",
      sqft: fsq ? String(fsq) : "",
      removeOld: true, removalSqft: "",
      baseboards: true, baseboardLinFt: fsq ? String(plTrimLf(fsq)) : ""
    });
  }
  if(svc.includes("kitchen") && q.kb){
    if(q.kb.kitchen){ const k = st.kitchen; deepMerge(k, plClone(q.kb.kitchen)); }
    if(q.kb.bathroom && Array.isArray(q.kb.bathroom.rooms) && q.kb.bathroom.rooms.length){
      st.bathroom = { rooms: plClone(q.kb.bathroom.rooms) };
    }
    st.enabled.kitchen  = !!(q.kb.enabled && q.kb.enabled.kitchen);
    st.enabled.bathroom = !!(q.kb.enabled && q.kb.enabled.bathroom);
  }
  st.prelisting = { quoteId: q.id, packageId: q.packageId };
  return st;
}

function plWithState(st, fn){
  const saved = state;
  state = st;
  try { return fn(); } finally { state = saved; }
}

/* Price a quote. Returns per-service lines + overall range. */
function plComputeQuote(q){
  const pk = plPackage(q.packageId);
  if(!pk) return null;
  const st = plBuildEstState(q);
  return plWithState(st, () => {
    const lines = [];
    let subtotal = 0;
    const add = (key, label, amt, extra) => {
      subtotal += amt;
      lines.push(Object.assign({ key, label, amount: amt, range: plRange(amt) }, extra || {}));
    };
    const tbd = [];
    if(st.enabled.cleaning){
      const r = computeCategory("cleaning");
      add("cleaning", q.cleaning.declutter ? "Deep cleaning & decluttering" : "Deep cleaning", r.labour + r.material);
      if(st.cleaning.carpet && cleaningRateOf("carpet") <= 0) tbd.push("Carpet cleaning — priced at walkthrough");
      if(st.cleaning.declutter && cleaningRateOf("declutter") <= 0) tbd.push("Decluttering — priced after photo review");
    }
    if(st.enabled.painting){
      const r = computeCategory("painting");
      add("painting", "Painting", r.labour + r.material);
    }
    if(st.enabled.flooring){
      const r = computeCategory("flooring");
      add("flooring", "Flooring — " + (FLOORING_LABELS[st.flooring.type] || st.flooring.type), r.labour + r.material);
    }
    if(st.enabled.kitchen){
      const r = computeCategory("kitchen");
      add("kitchen", "Kitchen renovation", r.labour + r.material);
    }
    if(st.enabled.bathroom){
      const r = computeCategory("bathroom");
      const n = (st.bathroom.rooms || []).length;
      add("bathroom", n > 1 ? `Bathroom renovations (${n})` : "Bathroom renovation", r.labour + r.material);
    }
    const range = plRange(subtotal);
    return { lines, subtotal, range, tbd, rangePct: plRangePct(), computedAt: new Date().toISOString() };
  });
}

/* Readiness score — 0..100 + heat label. Null until at least one answer. */
function plReadiness(q){
  const r = q.readiness || {};
  let score = 0, answered = 0;
  PL_READINESS.forEach(qq => {
    const o = qq.opts.find(x => x[0] === r[qq.key]);
    if(o){ score += o[2]; answered++; }
  });
  if(q.targetListDate){
    const days = (new Date(q.targetListDate) - new Date()) / 86400000;
    if(days >= 0 && days <= 45) score += 5;
    else if(days > 45 && days <= 90) score += 3;
  }
  score = Math.min(100, Math.round(score));
  const heat = score >= 75 ? "Hot" : score >= 50 ? "Warm" : "Cool";
  return { score, heat, answered, total: PL_READINESS.length };
}

/* Scope-of-work bullets for a quote, reusing the estimator's own summary
   builder so the wording matches the formal estimate. */
function plScopeSections(q){
  try {
    const st = plBuildEstState(q);
    const secs = plWithState(st, () => buildEstimateSummary());
    // Kitchen (with basement) and Bathrooms use sub-blocks — flatten them.
    const order = ["cleaning","painting","flooring","kitchen","bathroom"];
    secs.sort((a, b) => order.indexOf(a.cat) - order.indexOf(b.cat));
    return secs.map(s => Array.isArray(s.bullets) ? s : Object.assign({}, s, {
      bullets: (s.subblocks || []).reduce((a, b) => a.concat([`<b>${b.title}</b>`], b.bullets || []), [])
    }));
  } catch(e){ console.warn("plScopeSections:", e); return []; }
}

/* ---------------------------------------------------------------------
   Storage
   --------------------------------------------------------------------- */
const PL_LS_KEY = "rts_pl_quotes_v1";
function plLoadLocal(){
  try { const a = JSON.parse(localStorage.getItem(PL_LS_KEY) || "[]"); return Array.isArray(a) ? a : []; }
  catch(e){ return []; }
}
function plSaveLocal(list){
  try { localStorage.setItem(PL_LS_KEY, JSON.stringify(list.slice(0, 200))); } catch(e){}
}
function plUpsertLocal(q){
  const list = plLoadLocal();
  const i = list.findIndex(x => x.id === q.id);
  if(i >= 0) list[i] = q; else list.unshift(q);
  plSaveLocal(list);
}
function plRemoveLocal(id){ plSaveLocal(plLoadLocal().filter(x => x.id !== id)); }

async function plCloudUpsert(q){
  if(!currentUser) return false;
  const payload = {
    name: (q.propName || q.propAddress || "Package quote").slice(0, 200),
    type: "package",
    state: q,
    updated_at: q.updated_at || new Date().toISOString()
  };
  const rows = await restFetch("estimates?select=id&type=eq.package&client_id=eq." + encodeURIComponent(q.id));
  if(Array.isArray(rows) && rows.length){
    await dbUpdate("estimates", { id: rows[0].id }, payload, { prefer:"return=minimal" });
  } else {
    await dbInsert("estimates", Object.assign({ user_id: q.owner_id || currentUser.id, client_id: q.id }, payload), { prefer:"return=minimal" });
  }
  return true;
}
async function plCloudList(){
  if(!currentUser) return [];
  const rows = await restFetch("estimates?select=" + encodeURIComponent("id,user_id,client_id,state,updated_at") +
    "&type=eq.package&order=updated_at.desc&limit=300");
  return (rows || []).map(r => {
    const q = r.state || {};
    if(!q.id) q.id = r.client_id;
    if(!q.owner_id) q.owner_id = r.user_id;
    return q;
  });
}
async function plCloudDelete(id){
  if(!currentUser) return;
  await restFetch("estimates?type=eq.package&client_id=eq." + encodeURIComponent(id), { method:"DELETE", headers:{ "Prefer":"return=minimal" } });
}

/* Photo upload — Supabase Storage bucket "package-photos" (public read).
   Setup: PRELISTING_PACKAGES_SETUP.md. Images are downscaled to 1600px. */
async function plDownscale(file){
  if(!/^image\//.test(file.type)) throw new Error("Please choose an image file");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const max = 1600, sc = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return await new Promise(res => c.toBlob(b => res(b), "image/jpeg", 0.82));
  } finally { URL.revokeObjectURL(url); }
}
async function plUploadPhoto(q, file){
  const token = getStoredAuthToken();
  if(!token) throw new Error("Sign in to upload photos");
  const blob = await plDownscale(file);
  const path = (q.owner_id || currentUser.id) + "/" + q.id + "/" + Date.now() + "-" + Math.random().toString(36).slice(2,6) + ".jpg";
  const base = SUPABASE_URL.replace(/\/$/, "");
  const resp = await fetch(base + "/storage/v1/object/package-photos/" + path, {
    method:"POST",
    headers:{ "Authorization":"Bearer " + token, "apikey": SUPABASE_ANON_KEY, "Content-Type":"image/jpeg", "x-upsert":"true" },
    body: blob
  });
  if(!resp.ok){
    const t = await resp.text().catch(() => "");
    if(/bucket not found/i.test(t)) throw new Error("Photo storage isn't set up yet — see PRELISTING_PACKAGES_SETUP.md");
    throw new Error("Upload failed: " + (t || ("HTTP " + resp.status)));
  }
  return base + "/storage/v1/object/public/package-photos/" + path;
}

/* ---------------------------------------------------------------------
   Email
   --------------------------------------------------------------------- */
function plQuoteTableHtml(q, opts){
  opts = opts || {};
  const qt = q.quote || plComputeQuote(q);
  const pk = plPackage(q.packageId);
  if(!qt || !pk) return "";
  const td = "font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#222;padding:8px 0;border-bottom:1px solid #eee;";
  const rows = qt.lines.map(l => `<tr><td style="${td}">${plEsc(l.label)}</td><td style="${td}text-align:right;white-space:nowrap;">${plMoneyRange(l.range)}</td></tr>`).join("");
  const tbd = (qt.tbd || []).map(t => `<tr><td colspan="2" style="${td}color:#777;font-style:italic;">${plEsc(t)}</td></tr>`).join("");
  const sections = plScopeSections(q).map(s => `
      <div style="margin:12px 0 0;">
        <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#a8853f;font-weight:700;">${plEsc(s.title)}</div>
        <ul style="margin:6px 0 0;padding-left:18px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12.5px;color:#333;line-height:1.55;">${s.bullets.map(b => `<li>${b}</li>`).join("")}</ul>
      </div>`).join("");
  const rd = plReadiness(q);
  return `
    <div style="border:1px solid #e6dcc3;border-radius:10px;padding:18px 20px;background:#fffdf7;margin:6px 0 16px;">
      <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:#a8853f;font-weight:700;">Pre-Listing Package ${pk.id} &middot; ${plEsc(pk.name)}</div>
      <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#555;margin-top:4px;">${plEsc(q.propAddress || q.propName || "")}${plPropLine(q) ? " &middot; " + plEsc(plPropLine(q)) : ""}</div>
      <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:26px;font-weight:800;color:#0a0a0a;margin:12px 0 2px;">${plMoneyRange(qt.range)}</div>
      <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#555;">Plus HST. The exact amount is provided at the walkthrough and is <b>guaranteed to be within this range</b>.</div>
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:14px;">${rows}${tbd}</table>
      ${sections}
      ${opts.internal ? `<div style="margin-top:14px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12.5px;color:#333;"><b>Readiness score:</b> ${rd.score}/100 (${rd.heat})</div>` : ""}
    </div>`;
}
function plEmailHtml(plainIntro, q, opts){
  const marker = "PLQUOTEMARKER";
  const html = buildClientEstimateEmailHtml(plainIntro + "\n\n" + marker);
  return html.replace(new RegExp('<p style="margin:0 0 14px;">' + marker + '</p>'), plQuoteTableHtml(q, opts)).replace(marker, plQuoteTableHtml(q, opts));
}
function plPlainQuote(q){
  const qt = q.quote || plComputeQuote(q);
  const pk = plPackage(q.packageId);
  if(!qt || !pk) return "";
  return [
    `Pre-Listing Package ${pk.id} — ${pk.name}`,
    `${q.propAddress || q.propName || ""}${plPropLine(q) ? " · " + plPropLine(q) : ""}`,
    `Price range: ${plMoneyRange(qt.range)} + HST`,
    ...qt.lines.map(l => `  • ${l.label}: ${plMoneyRange(l.range)}`),
    ...(qt.tbd || []).map(t => `  • ${t}`),
    "The exact amount is provided at the walkthrough and is guaranteed to be within this range."
  ].join("\n");
}
async function plSendEmail(payload){
  return invokeFunctionViaRest("email-estimate", payload);
}

/* ---------------------------------------------------------------------
   Controller
   --------------------------------------------------------------------- */
const PL = {
  mode: "list",          // list | edit | settings
  step: "property",
  cur: null,
  list: [],
  listFilter: "active",  // admin: active | requests | all
  loading: false,
  _hosting: false,
  _stash: null,
  _saveT: null,
  _sumT: null,

  /* ---- route entry ---- */
  open(){
    const view = document.getElementById("view-packages");
    if(view && !document.getElementById("plBody")) view.innerHTML = PL_VIEW_HTML;
    if(!document.getElementById("plBody")) return;
    // Deep link support: #/packages?id=pk_xxx
    const m = (location.hash || "").match(/[?&]id=([\w-]+)/);
    if(m && (!this.cur || this.cur.id !== m[1])){
      const q = plLoadLocal().find(x => x.id === m[1]) || this.list.find(x => x.id === m[1]);
      if(q){ this.cur = q; this.mode = "edit"; this.step = q.status === "draft" ? "property" : "quote"; }
    }
    this.render();
    if(this.mode === "list") this.refreshList();
  },

  locked(){
    return !!(this.cur && this.cur.status !== "draft" && !isAdmin());
  },

  steps(){
    const s = [ {k:"property", t:"Property"}, {k:"package", t:"Package"} ];
    if(this.cur && this.cur.packageId) s.push({k:"scope", t:"Scope"});
    if(this.cur && this.cur.packageId === 4) s.push({k:"kb", t:"Kitchen & Bath"});
    s.push({k:"readiness", t:"Readiness"}, {k:"quote", t:"Quote"});
    return s;
  },

  /* ---- top-level render ---- */
  render(){
    const body = document.getElementById("plBody");
    if(!body) return;
    if(this.mode === "request"){ this.renderTopActions(); body.innerHTML = this.renderRequest(); return; }
    if(this.step !== "kb" || this.mode !== "edit") this.release();
    this.renderTopActions();
    if(this.mode === "list") body.innerHTML = this.renderList();
    else if(this.mode === "settings") body.innerHTML = this.renderSettings();
    else body.innerHTML = this.renderEditor();
    if(this.mode === "edit" && this.step === "kb") this.host();
  },
  renderTopActions(){
    const hdrActions = document.getElementById("plTopActions");
    if(hdrActions){
      hdrActions.innerHTML = `
        ${this.mode !== "edit" ? `<button class="primary" onclick="PL.startNew()"><i class="ti ti-plus" aria-hidden="true"></i> New package quote</button>` : ""}
        ${this.mode !== "list" ? `<button onclick="PL.showList()"><i class="ti ti-list" aria-hidden="true"></i> ${isAdmin() ? "All package quotes" : "My package quotes"}</button>` : ""}
        ${isAdmin() && this.mode !== "settings" ? `<button onclick="PL.showSettings()"><i class="ti ti-settings" aria-hidden="true"></i> Package settings</button>` : ""}`;
    }
  },

  /* ---- website walkthrough requests (public page → admin) ---- */
  webList: [],
  renderWebList(){
    const filterBar = `
      <div class="pl-filter">
        ${[["active","Open requests",this.list.filter(q => q.status === "walkthrough_requested" || q.status === "walkthrough_scheduled").length],["requests","Needs scheduling",this.list.filter(q => q.status === "walkthrough_requested").length],["web","Website requests",(this.webList || []).filter(r => r.status === "new").length],["all","All quotes",this.list.length]].map(([k,l,c]) =>
          `<button class="${this.listFilter===k?'on':''}" onclick="PL.setFilter('${k}')">${l}<span>${c}</span></button>`).join("")}
      </div>`;
    const rows = this.webList || [];
    if(!rows.length) return filterBar + `<div class="pl-empty"><div class="pl-empty-t">No website requests yet</div><div>Walkthrough requests from renotosold.homes/packages appear here.</div></div>`;
    const stl = { new:["req","New — needs a time"], confirmed:["sched","Confirmed"], closed:["closed","Closed"] };
    return filterBar + `<div class="pl-list">${rows.map(r => {
      const q = r.quote || {}; const st = stl[r.status] || stl.new;
      const c = r.confirmed;
      return `<button class="pl-row" type="button" onclick="PL.openRequest('${r.id}')">
        <div class="pl-row-main"><div class="pl-row-addr">${plEsc(r.address || "—")}</div>
          <div class="pl-row-sub">${plEsc(r.name || "")} · ${plEsc(r.role || "")}${q.packageId ? " · Package " + q.packageId : ""}${c ? " · " + plEsc(plNiceDay(c.date)) + " " + plEsc(c.window) : ""}</div></div>
        <div class="pl-row-range">${q.low ? fmt(q.low) + " – " + fmt(q.high) : "—"}</div>
        <div class="pl-row-meta"><span class="pl-status ${st[0]}">${st[1]}</span></div>
      </button>`; }).join("")}</div>`;
  },
  openRequest(id){ this.release(); this.curReq = (this.webList || []).find(r => r.id === id) || null; if(!this.curReq) return; this.mode = "request"; this.render(); window.scrollTo({ top:0, behavior:"smooth" }); },
  renderRequest(){
    const r = this.curReq; if(!r) return "";
    const q = r.quote || {}; const c = r.confirmed;
    return `
      <section class="pl-card pl-quote">
        <div class="pl-q-eyebrow">Website walkthrough request · ${new Date(r.created_at).toLocaleString("en-CA", { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" })}</div>
        <div class="pl-q-addr" style="font-size:15px;color:var(--ink);margin-top:6px;"><b>${plEsc(r.address || "")}</b></div>
        <div class="pl-admin-grid" style="margin-top:12px;">
          <div><span>Name</span><b>${plEsc(r.name || "")}</b><div class="pl-hint">${plEsc(r.role || "")}</div></div>
          <div><span>Email</span><b><a href="mailto:${plEsc(r.email || "")}" style="color:var(--gold-bright)">${plEsc(r.email || "")}</a></b></div>
          <div><span>Phone</span><b><a href="tel:${plEsc((r.phone || "").replace(/[^0-9+]/g, ""))}" style="color:var(--gold-bright)">${plEsc(r.phone || "")}</a></b></div>
        </div>
        ${q.packageId ? `<div class="pl-q-lines" style="margin-top:14px;">
          <div><span><b>Package ${q.packageId} · ${plEsc(q.packageName || "")}</b> · ${plEsc(plPropLine({ propType:(q.options||{}).ptype, beds:(q.options||{}).beds, baths:(q.options||{}).baths, basementIncluded:(q.options||{}).bsmt, propSqft:q.sqft }))}</span><b>${fmt(q.low)} – ${fmt(q.high)}</b></div>
          ${(q.lines || []).map(l => `<div><span>${plEsc(l.label)}</span><b>${fmt(l.low)} – ${fmt(l.high)}</b></div>`).join("")}
          ${(q.tbd || []).map(t => `<div class="tbd"><span>${plEsc(t)}</span><b>TBD</b></div>`).join("")}
        </div>` : ""}
        <div class="pl-admin-notes"><span>${c ? "Confirmed time" : "Preferred times — pick one to confirm"}</span>
          <div class="pl-prefs">${(r.preferences || []).map((p, i) => {
            const on = c && c.date === p.date && c.window === p.window;
            return `<button type="button" class="pl-pref ${on ? "on" : ""}" onclick="PL.confirmRequest(${i})"><b>${plNiceDay(p.date, true)}</b><span>${plEsc(p.window)}</span><em>${on ? "Confirmed" : "Confirm &amp; email " + plEsc((r.name || "").split(/\s+/)[0] || "them")}</em></button>`; }).join("")}</div>
        </div>
        ${r.notes ? `<div class="pl-admin-notes"><span>Notes</span>${plEsc(r.notes)}</div>` : ""}
        ${(r.photos || []).length ? `<div class="pl-admin-notes"><span>Photos (${r.photos.length})</span><div class="pl-photos" style="margin-top:6px;">${r.photos.map((u, i) => `<div class="pl-photo"><a href="${plEsc(u)}" target="_blank" rel="noopener"><img src="${plEsc(u)}" alt="Photo ${i+1}" loading="lazy"></a></div>`).join("")}</div></div>` : ""}
        <div class="pl-field" style="margin-top:12px;"><label>Message to include in the confirmation <span class="pl-opt">optional</span></label>
          <input type="text" id="plReqNote" value="${plEsc(r.admin_note || "")}" placeholder="e.g. Please leave the side door unlocked"></div>
        <div class="pl-actions">
          <button type="button" class="primary" onclick="PL.quoteFromRequest()"><i class="ti ti-file-plus" aria-hidden="true"></i> Create package quote from this</button>
          ${r.status !== "closed" ? `<button type="button" onclick="PL.setRequestStatus('closed')">Close request</button>` : `<button type="button" onclick="PL.setRequestStatus('new')">Reopen</button>`}
          <button type="button" class="pl-danger" onclick="PL.deleteRequest()">Delete</button>
          <button type="button" onclick="PL.listFilter='web'; PL.showList()">Back to website requests</button>
        </div>
      </section>`;
  },
  async confirmRequest(i){
    const r = this.curReq, p = r && (r.preferences || [])[i];
    if(!p) return;
    const note = ((document.getElementById("plReqNote") || {}).value || "").trim();
    const confirmed = { date:p.date, window:p.window, by: currentUser ? currentUser.email : "", at: new Date().toISOString() };
    try {
      await dbUpdate("walkthrough_requests", { id:r.id }, { status:"confirmed", confirmed, admin_note: note || null, updated_at: new Date().toISOString() }, { prefer:"return=minimal" });
    } catch(e){ brandedAlert("Couldn't save: " + (e && e.message ? e.message : e)); return; }
    Object.assign(r, { status:"confirmed", confirmed, admin_note: note });
    this.render();
    flash("Walkthrough confirmed");
    try {
      const nice = plNiceDay(p.date, true);
      const body = `Hi ${(r.name || "").split(/\s+/)[0] || "there"},\n\nThanks for your request. Your pre-listing walkthrough for ${r.address} is confirmed for ${nice}, ${p.window}.${note ? "\n\n" + note : ""}\n\nWe'll confirm the exact amount at the walkthrough — guaranteed to be within the range you were quoted.\n\nQuestions? Reply to this email or call 647-500-0270.\n\nReno to Sold`;
      const rts = plSettings().ccEmail || COMPANY_INFO.email || "renotosold@gmail.com";
      await plSendEmail({ to:[r.email], cc:[rts], subject:`Walkthrough confirmed — ${nice}, ${p.window}`, body });
    } catch(e){ console.warn("[PL] confirmation email failed:", e && e.message); brandedAlert("The time is saved, but the confirmation email didn't send. Please email " + r.email + " directly."); }
  },
  async setRequestStatus(st){
    const r = this.curReq; if(!r) return;
    try { await dbUpdate("walkthrough_requests", { id:r.id }, { status:st, updated_at:new Date().toISOString() }, { prefer:"return=minimal" }); r.status = st; this.render(); }
    catch(e){ brandedAlert("Couldn't update: " + (e && e.message ? e.message : e)); }
  },
  async deleteRequest(){
    const r = this.curReq; if(!r) return;
    if(!(await brandedConfirm("Delete this website request? This can't be undone.", { title:"Delete request", confirmLabel:"Delete" }))) return;
    try { await dbDelete("walkthrough_requests", { id:r.id }); } catch(e){ brandedAlert("Couldn't delete: " + (e && e.message ? e.message : e)); return; }
    this.webList = (this.webList || []).filter(x => x.id !== r.id);
    this.listFilter = "web"; this.showList();
  },
  quoteFromRequest(){
    const r = this.curReq; if(!r) return;
    const o = (r.quote && r.quote.options) || {};
    const q = plNewQuote();
    Object.assign(q, { propAddress: r.address || "", propSqft: String(o.sqft || (r.quote && r.quote.sqft) || ""), packageId: o.pkg || (r.quote && r.quote.packageId) || null, notes: r.notes || "",
      propType: o.ptype || "", beds: o.beds || "", baths: o.baths || "", basementIncluded: !!o.bsmt });
    const isAgent = /agent/i.test(r.role || "");
    q.sellers = [ isAgent ? { name:"", phone:"", email:"" } : { name:r.name || "", phone:r.phone || "", email:r.email || "" } ];
    q.notes = (isAgent ? `Website request from agent ${r.name} (${r.email}, ${r.phone}).` : "") + (r.notes ? " " + r.notes : "");
    q.cleaning.carpet = !!o.carpet; q.cleaning.carpetSqft = o.carpetSqft || ""; q.cleaning.declutter = !!o.declutter;
    q.painting.level = o.level === "full" ? "full" : "walls"; q.painting.doorCount = o.doors || ""; q.painting.ceilings = o.ceilings !== false;
    q.flooring.type = o.floor || "vinyl";
    q.photos = (r.photos || []).map(u => ({ url:u, name:"", at:r.created_at, by:r.email }));
    if(r.confirmed) q.walkthrough = { date:r.confirmed.date, window:r.confirmed.window, note:r.admin_note || "", by:r.confirmed.by, at:r.confirmed.at };
    q.walkthroughPrefs = r.preferences || [];
    q.status = r.confirmed ? "walkthrough_scheduled" : "walkthrough_requested";
    q.source = { type:"website", requestId:r.id };
    q.quote = plComputeQuote(q);
    this.cur = q; this.mode = "edit"; this.step = "property";
    this._log("Created from website request", r.name + " · " + r.email);
    this._setHash(q.id);
    this.save(true);
    this.render();
    window.scrollTo({ top:0, behavior:"smooth" });
  },

  /* ---- list ---- */
  showList(){ this.release(); this.mode = "list"; this.cur = null; this._setHash(""); this.render(); this.refreshList(); },
  async refreshList(){
    const local = plLoadLocal();
    let cloud = [];
    this.loading = true;
    try { cloud = await plCloudList(); } catch(e){ console.warn("[PL] cloud list failed:", e && e.message); }
    this.loading = false;
    const byId = new Map();
    cloud.forEach(q => byId.set(q.id, q));
    local.forEach(q => {
      const c = byId.get(q.id);
      if(!c || new Date(q.updated_at || 0) > new Date(c.updated_at || 0)) byId.set(q.id, q);
    });
    let all = [...byId.values()];
    if(!isAdmin() && currentUser) all = all.filter(q => !q.owner_id || q.owner_id === currentUser.id);
    all.sort((a,b) => new Date(b.updated_at||0) - new Date(a.updated_at||0));
    this.list = all;
    if(isAdmin()){
      try { this.webList = await restFetch("walkthrough_requests?select=*&order=created_at.desc&limit=200") || []; }
      catch(e){ this.webList = this.webList || []; console.warn("[PL] website requests:", e && e.message); }
    }
    if(this.mode === "list"){
      const body = document.getElementById("plBody");
      if(body) body.innerHTML = this.renderList();
    }
  },
  setFilter(f){ this.listFilter = f; const b = document.getElementById("plBody"); if(b) b.innerHTML = this.renderList(); },
  renderList(){
    const admin = isAdmin();
    if(admin && this.listFilter === "web") return this.renderWebList();
    let rows = this.list.slice();
    const counts = {
      active: rows.filter(q => q.status === "walkthrough_requested" || q.status === "walkthrough_scheduled").length,
      requests: rows.filter(q => q.status === "walkthrough_requested").length
    };
    if(admin){
      if(this.listFilter === "active")   rows = rows.filter(q => q.status === "walkthrough_requested" || q.status === "walkthrough_scheduled");
      if(this.listFilter === "requests") rows = rows.filter(q => q.status === "walkthrough_requested");
    }
    const filterBar = admin ? `
      <div class="pl-filter">
        ${[["active","Open requests",counts.active],["requests","Needs scheduling",counts.requests],["web","Website requests",(this.webList || []).filter(r => r.status === "new").length],["all","All quotes",this.list.length]].map(([k,l,c]) =>
          `<button class="${this.listFilter===k?'on':''}" onclick="PL.setFilter('${k}')">${l}<span>${c}</span></button>`).join("")}
      </div>` : "";
    const empty = this.loading ? `<div class="pl-empty">Loading package quotes…</div>` : `
      <div class="pl-empty">
        <div class="pl-empty-t">${admin && this.listFilter !== "all" ? "No open walkthrough requests" : "No package quotes yet"}</div>
        <div>${admin && this.listFilter !== "all" ? "Requests appear here as soon as an agent submits a package for a walkthrough." : "Start a quote to price a pre-listing package in under two minutes."}</div>
        ${admin && this.listFilter !== "all" ? "" : `<button class="primary" onclick="PL.startNew()" style="margin-top:14px;">New package quote</button>`}
      </div>`;
    const cards = rows.map(q => {
      const pk = plPackage(q.packageId);
      const qt = q.quote;
      const rd = plReadiness(q);
      const st = PL_STATUS[q.status] || PL_STATUS.draft;
      return `
        <button class="pl-row" type="button" onclick="PL.openQuote('${q.id}')">
          <div class="pl-row-main">
            <div class="pl-row-addr">${plEsc(q.propAddress || q.propName || "Untitled property")}</div>
            <div class="pl-row-sub">${pk ? "Package " + pk.id + " · " + plEsc(pk.name) : "No package selected"}${q.propType ? " · " + plEsc((PL_PTYPES.find(x => x[0] === q.propType) || [,""])[1]) : ""}${admin && q.owner_name ? " · " + plEsc(q.owner_name) : ""}</div>
          </div>
          <div class="pl-row-range">${qt ? plMoneyRange(qt.range) : "—"}</div>
          <div class="pl-row-meta">
            ${rd.answered ? `<span class="pl-heat ${rd.heat.toLowerCase()}">${rd.score} · ${rd.heat}</span>` : ""}
            <span class="pl-status ${st.cls}">${st.label}</span>
          </div>
        </button>`;
    }).join("");
    return `${filterBar}<div class="pl-list">${rows.length ? cards : empty}</div>`;
  },
  openQuote(id){
    const q = this.list.find(x => x.id === id) || plLoadLocal().find(x => x.id === id);
    if(!q) return;
    this.cur = plClone(q);
    this._normalize(this.cur);
    this.mode = "edit";
    this.step = (q.status === "draft" && !q.quote) ? "property" : "quote";
    this._setHash(q.id);
    this.render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  },
  startNew(){
    this.release();
    this.cur = plNewQuote();
    this.mode = "edit";
    this.step = "property";
    this._setHash(this.cur.id);
    this.render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  },
  _normalize(q){
    const d = plNewQuote();
    Object.keys(d).forEach(k => { if(q[k] === undefined) q[k] = plClone(d[k]); });
    ["cleaning","painting","flooring","kb","appliances"].forEach(k => { q[k] = Object.assign(plClone(d[k]), q[k] || {}); });
    if(!Array.isArray(q.sellers) || !q.sellers.length) q.sellers = [{ name:"", phone:"", email:"" }];
    if(!Array.isArray(q.photos)) q.photos = [];
    if(!Array.isArray(q.history)) q.history = [];
    if(!Array.isArray(q.appliances.requests)) q.appliances.requests = [];
  },
  _setHash(id){
    const url = "#/packages" + (id ? "?id=" + id : "");
    if(location.hash !== url) history.replaceState({ route:"packages" }, "", url);
  },

  /* ---- editing helpers ---- */
  set(path, value, rerender){
    if(!this.cur || this.locked()) return;
    const parts = path.split(".");
    let o = this.cur;
    for(let i = 0; i < parts.length - 1; i++){ if(o[parts[i]] == null) o[parts[i]] = {}; o = o[parts[i]]; }
    o[parts[parts.length - 1]] = value;
    this.changed(rerender);
  },
  changed(rerender){
    if(!this.cur) return;
    this.cur.quote = plComputeQuote(this.cur);
    this.cur.updated_at = new Date().toISOString();
    if(rerender) this.renderStepOnly();
    else this.refreshLive();
    this.scheduleSave();
  },
  refreshLive(){
    clearTimeout(this._sumT);
    this._sumT = setTimeout(() => {
      const s = document.getElementById("plSummary");
      if(s) s.innerHTML = this.renderSummaryInner();
      const m = document.getElementById("plMobileBar");
      if(m) m.innerHTML = this.renderMobileBarInner();
      if(this.step === "package") PL_PACKAGES.forEach(p => {
        const el = document.getElementById("plPkgPrice" + p.id);
        if(el) el.innerHTML = this.packagePriceLabel(p.id);
      });
      if(this.step === "readiness"){
        const el = document.getElementById("plScoreCard");
        if(el) el.innerHTML = this.renderScoreInner();
      }
      if(this.step === "scope"){
        const el = document.getElementById("plTrimHint");
        if(el) el.textContent = this.trimHint();
      }
    }, 60);
  },
  renderStepOnly(){
    const el = document.getElementById("plEditor");
    if(!el){ this.render(); return; }
    this.release();
    el.outerHTML = this.renderEditor();
    if(this.step === "kb") this.host();
  },
  scheduleSave(immediate){
    clearTimeout(this._saveT);
    const run = () => this.save(true);
    if(immediate) return run();
    this._saveT = setTimeout(run, 900);
  },
  async save(silent){
    if(!this.cur) return;
    if(this._hosting) this.syncFromHost();
    const q = this.cur;
    q.updated_at = new Date().toISOString();
    plUpsertLocal(q);
    const i = this.list.findIndex(x => x.id === q.id);
    if(i >= 0) this.list[i] = plClone(q); else this.list.unshift(plClone(q));
    try {
      await plCloudUpsert(q);
      this._saveState("Saved");
    } catch(e){
      console.warn("[PL] cloud save failed:", e && e.message);
      this._saveState("Saved on this device");
    }
    if(!silent) flash("Package quote saved");
  },
  _saveState(t){ const el = document.getElementById("plSaveState"); if(el) el.textContent = t; },

  go(step){
    if(!this.cur) return;
    if(step === this.step) return;
    const order = this.steps().map(s => s.k);
    const from = order.indexOf(this.step), to = order.indexOf(step);
    if(to > from){
      const err = this.validateUpTo(step);
      if(err){ brandedAlert(err); return; }
    }
    this.release();
    this.step = step;
    this.render();
    const top = document.getElementById("plEditor");
    if(top) top.scrollIntoView({ behavior:"smooth", block:"start" });
  },
  next(){ const o = this.steps().map(s => s.k); const i = o.indexOf(this.step); if(i < o.length - 1) this.go(o[i + 1]); },
  back(){ const o = this.steps().map(s => s.k); const i = o.indexOf(this.step); if(i > 0) this.go(o[i - 1]); },
  validateUpTo(step){
    const q = this.cur, order = this.steps().map(s => s.k), to = order.indexOf(step);
    const need = k => order.indexOf(k) < to;
    if(need("property")){
      if(!(q.propAddress || "").trim()) return "Add the property address to continue.";
      if(!q.propType) return "Choose the property type to continue.";
      if(!num(q.propSqft)) return "Add the total property square footage to continue.";
      if(!num(q.beds) || !num(q.baths)) return "Add the number of bedrooms and bathrooms to continue.";
    }
    if(need("package") && !q.packageId) return "Choose a package to continue.";
    if(need("scope") && q.packageId >= 2 && q.painting.level === "full" && !num(q.painting.doorCount))
      return "Enter the number of interior doors to paint (full painting option).";
    if(need("scope") && q.cleaning.carpet && !num(q.cleaning.carpetSqft))
      return "Enter the carpeted area (sqft) for carpet cleaning, or untick it.";
    return "";
  },

  /* ---- editor shell ---- */
  renderEditor(){
    const q = this.cur;
    const steps = this.steps();
    const idx = steps.findIndex(s => s.k === this.step);
    const st = PL_STATUS[q.status] || PL_STATUS.draft;
    const lockedBanner = (q.status !== "draft") ? `
      <div class="pl-banner ${st.cls}">
        <div><b>${st.label}</b>${q.submission ? " · submitted " + new Date(q.submission.submitted_at).toLocaleDateString("en-CA", { month:"short", day:"numeric" }) : ""}${q.walkthrough && q.walkthrough.date ? " · walkthrough " + plEsc(new Date(q.walkthrough.date + "T12:00").toLocaleDateString("en-CA", { weekday:"short", month:"short", day:"numeric" })) + (q.walkthrough.window ? ", " + plEsc(q.walkthrough.window) : "") : (Array.isArray(q.walkthroughPrefs) && q.status === "walkthrough_requested" ? " · preferred: " + q.walkthroughPrefs.map(p => plEsc(plNiceDay(p.date)) + " " + plEsc(p.window)).join(" / ") : "")}</div>
        <div class="pl-banner-sub">${this.locked() ? "This quote is with Reno to Sold and can no longer be edited. You can still send it to your seller or generate an estimate." : (isAdmin() ? "Admin view — you can edit this quote and update its status below." : "")}</div>
      </div>` : "";
    return `
      <div id="plEditor" class="pl-editor ${this.locked() ? "pl-locked" : ""}">
        ${lockedBanner}
        <div class="pl-steps" role="tablist">
          ${steps.map((s, i) => `<button type="button" class="pl-step ${s.k === this.step ? "on" : ""} ${i < idx ? "done" : ""}" onclick="PL.go('${s.k}')"><span class="pl-step-n">${i < idx ? '<i class="ti ti-check" aria-hidden="true"></i>' : i + 1}</span><span class="pl-step-t">${s.t}</span></button>`).join("")}
        </div>
        <div class="pl-grid">
          <div class="pl-main">
            ${this.renderStep()}
            <div class="pl-nav">
              ${idx > 0 ? `<button type="button" onclick="PL.back()"><i class="ti ti-arrow-left" aria-hidden="true"></i> Back</button>` : `<span></span>`}
              <span class="pl-save-state" id="plSaveState"></span>
              ${idx < steps.length - 1 ? `<button type="button" class="primary" onclick="PL.next()">${steps[idx + 1].k === "quote" ? "See my quote" : "Continue"} <i class="ti ti-arrow-right" aria-hidden="true"></i></button>` : `<span></span>`}
            </div>
          </div>
          <aside class="pl-side"><div class="pl-summary" id="plSummary">${this.renderSummaryInner()}</div></aside>
        </div>
        <div class="pl-mobilebar" id="plMobileBar">${this.renderMobileBarInner()}</div>
      </div>`;
  },

  renderSummaryInner(){
    const q = this.cur;
    const pk = plPackage(q.packageId);
    const qt = q.quote;
    const rd = plReadiness(q);
    if(!pk){
      return `
        <div class="pl-sum-eyebrow">Your quote</div>
        <div class="pl-sum-empty">Choose a package to see an instant price range.</div>
        ${q.propAddress ? `<div class="pl-sum-addr">${plEsc(q.propAddress)}${num(q.propSqft) ? " · " + num(q.propSqft) + " sqft" : ""}</div>` : ""}`;
    }
    return `
      <div class="pl-sum-eyebrow">Package ${pk.id} · ${plEsc(pk.name)}</div>
      <div class="pl-sum-range">${qt && qt.subtotal > 0 ? plMoneyRange(qt.range) : "—"}</div>
      <div class="pl-sum-note">${qt && qt.subtotal > 0 ? "Plus HST · guaranteed range" : "Enter the property sqft to price this package."}</div>
      ${qt && qt.lines.length ? `<div class="pl-sum-lines">${qt.lines.map(l => `<div><span>${plEsc(l.label)}</span><b>${plMoneyRange(l.range)}</b></div>`).join("")}</div>` : ""}
      ${qt && qt.tbd && qt.tbd.length ? `<div class="pl-sum-tbd">${qt.tbd.map(t => `<div>${plEsc(t)}</div>`).join("")}</div>` : ""}
      ${q.propAddress ? `<div class="pl-sum-addr">${plEsc(q.propAddress)}<br>${plEsc(plPropLine(q))}</div>` : ""}
      ${rd.answered ? `<div class="pl-sum-score"><span>Readiness</span><b class="pl-heat ${rd.heat.toLowerCase()}">${rd.score}/100${isAdmin() ? " · " + rd.heat : ""}</b></div>` : ""}`;
  },
  renderMobileBarInner(){
    const q = this.cur, qt = q && q.quote;
    const pk = q && plPackage(q.packageId);
    return `<div><div class="pl-mb-l">${pk ? "Package " + pk.id : "Pre-listing quote"}</div><div class="pl-mb-r">${qt && qt.subtotal > 0 ? plMoneyRange(qt.range) : "—"}</div></div>`;
  },

  renderStep(){
    switch(this.step){
      case "property":  return this.stepProperty();
      case "package":   return this.stepPackage();
      case "scope":     return this.stepScope();
      case "kb":        return this.stepKB();
      case "readiness": return this.stepReadiness();
      case "quote":     return this.stepQuote();
    }
    return "";
  },

  /* ---- step 1: property ---- */
  stepProperty(){
    const q = this.cur;
    const sellers = q.sellers.map((s, i) => `
      <div class="pl-seller">
        <div class="pl-f3">
          <div><label>Seller name</label><input type="text" value="${plEsc(s.name)}" oninput="PL.set('sellers.${i}.name', this.value)" placeholder="Full name"></div>
          <div><label>Phone</label><input type="tel" value="${plEsc(s.phone)}" oninput="PL.set('sellers.${i}.phone', this.value)" placeholder="416-555-0123"></div>
          <div><label>Email</label><input type="email" value="${plEsc(s.email)}" oninput="PL.set('sellers.${i}.email', this.value)" placeholder="name@email.com"></div>
        </div>
        ${i > 0 ? `<button type="button" class="pl-link" onclick="PL.removeSeller(${i})">Remove seller</button>` : ""}
      </div>`).join("");
    return `
      <section class="pl-card">
        <div class="pl-card-h"><h3>Property</h3><p>Where is the listing, and how big is it?</p></div>
        <div class="pl-field pl-ac-wrap">
          <label>Property address <span class="pl-req">required</span></label>
          <input type="text" id="plAddr" autocomplete="off" value="${plEsc(q.propAddress)}" placeholder="Start typing a GTA address…" oninput="PL.set('propAddress', this.value); PL.acInput(this.value)">
          <div class="pl-ac-list" id="plAcList"></div>
        </div>
        <div class="pl-field"><label>Property type <span class="pl-req">required</span></label>
          <div class="pl-pills">${PL_PTYPES.map(([k, l]) => `<button type="button" class="${q.propType === k ? "on" : ""}" onclick="PL.set('propType','${k}',true)">${l}</button>`).join("")}</div></div>
        <div class="pl-f3">
          <div class="pl-field"><label>Finished sqft <span class="pl-req">required</span></label>
            <input type="number" min="0" inputmode="numeric" value="${plEsc(q.propSqft)}" placeholder="e.g. 1600" oninput="PL.set('propSqft', this.value)"></div>
          <div class="pl-field"><label>Bedrooms <span class="pl-req">required</span></label>
            <input type="number" min="0" step="1" inputmode="numeric" value="${plEsc(q.beds)}" placeholder="e.g. 3" oninput="PL.set('beds', this.value)"></div>
          <div class="pl-field"><label>Bathrooms <span class="pl-req">required</span></label>
            <input type="number" min="0" step="0.5" inputmode="decimal" value="${plEsc(q.baths)}" placeholder="e.g. 2.5" oninput="PL.set('baths', this.value)"></div>
        </div>
        ${q.propType !== "condo" ? `<label class="pl-check" style="margin-top:0"><input type="checkbox" ${q.basementIncluded ? "checked" : ""} onchange="PL.set('basementIncluded', this.checked, true)">
          <span><b>The basement is included in the total sqft</b> <em>${q.basementIncluded ? "cleaning, painting and flooring are priced on the full sqft, basement included" : "leave unticked if the sqft is the main floors only, or there's no basement"}</em></span></label>` : ""}
        <div class="pl-f2" style="margin-top:6px;">
          <div class="pl-field"><label>Target listing date</label>
            <input type="date" value="${plEsc(q.targetListDate)}" onchange="PL.set('targetListDate', this.value)"></div>
        </div>
        <div class="pl-field"><label>Property name / nickname <span class="pl-opt">optional</span></label>
          <input type="text" value="${plEsc(q.propName)}" placeholder="e.g. Smith — Maple Ave" oninput="PL.set('propName', this.value)"></div>
      </section>
      <section class="pl-card">
        <div class="pl-card-h"><h3>Seller</h3><p>Used when you send the quote to your seller.</p></div>
        ${sellers}
        <button type="button" class="pl-link" onclick="PL.addSeller()"><i class="ti ti-plus" aria-hidden="true"></i> Add another seller</button>
      </section>`;
  },
  addSeller(){ if(this.locked()) return; this.cur.sellers.push({ name:"", phone:"", email:"" }); this.changed(true); },
  removeSeller(i){ if(this.locked()) return; this.cur.sellers.splice(i, 1); this.changed(true); },

  /* address autocomplete (Photon, GTA-biased — same service the tracker uses) */
  _acT: null, _acCtrl: null,
  acInput(v){
    clearTimeout(this._acT);
    const list = document.getElementById("plAcList");
    if(!list) return;
    if((v || "").trim().length < 3){ list.classList.remove("show"); list.innerHTML = ""; return; }
    this._acT = setTimeout(() => {
      try { if(this._acCtrl) this._acCtrl.abort(); } catch(e){}
      this._acCtrl = new AbortController();
      fetch("https://photon.komoot.io/api/?q=" + encodeURIComponent(v) + "&limit=6&lang=en&lat=43.72&lon=-79.42", { signal: this._acCtrl.signal })
        .then(r => r.json()).then(d => {
          const fmtP = p => {
            const street = [p.housenumber, p.street || (p.osm_key === "building" ? p.name : "")].filter(Boolean).join(" ");
            return [street || p.name, p.city || p.town || p.village || p.county, p.state, p.postcode].filter(Boolean).join(", ");
          };
          const items = (d.features || []).map(f => fmtP(f.properties || {})).filter((x, i, a) => x && a.indexOf(x) === i);
          if(!items.length){ list.classList.remove("show"); list.innerHTML = ""; return; }
          list.innerHTML = items.map(x => `<div class="pl-ac-item" onmousedown="PL.acPick(this)">${plEsc(x)}</div>`).join("");
          list.classList.add("show");
        }).catch(() => {});
    }, 250);
  },
  acPick(el){
    const v = el.textContent;
    const inp = document.getElementById("plAddr");
    if(inp) inp.value = v;
    this.set("propAddress", v);
    const list = document.getElementById("plAcList");
    if(list){ list.classList.remove("show"); list.innerHTML = ""; }
  },

  /* ---- step 2: package ---- */
  packagePriceLabel(id){
    const q = this.cur;
    if(!num(q.propSqft)) return `<span class="pl-pkg-from">Enter sqft for pricing</span>`;
    const tmp = plClone(q); tmp.packageId = id;
    if(id === 4 && !(q.kb.enabled.kitchen || q.kb.enabled.bathroom)){
      tmp.packageId = 3;
      const r = plComputeQuote(tmp);
      return `<span class="pl-pkg-from">From</span> ${fmt(r.range.low)}<span class="pl-pkg-plus"> + kitchen &amp; bath</span>`;
    }
    const r = plComputeQuote(tmp);
    return r ? `<span class="pl-pkg-from">From</span> ${fmt(r.range.low)}` : "";
  },
  stepPackage(){
    const q = this.cur;
    const svcList = (svc) => ["cleaning","painting","flooring","kitchen"].map(s => {
      const on = svc.includes(s);
      const lbl = s === "kitchen" ? "Kitchen &amp; bath (optional)" : PL_SERVICE_LABELS[s];
      return `<li class="${on ? "on" : ""}"><i class="ti ${on ? "ti-check" : "ti-minus"}" aria-hidden="true"></i>${lbl}</li>`;
    }).join("");
    return `
      <section class="pl-card">
        <div class="pl-card-h"><h3>Choose a package</h3><p>Each package includes everything in the one before it. Prices update with the property size.</p></div>
        <div class="pl-pkgs">
          ${PL_PACKAGES.map(p => `
            <button type="button" class="pl-pkg ${q.packageId === p.id ? "on" : ""}" onclick="PL.pickPackage(${p.id})" aria-pressed="${q.packageId === p.id}">
              <div class="pl-pkg-top"><span class="pl-pkg-n">Package ${p.id}</span>${q.packageId === p.id ? `<span class="pl-pkg-sel"><i class="ti ti-circle-check-filled" aria-hidden="true"></i> Selected</span>` : ""}</div>
              <div class="pl-pkg-name">${p.name}</div>
              <div class="pl-pkg-tag">${p.tagline}</div>
              <ul class="pl-pkg-svc">${svcList(p.services)}</ul>
              <div class="pl-pkg-price" id="plPkgPrice${p.id}">${this.packagePriceLabel(p.id)}</div>
            </button>`).join("")}
        </div>
      </section>
      <section class="pl-card">
        <div class="pl-card-h"><h3>What's included</h3></div>
        <details class="pl-incl"><summary>What's included in the deep clean</summary>${cleaningScopeHtml(false)}</details>
        <details class="pl-incl"><summary>What's included in flooring</summary>${PL_FLOOR_SCOPE.map(([h, d]) => `<div class="cln-group"><div class="cln-group-t">${h}</div><div class="pl-hint" style="color:var(--ink);font-size:12.5px;">${d}</div></div>`).join("")}</details>
        <details class="pl-incl"><summary>What's included in kitchen &amp; bath</summary>${PL_KB_SCOPE.map(([h, d]) => `<div class="cln-group"><div class="cln-group-t">${h}</div><div class="pl-hint" style="color:var(--ink);font-size:12.5px;">${d}</div></div>`).join("")}</details>
      </section>
      <section class="pl-card pl-card-quiet">
        <div class="pl-card-h"><h3>Appliance refresh</h3><p>Not a package — available with any of them through our Canadian Appliance Source partnership. You can request it from the quote page.</p></div>
      </section>`;
  },
  pickPackage(id){
    if(this.locked()) return;
    this.cur.packageId = id;
    if(id === 4 && !this.cur.kb.kitchen){
      this.cur.kb = { enabled:{ kitchen:true, bathroom:true }, kitchen:null, bathroom:null };
    }
    this.changed(true);
  },

  /* ---- step 3: scope ---- */
  trimHint(){
    const q = this.cur;
    const psq = num(q.painting.sqft) || num(q.propSqft);
    return psq ? `≈ ${plTrimLf(psq)} linear feet of baseboards & trim, included in the wall price.` : "";
  },
  stepScope(){
    const q = this.cur;
    const pk = plPackage(q.packageId);
    if(!pk) return "";
    const svc = pk.services;
    const ps = num(q.propSqft);
    const carpetRate = cleaningRateOf("carpet");
    let html = "";
    // Cleaning
    html += `
      <section class="pl-card">
        <div class="pl-card-h"><h3>Deep cleaning &amp; decluttering</h3><p>Full pre-listing deep clean, priced per sqft.</p></div>
        <div class="pl-f2">
          <div class="pl-field"><label>Cleaning area (sqft)</label>
            <input type="number" min="0" inputmode="numeric" value="${plEsc(q.cleaning.sqft)}" placeholder="${ps ? ps + " (whole property)" : "e.g. 1600"}" oninput="PL.set('cleaning.sqft', this.value)"></div>
        </div>
        <details class="pl-incl"><summary>What's included</summary>${cleaningScopeHtml(false)}</details>
        <label class="pl-check"><input type="checkbox" ${q.cleaning.carpet ? "checked" : ""} onchange="PL.set('cleaning.carpet', this.checked, true)">
          <span><b>Add carpet cleaning</b> <em>extra${carpetRate > 0 ? "" : " · priced at walkthrough"}</em></span></label>
        ${q.cleaning.carpet ? `<div class="pl-indent pl-f2"><div class="pl-field"><label>Carpeted area (sqft)</label><input type="number" min="0" inputmode="numeric" value="${plEsc(q.cleaning.carpetSqft)}" placeholder="e.g. 400" oninput="PL.set('cleaning.carpetSqft', this.value)"></div></div>` : ""}
        <label class="pl-check"><input type="checkbox" ${q.cleaning.declutter ? "checked" : ""} onchange="PL.set('cleaning.declutter', this.checked, true)">
          <span><b>Add decluttering</b> <em>priced separately after photo review</em></span></label>
        ${q.cleaning.declutter ? `<div class="pl-indent pl-hint">Upload photos of the rooms that need decluttering below — our team prices it during the walkthrough review.</div>` : ""}
      </section>`;
    // Painting
    if(svc.includes("painting")){
      const full = q.painting.level === "full";
      html += `
        <section class="pl-card">
          <div class="pl-card-h"><h3>Painting</h3><p>Standard 2 coats, premium paint and full prep (patching, sanding, priming). Flat ceilings — vaulted or 10 ft+ ceilings are extra and quoted at the walkthrough.</p></div>
          <div class="pl-levels">
            <button type="button" class="pl-level ${!full ? "on" : ""}" onclick="PL.set('painting.level','walls',true)">
              <b>Walls</b><span>Walls, baseboards &amp; trims</span></button>
            <button type="button" class="pl-level ${full ? "on" : ""}" onclick="PL.set('painting.level','full',true)">
              <b>Full interior</b><span>Walls, baseboards &amp; trims, plus doors and ceilings</span></button>
          </div>
          <div class="pl-f2">
            <div class="pl-field"><label>Painting area (sqft)</label>
              <input type="number" min="0" inputmode="numeric" value="${plEsc(q.painting.sqft)}" placeholder="${ps ? ps + " (whole property)" : "e.g. 1600"}" oninput="PL.set('painting.sqft', this.value)">
              <div class="pl-hint" id="plTrimHint">${this.trimHint()}</div></div>
            ${full ? `<div class="pl-field"><label>Interior doors to paint <span class="pl-req">required</span></label>
              <input type="number" min="0" inputmode="numeric" value="${plEsc(q.painting.doorCount)}" placeholder="e.g. 10" oninput="PL.set('painting.doorCount', this.value)">
              <div class="pl-hint">Both sides, hardware removed &amp; reinstalled. Count closet doors too.</div></div>` : ""}
          </div>
          ${full ? `<label class="pl-check"><input type="checkbox" ${q.painting.ceilings !== false ? "checked" : ""} onchange="PL.set('painting.ceilings', this.checked, true)">
            <span><b>Include ceilings</b> <em>flat ceilings, same area as the walls — untick to leave ceilings out</em></span></label>` : ""}
        </section>`;
    }
    // Flooring
    if(svc.includes("flooring")){
      html += `
        <section class="pl-card">
          <div class="pl-card-h"><h3>Flooring</h3><p>Full service: removal &amp; disposal of the existing flooring, supply &amp; install of the new floor, and new baseboards supplied &amp; installed.</p></div>
          <div class="pl-floors">
            ${Object.keys(FLOORING_LABELS).map(k => `
              <button type="button" class="pl-floor ${q.flooring.type === k ? "on" : ""}" onclick="PL.set('flooring.type','${k}',true)">
                <b>${FLOORING_LABELS[k]}</b><span>${PL_FLOOR_INFO[k] || ""}</span></button>`).join("")}
          </div>
          <div class="pl-f2">
            <div class="pl-field"><label>Flooring area (sqft)</label>
              <input type="number" min="0" inputmode="numeric" value="${plEsc(q.flooring.sqft)}" placeholder="${ps ? ps + " (whole property)" : "e.g. 1200"}" oninput="PL.set('flooring.sqft', this.value)">
              <div class="pl-hint">Leave out tiled areas you're keeping (e.g. bathrooms).</div></div>
          </div>
        </section>`;
    }
    html += this.renderPhotos();
    return html;
  },

  renderPhotos(){
    const q = this.cur;
    return `
      <section class="pl-card">
        <div class="pl-card-h"><h3>Property photos <span class="pl-opt">optional</span></h3><p>Photos help our team review the scope before the walkthrough — and are required to price decluttering.</p></div>
        <div class="pl-photos">
          ${q.photos.map((p, i) => `<div class="pl-photo"><a href="${plEsc(p.url)}" target="_blank" rel="noopener"><img src="${plEsc(p.url)}" alt="Property photo ${i + 1}" loading="lazy"></a>${!this.locked() ? `<button type="button" title="Remove photo" onclick="PL.removePhoto(${i})"><i class="ti ti-x" aria-hidden="true"></i></button>` : ""}</div>`).join("")}
          ${!this.locked() ? `<label class="pl-photo-add"><input type="file" accept="image/*" multiple onchange="PL.addPhotos(this.files); this.value='';"><i class="ti ti-camera-plus" aria-hidden="true"></i><span>Add photos</span></label>` : ""}
        </div>
        <div class="pl-hint" id="plPhotoMsg"></div>
      </section>`;
  },
  async addPhotos(files){
    if(!files || !files.length || this.locked()) return;
    const msg = document.getElementById("plPhotoMsg");
    const list = [...files].slice(0, 20);
    let ok = 0;
    for(let i = 0; i < list.length; i++){
      if(msg) msg.textContent = `Uploading ${i + 1} of ${list.length}…`;
      try {
        const url = await plUploadPhoto(this.cur, list[i]);
        this.cur.photos.push({ url, name: list[i].name, at: new Date().toISOString(), by: currentUser ? currentUser.email : "" });
        ok++;
      } catch(e){
        if(msg) msg.textContent = e.message || "Upload failed";
        break;
      }
    }
    if(ok){ this.changed(true); this.scheduleSave(true); }
  },
  removePhoto(i){ if(this.locked()) return; this.cur.photos.splice(i, 1); this.changed(true); },

  /* ---- step 4 (pkg 4): kitchen & bath — hosts the estimator's own cards ---- */
  stepKB(){
    return `
      <section class="pl-card">
        <div class="pl-card-h"><h3>Kitchen &amp; bathroom renovation</h3><p>The same kitchen and bathroom setup used in our estimator. Switch each one on or off, then fill in the details — the quote updates as you go.</p></div>
        ${this.locked() ? this.renderKBReadOnly() : `<div id="plKBHost" class="pl-kb-host"></div>`}
      </section>`;
  },
  renderKBReadOnly(){
    const secs = plScopeSections(this.cur).filter(s => s.cat === "kitchen" || s.cat === "bathroom");
    if(!secs.length) return `<div class="pl-hint">No kitchen or bathroom work in this quote.</div>`;
    return secs.map(s => `<div class="pl-ro-sec"><div class="pl-ro-t">${plEsc(s.title)}</div><ul>${s.bullets.map(b => `<li>${b}</li>`).join("")}</ul></div>`).join("");
  },
  host(){
    if(this._hosting || this.locked()) return;
    const hostEl = document.getElementById("plKBHost");
    if(!hostEl) return;
    const st = plBuildEstState(this.cur);
    // Package 4 always offers both cards; respect the saved on/off flags.
    st.enabled.kitchen  = !!this.cur.kb.enabled.kitchen;
    st.enabled.bathroom = !!this.cur.kb.enabled.bathroom;
    this._stash = state;
    state = st;
    this._hosting = true;
    const cats = document.getElementById("categories");
    if(cats) cats.innerHTML = "";
    hostEl.innerHTML = "";
    ["kitchen","bathroom"].forEach(cat => hostEl.appendChild(buildCategoryCard(cat)));
    try { renderTotals(); } catch(e){ console.warn("[PL] renderTotals while hosting:", e); }
  },
  syncFromHost(){
    if(!this._hosting || !this.cur) return;
    this.cur.kb = {
      enabled: { kitchen: !!state.enabled.kitchen, bathroom: !!state.enabled.bathroom },
      kitchen: plClone(state.kitchen),
      bathroom: plClone(state.bathroom)
    };
  },
  onHostedChange(){
    if(!this._hosting) return;
    this.syncFromHost();
    this.cur.quote = plComputeQuote(this.cur);
    this.cur.updated_at = new Date().toISOString();
    this.refreshLive();
    this.scheduleSave();
  },
  release(){
    if(!this._hosting) return;
    this.syncFromHost();
    const hostEl = document.getElementById("plKBHost");
    if(hostEl) hostEl.innerHTML = "";
    state = this._stash || freshState();
    this._stash = null;
    this._hosting = false;
    try { renderAll(); } catch(e){ console.warn("[PL] renderAll after release:", e); }
    if(this.cur) this.cur.quote = plComputeQuote(this.cur);
  },

  /* ---- step 5: readiness ---- */
  renderScoreInner(){
    const rd = plReadiness(this.cur);
    const pct = rd.score;
    return `
      <div class="pl-score-top"><span>Project readiness score</span><b>${rd.answered ? rd.score + "/100" : "—"}</b></div>
      <div class="pl-meter"><div style="width:${rd.answered ? pct : 0}%"></div></div>
      <div class="pl-score-sub">${rd.answered < rd.total ? `${rd.total - rd.answered} question${rd.total - rd.answered === 1 ? "" : "s"} left` : (isAdmin() ? `Lead heat: <b class="pl-heat ${rd.heat.toLowerCase()}">${rd.heat}</b>` : "All set — thanks!")}</div>`;
  },
  stepReadiness(){
    const q = this.cur;
    return `
      <section class="pl-card">
        <div class="pl-card-h"><h3>Project readiness</h3><p>A few quick questions so we can plan the right start date and crew.</p></div>
        <div class="pl-score" id="plScoreCard">${this.renderScoreInner()}</div>
        ${PL_READINESS.map(qq => `
          <div class="pl-q">
            <div class="pl-q-t">${qq.label}</div>
            <div class="pl-pills">${qq.opts.map(o => `<button type="button" class="${q.readiness[qq.key] === o[0] ? "on" : ""}" onclick="PL.set('readiness.${qq.key}','${o[0]}',true)">${o[1]}</button>`).join("")}</div>
          </div>`).join("")}
        <div class="pl-field"><label>Notes for Reno to Sold <span class="pl-opt">optional</span></label>
          <textarea rows="3" placeholder="Access details, timing, anything we should know…" oninput="PL.set('notes', this.value)">${plEsc(q.notes)}</textarea></div>
      </section>`;
  },

  /* ---- step 6: quote ---- */
  stepQuote(){
    const q = this.cur;
    const pk = plPackage(q.packageId);
    const qt = q.quote = plComputeQuote(q);
    if(!pk || !qt) return `<section class="pl-card"><div class="pl-hint">Choose a package to see the quote.</div></section>`;
    const secs = plScopeSections(q);
    const rd = plReadiness(q);
    const admin = isAdmin();
    const linkedEst = q.estimateId && loadSavedList().find(x => x.id === q.estimateId);
    const canSubmit = q.status === "draft";
    return `
      <section class="pl-card pl-quote">
        <div class="pl-q-eyebrow">Package ${pk.id} · ${plEsc(pk.name)}</div>
        <div class="pl-q-addr">${plEsc(q.propAddress)} · ${plEsc(plPropLine(q))}</div>
        <div class="pl-q-range">${plMoneyRange(qt.range)}</div>
        <div class="pl-q-guarantee"><i class="ti ti-shield-check" aria-hidden="true"></i> Plus HST. The exact amount is provided at the walkthrough and is <b>guaranteed to be within this range</b>.</div>
        <div class="pl-q-lines">
          ${qt.lines.map(l => `<div><span>${plEsc(l.label)}</span><b>${plMoneyRange(l.range)}</b></div>`).join("")}
          ${(qt.tbd || []).map(t => `<div class="tbd"><span>${plEsc(t)}</span><b>TBD</b></div>`).join("")}
        </div>
        <details class="pl-incl" open><summary>Scope of work</summary>
          ${secs.map(s => `<div class="pl-ro-sec"><div class="pl-ro-t">${plEsc(s.title)}</div><ul>${s.bullets.map(b => `<li>${b}</li>`).join("")}</ul>${s.cat === "cleaning" ? `<div class="pl-ro-more">${cleaningScopeHtml(true)}</div>` : ""}</div>`).join("")}
        </details>
        <div class="pl-actions">
          ${canSubmit ? `<button type="button" class="primary pl-big" onclick="PL.submitWalkthrough()"><i class="ti ti-calendar-check" aria-hidden="true"></i> Submit &amp; schedule walkthrough</button>` : ""}
          <button type="button" onclick="PL.openSendSeller()"><i class="ti ti-send" aria-hidden="true"></i> Send to seller</button>
          <button type="button" onclick="PL.generateEstimate()"><i class="ti ti-file-invoice" aria-hidden="true"></i> ${linkedEst ? "Open linked estimate" : "Generate estimate"}</button>
          <button type="button" onclick="PL.printQuote()"><i class="ti ti-printer" aria-hidden="true"></i> Print / PDF</button>
          ${q.status === "draft" ? `<button type="button" onclick="PL.save(false)"><i class="ti ti-device-floppy" aria-hidden="true"></i> Save draft</button>` : ""}
        </div>
        ${canSubmit ? `<div class="pl-hint" style="margin-top:10px;">Submitting sends this quote to Reno to Sold. We'll confirm a walkthrough time with you — typically within one business day.</div>` : ""}
      </section>
      ${admin ? this.renderAdminPanel(rd) : ""}
      ${this.renderAppliances()}
      ${q.history && q.history.length ? `
        <section class="pl-card pl-card-quiet">
          <div class="pl-card-h"><h3>Activity</h3></div>
          <div class="pl-hist">${q.history.slice().reverse().map(h => `<div><span>${new Date(h.at).toLocaleString("en-CA", { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" })}</span>${plEsc(h.action)}${h.by ? ` <em>— ${plEsc(h.by)}</em>` : ""}${h.note ? `<div class="pl-hist-note">${plEsc(h.note)}</div>` : ""}</div>`).join("")}</div>
        </section>` : ""}`;
  },

  renderAdminPanel(rd){
    const q = this.cur;
    const w = q.walkthrough || {};
    return `
      <section class="pl-card pl-admin">
        <div class="pl-card-h"><h3><i class="ti ti-lock" aria-hidden="true"></i> Admin</h3><p>Only admins see this panel.</p></div>
        <div class="pl-admin-grid">
          <div><span>Agent</span><b>${plEsc(q.owner_name || q.owner_email || "—")}</b>${q.owner_email ? `<div class="pl-hint">${plEsc(q.owner_email)}${q.owner_phone ? " · " + plEsc(q.owner_phone) : ""}</div>` : ""}</div>
          <div><span>Readiness</span><b class="pl-heat ${rd.heat.toLowerCase()}">${rd.answered ? rd.score + "/100 · " + rd.heat : "Not answered"}</b></div>
          <div><span>Status</span><b>${(PL_STATUS[q.status] || PL_STATUS.draft).label}</b></div>
        </div>
        ${q.notes ? `<div class="pl-admin-notes"><span>Agent notes</span>${plEsc(q.notes)}</div>` : ""}
        ${q.photos && q.photos.length ? `<div class="pl-admin-notes"><span>Photos (${q.photos.length})</span><div class="pl-photos" style="margin-top:6px;">${q.photos.map((ph, i) => `<div class="pl-photo"><a href="${plEsc(ph.url)}" target="_blank" rel="noopener"><img src="${plEsc(ph.url)}" alt="Property photo ${i + 1}" loading="lazy"></a></div>`).join("")}</div></div>` : (q.cleaning && q.cleaning.declutter ? `<div class="pl-admin-notes"><span>Photos</span>Decluttering requested but no photos uploaded yet.</div>` : "")}
        ${Array.isArray(q.walkthroughPrefs) && q.walkthroughPrefs.length ? `
        <div class="pl-admin-notes"><span>Agent's preferred times — pick one to confirm</span>
          <div class="pl-prefs">${q.walkthroughPrefs.map((p, i) => `<button type="button" class="pl-pref ${w.date === p.date && w.window === p.window ? "on" : ""}" onclick="PL.confirmPref(${i})"><b>${plNiceDay(p.date, true)}</b><span>${p.window}</span><em>${w.date === p.date && w.window === p.window ? "Confirmed" : "Confirm &amp; notify agent"}</em></button>`).join("")}</div>
        </div>` : ""}
        <div class="pl-sub-h" style="margin-top:14px;">${Array.isArray(q.walkthroughPrefs) && q.walkthroughPrefs.length ? "Or set a different date" : "Walkthrough date"}</div>
        <div class="pl-f2">
          <div class="pl-field"><label>Walkthrough date</label><input type="date" id="plWtDate" value="${plEsc(w.date || "")}"></div>
          <div class="pl-field"><label>Note to agent <span class="pl-opt">optional</span></label><input type="text" id="plWtNote" value="${plEsc(w.note || "")}" placeholder="e.g. 10am, use lockbox"></div>
        </div>
        <div class="pl-actions">
          <button type="button" class="primary" onclick="PL.scheduleWalkthrough()"><i class="ti ti-calendar-event" aria-hidden="true"></i> ${w.date ? "Update walkthrough" : "Schedule walkthrough"} &amp; notify agent</button>
          ${q.status !== "closed" ? `<button type="button" onclick="PL.setStatus('closed')">Close quote</button>` : ""}
          ${q.status !== "draft" ? `<button type="button" onclick="PL.setStatus('draft')">Reopen for agent edits</button>` : ""}
          <button type="button" class="pl-danger" onclick="PL.deleteQuote()">Delete</button>
        </div>
      </section>`;
  },

  renderAppliances(){
    const q = this.cur;
    const a = q.appliances;
    const last = a.requests && a.requests.length ? a.requests[a.requests.length - 1] : null;
    return `
      <section class="pl-card pl-appl">
        <div class="pl-card-h"><h3><i class="ti ti-fridge" aria-hidden="true"></i> Appliance refresh</h3>
          <p>New appliances make kitchens photograph better. Pick a level and the appliances you need — a Canadian Appliance Source rep will contact you with models and pricing through the Reno to Sold referral program.</p></div>
        <div class="pl-tiers">
          ${PL_APPLIANCE_TIERS.map(t => `<button type="button" class="pl-tier ${a.tier === t.k ? "on" : ""}" onclick="PL.setAppl('tier','${t.k}')"><b>${t.t}</b><span>${t.d}</span></button>`).join("")}
        </div>
        <div class="pl-pills pl-appl-items">${PL_APPLIANCE_ITEMS.map(([k, l]) => `<button type="button" class="${a.items[k] ? "on" : ""}" onclick="PL.toggleApplItem('${k}')">${l}</button>`).join("")}</div>
        <div class="pl-field"><label>Notes for the rep <span class="pl-opt">optional</span></label>
          <input type="text" value="${plEsc(a.notes)}" placeholder="Finish (stainless / black), sizes, delivery timing…" oninput="PL.setAppl('notes', this.value, true)"></div>
        <div class="pl-actions">
          <button type="button" class="primary" onclick="PL.requestAppliances()"><i class="ti ti-send" aria-hidden="true"></i> ${last ? "Send another request" : "Request appliance quote"}</button>
          ${last ? `<span class="pl-hint">Last request sent ${new Date(last.at).toLocaleDateString("en-CA", { month:"short", day:"numeric" })}${last.to ? " to " + plEsc(last.to) : ""}</span>` : ""}
        </div>
      </section>`;
  },
  setAppl(k, v, quiet){
    if(!this.cur) return;               // appliance requests allowed even after submission
    this.cur.appliances[k] = v;
    this.cur.updated_at = new Date().toISOString();
    if(!quiet) this.renderStepOnly();
    this.scheduleSave();
  },
  toggleApplItem(k){ this.cur.appliances.items[k] = !this.cur.appliances.items[k]; this.renderStepOnly(); this.scheduleSave(); },

  /* ---- actions ---- */
  _log(action, note){
    this.cur.history = this.cur.history || [];
    this.cur.history.push({ at: new Date().toISOString(), by: (currentProfile && currentProfile.full_name) || (currentUser && currentUser.email) || "", action, note: note || "" });
  },
  async submitWalkthrough(){
    const q = this.cur;
    const err = this.validateUpTo("quote");
    if(err){ brandedAlert(err); return; }
    const rd = plReadiness(q);
    if(rd.answered < rd.total){
      if(!(await brandedConfirm(`You've answered ${rd.answered} of ${rd.total} readiness questions. Submit anyway?`, { title:"Submit for walkthrough", confirmLabel:"Submit", destructive:false }))){ this.go("readiness"); return; }
    }
    const prefs = await plPickTimes("Pick 3 walkthrough times", "Choose three different days that work for you and your seller. Reno to Sold will confirm one of them.");
    if(!prefs) return;
    this.release();
    q.quote = plComputeQuote(q);
    q.walkthroughPrefs = prefs;
    q.status = "walkthrough_requested";
    q.submission = {
      submitted_at: new Date().toISOString(),
      by_name: (currentProfile && currentProfile.full_name) || "",
      by_email: currentUser ? currentUser.email : "",
      by_phone: (currentProfile && currentProfile.phone) || "",
      brokerage: (currentProfile && currentProfile.brokerage) || "",
      quote_at_submission: plClone(q.quote)
    };
    this._log("Submitted for walkthrough", "Preferred: " + prefs.map(p => plNiceDay(p.date) + " " + p.window).join(" · "));
    await this.save(true);
    this.render();
    flash("Submitted — Reno to Sold will confirm your walkthrough");
    // Notify Reno to Sold (fire-and-forget)
    try {
      const pk = plPackage(q.packageId);
      const who = q.submission.by_name || q.submission.by_email;
      const intro = `New pre-listing walkthrough request from ${who}${q.submission.brokerage ? " (" + q.submission.brokerage + ")" : ""}.\n\n` +
        `Property: ${q.propAddress}\n${plPropLine(q)}\nPreferred walkthrough times:\n${prefs.map((p, i) => "  " + (i+1) + ". " + plNiceDay(p.date, true) + ", " + p.window).join("\n")}\nReadiness score: ${rd.score}/100 (${rd.heat})${q.targetListDate ? "\nTarget listing date: " + q.targetListDate : ""}${q.photos.length ? "\nPhotos attached to the quote: " + q.photos.length : ""}${q.notes ? "\n\nAgent notes: " + q.notes : ""}\n\nOpen the Pre-Listing Packages tool to schedule the walkthrough.`;
      await plSendEmail({
        to: [COMPANY_INFO.email || "renotosold@gmail.com"], cc: [],
        subject: `Walkthrough request — ${q.propAddress} — Package ${pk.id}`,
        body: intro + "\n\n" + plPlainQuote(q),
        bodyHtml: plEmailHtml(intro, q, { internal:true })
      });
    } catch(e){ console.warn("[PL] submit notification failed:", e && e.message); }
  },
  confirmPref(i){
    const p = (this.cur.walkthroughPrefs || [])[i];
    if(p) this.scheduleWalkthrough(p);
  },
  async scheduleWalkthrough(pref){
    if(!isAdmin()) return;
    const q = this.cur;
    const date = pref ? pref.date : ((document.getElementById("plWtDate") || {}).value || "");
    const win  = pref ? pref.window : "";
    const note = (document.getElementById("plWtNote") || {}).value || "";
    if(!date){ brandedAlert("Pick a walkthrough date first."); return; }
    q.walkthrough = { date, window: win, note, by: currentUser ? currentUser.email : "", at: new Date().toISOString() };
    if(q.status === "draft" || q.status === "walkthrough_requested") q.status = "walkthrough_scheduled";
    this._log("Walkthrough scheduled for " + plNiceDay(date) + (win ? ", " + win : ""), note);
    await this.save(true);
    this.render();
    flash("Walkthrough saved");
    if(q.owner_email){
      try {
        const nice = new Date(date + "T12:00").toLocaleDateString("en-CA", { weekday:"long", month:"long", day:"numeric" });
        const body = `Hi ${(q.owner_name || "").split(/\s+/)[0] || "there"},\n\nYour pre-listing walkthrough for ${q.propAddress} is confirmed for ${nice}${win ? ", " + win : ""}.${note ? "\n\n" + note : ""}\n\nWe'll confirm the exact amount at the walkthrough — guaranteed to be within your quoted range.\n\nReno to Sold`;
        await plSendEmail({ to:[q.owner_email], cc:[], subject:`Walkthrough scheduled — ${q.propAddress}`, body });
      } catch(e){ console.warn("[PL] agent notification failed:", e && e.message); }
    }
  },
  async setStatus(s){
    if(!isAdmin()) return;
    this.cur.status = s;
    this._log(s === "draft" ? "Reopened for agent edits" : "Status → " + (PL_STATUS[s] || {}).label);
    await this.save(true);
    this.render();
  },
  async deleteQuote(){
    const q = this.cur;
    if(!(await brandedConfirm("Delete this package quote? This can't be undone.", { title:"Delete package quote", confirmLabel:"Delete" }))) return;
    plRemoveLocal(q.id);
    try { await plCloudDelete(q.id); } catch(e){ console.warn("[PL] delete failed:", e && e.message); }
    this.list = this.list.filter(x => x.id !== q.id);
    this.showList();
  },

  openSendSeller(){
    const q = this.cur;
    const emails = q.sellers.map(s => (s.email || "").trim()).filter(Boolean).join(", ");
    const first = ((q.sellers[0] && q.sellers[0].name) || "").split(/\s+/)[0];
    const agent = (currentProfile && currentProfile.full_name) || "";
    const pk = plPackage(q.packageId);
    const msg = `Hi${first ? " " + first : ""},\n\nHere is the pre-listing package I recommend for ${q.propAddress || "your home"}. It's designed to get the property market-ready quickly and help it sell for more.\n\nThe price range below is guaranteed — the exact amount is confirmed at a short walkthrough.\n\nLet me know if you'd like to go ahead and I'll book the walkthrough.\n\n${agent}`;
    const ov = document.createElement("div");
    ov.className = "pl-modal-bg";
    ov.id = "plSendModal";
    ov.innerHTML = `
      <div class="pl-modal" role="dialog" aria-label="Send quote to seller">
        <div class="pl-modal-h"><b>Send quote to seller</b><button type="button" onclick="PL.closeModal()" aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button></div>
        <div class="pl-modal-b">
          <div class="pl-field"><label>To</label><input type="text" id="plSendTo" value="${plEsc(emails)}" placeholder="seller@email.com, second@email.com"></div>
          <div class="pl-field"><label>Subject</label><input type="text" id="plSendSubj" value="${plEsc("Your pre-listing package — " + (q.propAddress || (pk ? pk.name : "")))}"></div>
          <div class="pl-field"><label>Message</label><textarea id="plSendMsg" rows="8">${plEsc(msg)}</textarea></div>
          <label class="pl-check"><input type="checkbox" id="plSendCc" checked><span>Send me a copy</span></label>
          <div class="pl-hint">The quote, price range and scope of work are added below your message automatically.</div>
        </div>
        <div class="pl-modal-f"><button type="button" onclick="PL.closeModal()">Cancel</button><button type="button" class="primary" id="plSendBtn" onclick="PL.sendSeller()">Send</button></div>
      </div>`;
    ov.addEventListener("click", e => { if(e.target === ov) PL.closeModal(); });
    document.body.appendChild(ov);
  },
  closeModal(){ const m = document.getElementById("plSendModal"); if(m) m.remove(); },
  async sendSeller(){
    const q = this.cur;
    const to = ((document.getElementById("plSendTo") || {}).value || "").split(/[,;\s]+/).map(s => s.trim()).filter(s => /.+@.+\..+/.test(s));
    if(!to.length){ brandedAlert("Add at least one valid email address."); return; }
    const subject = (document.getElementById("plSendSubj") || {}).value || "Your pre-listing package";
    const body = (document.getElementById("plSendMsg") || {}).value || "";
    const cc = (document.getElementById("plSendCc") || {}).checked && currentUser && currentUser.email ? [currentUser.email] : [];
    const btn = document.getElementById("plSendBtn");
    if(btn){ btn.disabled = true; btn.textContent = "Sending…"; }
    try {
      this.release();
      q.quote = plComputeQuote(q);
      await plSendEmail({ to, cc, subject, body: body + "\n\n" + plPlainQuote(q), bodyHtml: plEmailHtml(body, q) });
      this._log("Sent to seller", to.join(", "));
      await this.save(true);
      this.closeModal();
      this.render();
      flash("Quote sent to " + to.join(", "));
    } catch(e){
      if(btn){ btn.disabled = false; btn.textContent = "Send"; }
      brandedAlert("Couldn't send the email: " + (e && e.message ? e.message : e));
    }
  },

  async requestAppliances(){
    const q = this.cur, a = q.appliances;
    const items = PL_APPLIANCE_ITEMS.filter(([k]) => a.items[k]).map(([, l]) => l);
    if(!a.tier){ brandedAlert("Pick Good, Better or Best first."); return; }
    if(!items.length){ brandedAlert("Select at least one appliance."); return; }
    if(!(q.propAddress || "").trim()){ brandedAlert("Add the property address first (Property step)."); return; }
    const cfg = plSettings();
    const rts = cfg.ccEmail || COMPANY_INFO.email || "renotosold@gmail.com";
    const to = (cfg.casEmail || "").trim() ? [cfg.casEmail.trim()] : [rts];
    const cc = [];
    if(to[0] !== rts) cc.push(rts);
    if(currentUser && currentUser.email && !cc.includes(currentUser.email) && !to.includes(currentUser.email)) cc.push(currentUser.email);
    const tier = PL_APPLIANCE_TIERS.find(t => t.k === a.tier);
    const agent = (currentProfile && currentProfile.full_name) || (currentUser && currentUser.email) || "";
    const body = `Hi${cfg.casName ? " " + cfg.casName.split(/\s+/)[0] : ""},\n\n` +
      `A new appliance request through the Reno to Sold referral program:\n\n` +
      `Property: ${q.propAddress}\nAgent: ${agent}${currentProfile && currentProfile.phone ? " · " + currentProfile.phone : ""}${currentUser ? " · " + currentUser.email : ""}${currentProfile && currentProfile.brokerage ? "\nBrokerage: " + currentProfile.brokerage : ""}\n` +
      `Level: ${tier ? tier.t + " — " + tier.d : a.tier}\nAppliances: ${items.join(", ")}${a.notes ? "\nNotes: " + a.notes : ""}${q.targetListDate ? "\nTarget listing date: " + q.targetListDate : ""}\n\n` +
      `Please contact the agent with model options and pricing.\n\nThank you,\nReno to Sold`;
    try {
      await plSendEmail({ to, cc, subject: `Appliance request — ${q.propAddress} (Reno to Sold referral)`, body, bodyHtml: buildClientEstimateEmailHtml(body) });
      a.requests.push({ at: new Date().toISOString(), to: to[0], tier: a.tier, items });
      this._log("Appliance quote requested", `${tier ? tier.t : ""}: ${items.join(", ")}`);
      await this.save(true);
      this.renderStepOnly();
      flash("Appliance request sent");
    } catch(e){
      brandedAlert("Couldn't send the appliance request: " + (e && e.message ? e.message : e));
    }
  },

  async generateEstimate(){
    const q = this.cur;
    this.release();
    const existing = q.estimateId && loadSavedList().find(x => x.id === q.estimateId);
    if(existing){
      loadEstimate(q.estimateId);
      navigateTo("estimator");
      return;
    }
    const err = this.validateUpTo("quote");
    if(err){ brandedAlert(err); return; }
    // Protect unsaved work in the estimator
    const hasWork = !state._id && Object.keys(state.enabled || {}).some(k => state.enabled[k]);
    if(hasWork && !(await brandedConfirm("The estimator has an unsaved estimate open. Generating will replace it on screen. Continue?", { title:"Generate estimate", confirmLabel:"Continue", destructive:false }))) return;
    const st = plBuildEstState(q);
    state = st;
    saveEstimate({ silent:true });
    q.estimateId = state._id;
    if(isAdmin() && q.status !== "draft") q.status = "estimate_created";
    this._log("Estimate generated");
    await this.save(true);
    renderAll();
    navigateTo("estimator");
    flash("Estimate created from the package — review it and continue as usual");
  },

  printQuote(){
    const q = this.cur;
    this.release();
    q.quote = plComputeQuote(q);
    const w = window.open("", "_blank");
    if(!w){ brandedAlert("Allow pop-ups to print the quote."); return; }
    const agent = currentProfile ? `${plEsc(currentProfile.full_name || "")}${currentProfile.brokerage ? " · " + plEsc(currentProfile.brokerage) : ""}${currentProfile.phone ? " · " + plEsc(currentProfile.phone) : ""}` : "";
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Pre-Listing Package — ${plEsc(q.propAddress)}</title>
      <style>body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:720px;margin:32px auto;padding:0 20px;color:#111}
      .hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #d4af6a;padding-bottom:12px;margin-bottom:18px}
      .hd b{font-size:20px;letter-spacing:.04em}.hd span{font-size:12px;color:#666}
      @media print{body{margin:0}}</style></head><body>
      <div class="hd"><div><div style="font-size:11px;letter-spacing:.2em;color:#a8853f;font-weight:700;text-transform:uppercase">Reno to Sold</div><b>Pre-Listing Package Quote</b></div><span>${new Date().toLocaleDateString("en-CA", { year:"numeric", month:"long", day:"numeric" })}${agent ? "<br>" + agent : ""}</span></div>
      ${plQuoteTableHtml(q)}
      <p style="font-size:11px;color:#777;line-height:1.5">Prepared by Reno to Sold Inc. · ${plEsc(COMPANY_INFO.phone)} · ${plEsc(COMPANY_INFO.email)}. Quote based on the information provided; vaulted or 10 ft+ ceilings, carpet cleaning and decluttering are confirmed at the walkthrough.</p>
      <script>setTimeout(function(){window.print()},300)<\/script></body></html>`);
    w.document.close();
  },

  /* ---- admin settings ---- */
  showSettings(){ if(!isAdmin()) return; this.release(); this.mode = "settings"; this.render(); },
  renderSettings(){
    const c = plSettings();
    const cr = (k) => cleaningRateOf(k);
    return `
      <section class="pl-card">
        <div class="pl-card-h"><h3>Package settings</h3><p>Admin only. Changes apply to every user straight away.</p></div>
        <div class="pl-f2">
          <div class="pl-field"><label>Guaranteed range width (%)</label>
            <input type="number" min="0" max="100" step="1" value="${plEsc(c.rangePct)}" onchange="PL.saveSetting('rangePct', this.value, true)">
            <div class="pl-hint">Quotes show the calculated price up to +this %. At 15%, a $10,000 calculation shows $10,000 – $11,500.</div></div>
        </div>
        <div class="pl-sub-h">Canadian Appliance Source rep</div>
        <div class="pl-f3">
          <div class="pl-field"><label>Rep name</label><input type="text" value="${plEsc(c.casName)}" onchange="PL.saveSetting('casName', this.value)" placeholder="First Last"></div>
          <div class="pl-field"><label>Rep email</label><input type="email" value="${plEsc(c.casEmail)}" onchange="PL.saveSetting('casEmail', this.value)" placeholder="rep@canadianappliance.ca"></div>
          <div class="pl-field"><label>CC on every request</label><input type="email" value="${plEsc(c.ccEmail)}" onchange="PL.saveSetting('ccEmail', this.value)"></div>
        </div>
        <div class="pl-hint">${(c.casEmail || "").trim() ? "Appliance requests go to the rep, with the CC address and the agent copied." : "<b>No rep email yet</b> — appliance requests go to the CC address until you add one."}</div>
      </section>
      <section class="pl-card">
        <div class="pl-card-h"><h3>Service rates</h3><p>Package prices are calculated from your estimator unit prices, so the quote and the formal estimate always match. Edit them in <b>Pricing</b>.</p></div>
        <div class="pl-rates">
          <div><span>Deep cleaning</span><b>$${cr("deep").toFixed(2)}/sqft</b></div>
          <div><span>Carpet cleaning</span><b>${cr("carpet") > 0 ? "$" + cr("carpet").toFixed(2) + "/sqft" : "At walkthrough"}</b></div>
          <div><span>Decluttering</span><b>${cr("declutter") > 0 ? "$" + cr("declutter").toFixed(2) + "/sqft" : "After photo review"}</b></div>
          <div><span>Painting — walls incl. trims</span><b>$${(prices.painting.walls.one.labour + prices.painting.walls.one.material).toFixed(2)}/sqft</b></div>
          <div><span>Painting — flat ceilings</span><b>$${(prices.painting.ceiling.flat.labour + prices.painting.ceiling.flat.material).toFixed(2)}/sqft</b></div>
          <div><span>Painting — doors</span><b>$${(prices.painting.door.labour + prices.painting.door.material).toFixed(0)}/door</b></div>
        </div>
        <button type="button" onclick="openSettings()" style="margin-top:12px;"><i class="ti ti-tag" aria-hidden="true"></i> Open Pricing</button>
      </section>`;
  },
  saveSetting(k, v, numeric){
    if(!isAdmin()) return;
    if(!prices.packages) prices.packages = plClone(PL_DEFAULT_SETTINGS);
    if(numeric){ const n = parseFloat(v); if(!isFinite(n) || n < 0) return; prices.packages[k] = n; }
    else prices.packages[k] = String(v || "").trim();
    savePrices();
    flash("Package settings saved");
    this.render();
  }
};

/* ---------- Boot ---------- */
// If the page was opened directly on #/packages, the router may have run
// before this file finished loading — open the tool now.
try {
  if(typeof getCurrentRoute === "function" && getCurrentRoute() === "packages" && typeof currentProfile !== "undefined" && currentProfile) PL.open();
} catch(e){ console.error("[PL] boot:", e); }
