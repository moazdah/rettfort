// Finner en kvittering eller faktura i et kamerabilde, sier hva brukeren bør gjøre, og retter opp bildet.
// Ren beregning uten nettleser-API-er, så den kan testes. Kjøres på et lite gråtonebilde (ca. 240 px bredt)
// flere ganger i sekundet; selve bildet tas i full oppløsning når alt er godt nok.

export type Punkt = { x: number; y: number };
/** Hjørnene i rekkefølge: øverst til venstre, øverst til høyre, nederst til høyre, nederst til venstre. */
export type Firkant = [Punkt, Punkt, Punkt, Punkt];

export interface Funn {
  firkant: Firkant | null;
  /** Hvor stor del av bildet dokumentet dekker (0–1). */
  dekning: number;
  /** Hvor godt dokumentet fyller firkanten (1 = helt rektangulært). */
  fylling: number;
  /** Dokumentet går ut av bildet. */
  vedKanten: boolean;
  /** Gjennomsnittlig lysstyrke i bildet (0–255). */
  lys: number;
}

export type Hint = 'finner' | 'naermere' | 'lengre' | 'hele' | 'morkt' | 'stille' | 'klar';

export const HINTTEKST: Record<Hint, string> = {
  finner: 'Hold kvitteringen foran kameraet',
  naermere: 'Gå nærmere',
  lengre: 'Gå litt lenger unna',
  hele: 'Hele kvitteringen må være med',
  morkt: 'For mørkt. Finn mer lys',
  stille: 'Hold stille …',
  klar: 'Tar bildet',
};

/** Gråtone fra RGBA. */
export function graatone(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Uint8Array {
  const g = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
  return g;
}

/** Terskel som skiller lyst papir fra mørkere bakgrunn (Otsu). */
export function otsu(g: Uint8Array): number {
  const hist = new Array(256).fill(0);
  for (const v of g) hist[v]++;
  const n = g.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, terskel = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = n - wB; if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const mellom = wB * wF * (mB - mF) ** 2;
    if (mellom > best) { best = mellom; terskel = t; }
  }
  return terskel;
}

/** Finner det største lyse området (papiret) og hjørnene rundt det. */
export function finnDokument(g: Uint8Array, w: number, h: number): Funn {
  let lysSum = 0;
  for (const v of g) lysSum += v;
  const lys = lysSum / g.length;
  const t = otsu(g);
  const tom: Funn = { firkant: null, dekning: 0, fylling: 0, vedKanten: false, lys };
  // Lite kontrast: ingen tydelig forskjell på papir og bakgrunn.
  let lyse = 0;
  for (const v of g) if (v > t) lyse++;
  if (lyse < g.length * 0.005) return tom;

  const merke = new Int32Array(w * h).fill(-1);
  const ko = new Int32Array(w * h);
  let beste = -1, besteStr = 0, etikett = 0;
  const storrelser: number[] = [];
  for (let start = 0; start < g.length; start++) {
    if (g[start] <= t || merke[start] !== -1) continue;
    let hode = 0, hale = 0, str = 0;
    ko[hale++] = start; merke[start] = etikett;
    while (hode < hale) {
      const p = ko[hode++]; str++;
      const x = p % w, y = (p - x) / w;
      if (x > 0) { const q = p - 1; if (g[q] > t && merke[q] === -1) { merke[q] = etikett; ko[hale++] = q; } }
      if (x < w - 1) { const q = p + 1; if (g[q] > t && merke[q] === -1) { merke[q] = etikett; ko[hale++] = q; } }
      if (y > 0) { const q = p - w; if (g[q] > t && merke[q] === -1) { merke[q] = etikett; ko[hale++] = q; } }
      if (y < h - 1) { const q = p + w; if (g[q] > t && merke[q] === -1) { merke[q] = etikett; ko[hale++] = q; } }
    }
    storrelser.push(str);
    if (str > besteStr) { besteStr = str; beste = etikett; }
    etikett++;
  }
  if (beste < 0 || besteStr < g.length * 0.005) return tom;

  // Hjørnene er punktene lengst ut i hver diagonal retning.
  let tl = { x: 0, y: 0, v: Infinity }, br = { x: 0, y: 0, v: -Infinity }, tr = { x: 0, y: 0, v: -Infinity }, bl = { x: 0, y: 0, v: Infinity };
  let vedKanten = false;
  for (let p = 0; p < merke.length; p++) {
    if (merke[p] !== beste) continue;
    const x = p % w, y = (p - x) / w;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) vedKanten = true;
    const s = x + y, d = x - y;
    if (s < tl.v) tl = { x, y, v: s };
    if (s > br.v) br = { x, y, v: s };
    if (d > tr.v) tr = { x, y, v: d };
    if (d < bl.v) bl = { x, y, v: d };
  }
  const firkant: Firkant = [{ x: tl.x, y: tl.y }, { x: tr.x, y: tr.y }, { x: br.x, y: br.y }, { x: bl.x, y: bl.y }];
  const areal = firkantAreal(firkant);
  return { firkant, dekning: besteStr / g.length, fylling: areal > 0 ? Math.min(1, besteStr / areal) : 0, vedKanten, lys };
}

export function firkantAreal(f: Firkant): number {
  let a = 0;
  for (let i = 0; i < 4; i++) { const p = f[i], q = f[(i + 1) % 4]; a += p.x * q.y - q.x * p.y; }
  return Math.abs(a) / 2;
}

/** Skarphet: variansen av Laplace-filteret i området. Uskarpe bilder gir lav verdi. */
export function skarphet(g: Uint8Array, w: number, h: number): number {
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const l = g[i - 1] + g[i + 1] + g[i - w] + g[i + w] - 4 * g[i];
    sum += l; sum2 += l * l; n++;
  }
  if (!n) return 0;
  const m = sum / n;
  return sum2 / n - m * m;
}

/** Største forskyvning av et hjørne mellom to målinger, som andel av bildebredden. */
export function bevegelse(a: Firkant, b: Firkant, w: number): number {
  let m = 0;
  for (let i = 0; i < 4; i++) m = Math.max(m, Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y));
  return m / w;
}

/** Hva brukeren skal gjøre nå, ut fra det som ble funnet. */
export function vurder(f: Funn): Hint {
  if (f.lys < 45) return 'morkt';
  if (!f.firkant || f.fylling < 0.7) return 'finner';
  if (f.vedKanten) return f.dekning > 0.55 ? 'lengre' : 'hele';
  if (f.dekning < 0.18) return 'naermere';
  if (f.dekning > 0.92) return 'lengre';
  return 'stille';
}

/**
 * Holder styr på de siste målingene og sier når bildet skal tas: dokumentet må ha vært i ro og i riktig
 * størrelse en liten stund. Kall `mal` for hvert bilde; får du `klar`, ta bildet.
 */
export class Autoutlos {
  private forrige: Firkant | null = null;
  private roligeBilder = 0;
  constructor(private krevRolige = 6, private maksBevegelse = 0.02) {}
  mal(f: Funn, w: number): Hint {
    const hint = vurder(f);
    if (hint !== 'stille' || !f.firkant) { this.roligeBilder = 0; this.forrige = f.firkant; return hint; }
    const rolig = this.forrige ? bevegelse(this.forrige, f.firkant, w) < this.maksBevegelse : false;
    this.forrige = f.firkant;
    this.roligeBilder = rolig ? this.roligeBilder + 1 : 0;
    return this.roligeBilder >= this.krevRolige ? 'klar' : 'stille';
  }
  nullstill() { this.forrige = null; this.roligeBilder = 0; }
}

/** Homografi som tar punkter i det rette bildet (0..dw, 0..dh) til firkanten i kildebildet. */
export function homografi(dw: number, dh: number, f: Firkant): number[] {
  const src = [[0, 0], [dw, 0], [dw, dh], [0, dh]];
  const A: number[][] = [], B: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], X = f[i].x, Y = f[i].y;
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); B.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); B.push(Y);
  }
  // Gauss-eliminasjon på 8x8
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [B[c], B[p]] = [B[p], B[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const k = A[r][c] / A[c][c];
      for (let j = c; j < 8; j++) A[r][j] -= k * A[c][j];
      B[r] -= k * B[c];
    }
  }
  return [...B.map((b, i) => b / A[i][i]), 1];
}

/** Hvor stort det rette bildet bør være, ut fra sidene i firkanten. Lengste side begrenses til `maks`. */
export function malStorrelse(f: Firkant, maks = 2000): { w: number; h: number } {
  const d = (a: Punkt, b: Punkt) => Math.hypot(a.x - b.x, a.y - b.y);
  let w = Math.max(d(f[0], f[1]), d(f[3], f[2])), h = Math.max(d(f[0], f[3]), d(f[1], f[2]));
  const s = Math.min(1, maks / Math.max(w, h));
  w = Math.max(1, Math.round(w * s)); h = Math.max(1, Math.round(h * s));
  return { w, h };
}

/** Retter opp firkanten i kildebildet til et rett bilde (RGBA), med bilineær sampling. */
export function rettOpp(src: Uint8ClampedArray | Uint8Array, sw: number, sh: number, f: Firkant, dw: number, dh: number): Uint8ClampedArray {
  const H = homografi(dw, dh, f);
  const ut = new Uint8ClampedArray(dw * dh * 4);
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const z = H[6] * x + H[7] * y + 1;
    const sx = (H[0] * x + H[1] * y + H[2]) / z, sy = (H[3] * x + H[4] * y + H[5]) / z;
    const x0 = Math.max(0, Math.min(sw - 2, Math.floor(sx))), y0 = Math.max(0, Math.min(sh - 2, Math.floor(sy)));
    const fx = Math.min(1, Math.max(0, sx - x0)), fy = Math.min(1, Math.max(0, sy - y0));
    const o = (y * dw + x) * 4, a = (y0 * sw + x0) * 4, b = a + 4, c = a + sw * 4, d = c + 4;
    for (let k = 0; k < 3; k++) {
      ut[o + k] = (src[a + k] * (1 - fx) + src[b + k] * fx) * (1 - fy) + (src[c + k] * (1 - fx) + src[d + k] * fx) * fy;
    }
    ut[o + 3] = 255;
  }
  return ut;
}

/** Gjør papiret hvitt og teksten tydelig: strekker lysstyrken mellom 2 % og 98 % av pikslene. */
export function forbedre(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const hist = new Array(256).fill(0);
  const n = rgba.length / 4;
  for (let i = 0; i < rgba.length; i += 4) hist[(rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8]++;
  let lav = 0, hoy = 255, acc = 0;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > n * 0.02) { lav = i; break; } }
  acc = 0;
  for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > n * 0.02) { hoy = i; break; } }
  if (hoy - lav < 30) return rgba;
  const k = 255 / (hoy - lav);
  for (let i = 0; i < rgba.length; i += 4) for (let j = 0; j < 3; j++) rgba[i + j] = (rgba[i + j] - lav) * k;
  return rgba;
}
