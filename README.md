# Coordinate and distance tool

Static, offline-capable web calculators for coordinates, directions and distances (MGRS, piiru 6000 and mil 6400), hosted on Azure Static Web Apps (Free plan). Companion to the *Observers toolbox* iPhone app.

**Status:** first version — 11 calculators, fi/sv/en, offline after the first visit.

```bash
cd web
npm install
npm run dev      # local development
npm test         # unit tests and shared acceptance vectors
npm run build    # type-check and build to web/dist
npm run check    # size, no external URLs, no inline script, no forbidden APIs
```

Pushing to `main` builds `web/` and deploys it with the Azure Static Web Apps workflow.

- Calculators only: no accounts, no tracking, no stored inputs, no network calls after load.
- UI languages: Finnish, Swedish, English.
- Training and aid tool; results are not authoritative and this is not fire-direction software.

Licence: not yet chosen.
