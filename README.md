# Rettført

Kontroll av regnskap (SAF-T) og lønn, med avstemming mellom dem. Alt kjører i nettleseren.

## Filer
- `index.html` – nettsiden og appen
- `support.js` – kjøretid for siden
- `rettfort-engine.js` – kontrollmotoren (32 kontroller)
- `rettfort-tests.js` – automatiske tester for krysskontrollene
- `assets/` – logo og bilde

## Publisering (Vercel)
1. Last opp innholdet i denne mappen til et GitHub-repo (filene skal ligge i roten).
2. På vercel.com: Add New → Project → velg repoet.
3. Framework Preset: **Other**. Build Command og Output Directory: la stå tomt.
4. Deploy. Siden får en adresse som `rettfort.vercel.app`.
5. Domene: Project → Settings → Domains → legg til domenet ditt og følg DNS-instruksjonene.

Hver gang du laster opp endringer til GitHub, publiserer Vercel på nytt automatisk.

## Påmelding (Formspree)
Sett adressen til skjemaet i `index.html`:
```
const FORM_ENDPOINT = 'https://formspree.io/f/xxxxxxx';
```
