# Gym Loadout Planner

Beginner-friendly static scaffold for planning gym exercise load targets.

## What this includes

- Vanilla `HTML/CSS/JS` only (no framework, no build step)
- Loads data from:
  - `./data/gear.json`
  - `./data/program.json`
- Phase selector (`1-4`) and day selector (`1,2,4,5,6`)
- Exercise cards for selected phase/day
- Editable target load per exercise
- Override persistence in `localStorage` keyed by exercise id
- `Reset Overrides` button
- Placeholder in each card: `Loadout result (coming next step)`
- PWA basics:
  - `manifest.json`
  - `service-worker.js`
  - offline cache for app shell + data

## Run locally

From this folder:

```bash
python -m http.server 8000
```

Then open:

- `http://localhost:8000`

## Install on iPhone

1. Deploy to an HTTPS host (GitHub Pages is recommended).
2. Open the site in Safari on iPhone.
3. Tap Share, then `Add to Home Screen`.

## Important PWA note

- iPhone install from Safari requires HTTPS and a reachable URL from the phone.
- `localhost` install usually will not work on iPhone unless:
  - the phone can access your dev server over the network, and
  - the site is served over HTTPS.
