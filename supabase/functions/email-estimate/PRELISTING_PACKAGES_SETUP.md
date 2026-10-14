# Pre-Listing Packages — Setup & Deploy

The new **Pre-listing packages** tool (sidebar + dashboard card, route `#/packages`) lets agents price one of four pre-listing packages from the property's square footage, get a guaranteed price range (calculated price → +15%), send it to the seller, submit it to Reno to Sold to schedule a walkthrough, request appliances through Canadian Appliance Source, and turn it into a formal estimate.

## Deploy order (about 10 minutes)

Pre-Listing Packages lives in its own `packages/` folder:

| File | URL | What it is |
|---|---|---|
| `packages/prelisting.js` | renotosold.homes/#/packages (inside the portal) | **The full tool** — all of its code, styles and layout. Login, saved quotes, emails, walkthroughs, admin view, settings, kitchen & bath, Generate estimate. **To change the tool, edit only this file.** |
| `packages/index.html` | renotosold.homes/packages | **Public page**, standalone like `trim/` — no login, nothing saved. Instant price range + "Book a walkthrough". |
| `index.html` (repo top level) | renotosold.homes | Main app. Holds only small hooks for the tool (sidebar button, dashboard card, route, feature flag, and the line that loads `packages/prelisting.js`). |

**Testing changes safely:** upload your edited copy as `packages/prelisting-test.js`, then open `https://renotosold.homes/?pl=test#/packages`. Only that browser tab uses the test file. When it looks right, upload it again as `packages/prelisting.js` (replacing the old one) and delete the test file.

1. **Supabase → SQL Editor** — paste and run `supabase/migrations/prelisting_packages.sql`. Safe to re-run. It creates
   - the `package-photos` storage bucket (photo uploads in the portal), and
   - the `public_package_rates()` function so the public page always shows your current Pricing rates.
2. **GitHub → your reno-to-sold repo:**
   - **Main app:** at the repo top level, Add file → Upload files → drag the new `index.html` → commit to main.
   - **Packages folder:** Add file → Upload files → drag the whole `packages` folder from your computer (it contains `index.html` and `prelisting.js`) → commit to main. GitHub keeps the folder, next to `trim/`.
   - **Records:** go into `supabase/` (create `migrations/` if it isn't there by typing `supabase/migrations/` in front of the file name), upload `prelisting_packages.sql`, and upload this file to the top level.
3. Wait for the green check in the **Actions** tab, then open renotosold.homes/packages and renotosold.homes (hard refresh: Cmd + Shift + R).
4. **Pricing → change and save any rate once** (for example, carpet cleaning). That pushes the new Cleaning rates to the server so the public page picks them up. Until then the public page uses the built-in 2026 rates, which are the same values.

If you skip the photo/storage part of step 1, everything works except photo uploads ("Photo storage isn't set up yet").

## After deploy — admin checklist

- **Pricing → Cleaning & Decluttering**: deep clean $1.15/sqft, carpet cleaning $5.00/sqft (*flagged: the market range is about $0.15–$0.80/sqft — review*), decluttering $0 = "priced after photo review".
- **Pre-listing packages → Package settings**: range width (15%), Canadian Appliance Source rep name + email, CC address. Until a rep email is set, appliance requests go to the CC address (renotosold@gmail.com).
- Sign in as an agent and run through one quote end to end.

## How it works

| Package | Includes |
|---|---|
| 1 · Clean & Declutter | Deep cleaning (+ carpet cleaning extra, + decluttering priced after photo review) |
| 2 · Clean + Paint | Package 1 + painting. **Walls** (baseboards & trims included in the wall price) or **Full interior** (adds doors — agent enters the count — and flat ceilings, which can be opted out). Standard 2 coats. Vaulted / 10 ft+ ceilings quoted at walkthrough. |
| 3 · Clean + Paint + Floors | Package 2 + flooring (agent picks vinyl, laminate, engineered or solid hardwood). Removal & disposal and new baseboards included. |
| 4 · Full Pre-Listing Refresh | Package 3 + the estimator's own Kitchen and Bathrooms setup, shown inside the tool. |

- **One set of prices.** Package prices are calculated with the estimator's unit prices and formulas, so "Generate estimate" produces an estimate with exactly the same subtotal as the package quote. Change a price in Pricing and both update.
- **Range.** Low = calculated price (rounded down to $50); high = calculated × (1 + range %) (rounded up to $50). Shown before HST, with "exact amount provided at walkthrough — guaranteed to be within this range".
- **Readiness score (0–100).** Start timing (30), seller commitment (25), listing signed (12), vacancy (12), furniture (8), access (8), plus up to 5 for a listing date within 90 days. Hot ≥ 75, Warm 50–74, Cool < 50. Agents see the score; only admin sees Hot/Warm/Cool.
- **Statuses.** Draft → Walkthrough requested (agent submits; email to renotosold@gmail.com) → Walkthrough scheduled (admin picks a date; email to the agent) → Estimate created / Closed. Submitted quotes are locked for agents; admin can "Reopen for agent edits".
- **Estimator changes.** New **Cleaning & Decluttering** category (estimator, client estimate, contractor bid sheet, Internal Mode, client + contractor pricing editors). Painting gains a "baseboards & trim included in the wall price" flag, set automatically on estimates generated from packages.
- **Access.** Feature key `prelisting_packages`, ON for every role by default. Turn it off for a user in Manage Users → Edit.

## Code map

- `packages/prelisting.js` — the whole portal tool (`PL` controller, pricing `plBuildEstState` / `plComputeQuote`, readiness, storage, emails, styles, layout).
- index.html: `CLEANING_SCOPE`, `renderCleaningCatBody` — cleaning scope text and estimator card.
- index.html: empty `#view-packages` container, sidebar button `data-route="packages"`, loader script at the bottom of the file.
- Public page: `packages/index.html` (self-contained, `PP` object). Its fallback rates mirror `DEFAULT_PRICES`; live rates come from `public_package_rates()`.
