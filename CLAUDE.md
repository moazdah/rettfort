# Rettført

- `index.html`, `demo.html`, `personvern.html` m.fl. i roten er dagens offentlige rettført.no (statisk, Vercel-prosjekt `rettfort`).
- `system/` er det nye regnskapssystemet (Next.js, Vercel-prosjekt `rettfort-system`) på min.rettført.no, koblet til grenen `claude/great-maxwell-kwkajt`. Database: Supabase (POSTGRES_URL). «Logg inn»/«Start gratis» på forsiden sendes dit.
- Følg `docs/design/Claude Code - nye flyter.md`. Prototypene i `docs/design/prototyper` er fasit for UI og tekster.
- Kall det «nettsiden» eller «systemet», aldri «app», i tekster og kommunikasjon.
- Alle beløp i øre (heltall). Posteringer endres aldri; rettelser skjer med motpostering.
- Kjør `npm test` i `system/` før push.
- `system/src/lib/` er motoren (hovedbok, MVA, KID, frister, bankmatch, rapporter, SAF-T, PDF). `lib/tjenester/` snakker med databasen. `app/handlinger.ts` er alle serverhandlinger.
- Uten `DATABASE_URL` kjører systemet i testmodus (PGlite i minnet, demo-data): demo@rettfort.no / regnskap@rettfort.no, passord `rettfort-demo`.
- Ende-til-ende-test: `next start -p 3100` med `RETTFORT_IDAG=2026-10-05`, så `node tests-e2e/e2e.mjs`.
- `.vercelignore` i roten gjelder begge Vercel-prosjektene. Ikke ignorer `system/` der; `/system` er stengt i `vercel.json` for den gamle nettsiden.
