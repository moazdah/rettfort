// Finner ikonene vaktplanen bruker og skriver dem til src/app/vp/ikoner.ts.
// Alle tekststrenger i koden sammenlignes med navnene i Material Symbols (scripts/material-symbols.txt).
// Kjør: node scripts/ikoner.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const kjente = new Set(readFileSync('scripts/material-symbols.txt', 'utf8').split('\n').filter(Boolean));
const filer = ['src/app/vp', 'src/app/vakt'].flatMap(d => readdirSync(d, { recursive: true }).filter(f => /\.tsx?$/.test(f) && !f.endsWith('ikoner.ts')).map(f => `${d}/${f}`));
const navn = new Set();
for (const f of filer) for (const m of readFileSync(f, 'utf8').matchAll(/['"]([a-z][a-z0-9_]{1,40})['"]/g)) if (kjente.has(m[1])) navn.add(m[1]);
const liste = [...navn].sort();
writeFileSync('src/app/vp/ikoner.ts', `// Ikonene vaktplanen bruker. Google Fonts leverer bare disse, så fila blir liten.
// Oppdateres med «node scripts/ikoner.mjs» når nye ikoner tas i bruk.
export const IKONER = ${JSON.stringify(liste)};
export const IKON_URL = \`https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..24,400,0..1,0&icon_names=\${IKONER.join(',')}&display=block\`;
`);
console.log(liste.length, liste.join(' '));
