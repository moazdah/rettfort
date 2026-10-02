import { describe, it, expect } from 'vitest';
import { finnDokument, vurder, Autoutlos, rettOpp, malStorrelse, skarphet, homografi, type Firkant } from '@/lib/skanner';

/** Mørk bakgrunn med et lyst, litt skjevt papir (firkant) og noen mørke «tekstlinjer». */
function bilde(w: number, h: number, f: Firkant, lysBak = 60, lysPapir = 230): Uint8Array {
  const g = new Uint8Array(w * h).fill(lysBak);
  const inne = (x: number, y: number) => {
    let pos = 0, neg = 0;
    for (let i = 0; i < 4; i++) { const a = f[i], b = f[(i + 1) % 4]; const c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x); if (c > 0) pos++; else if (c < 0) neg++; }
    return !(pos && neg);
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inne(x, y)) g[y * w + x] = (y % 12 === 0 && x % 7 < 5) ? 90 : lysPapir;
  return g;
}
const W = 240, H = 320;
const kvittering: Firkant = [{ x: 70, y: 40 }, { x: 175, y: 48 }, { x: 168, y: 280 }, { x: 62, y: 272 }];

describe('skanner', () => {
  it('finner kvitteringen og hjørnene', () => {
    const f = finnDokument(bilde(W, H, kvittering), W, H);
    expect(f.firkant).not.toBeNull();
    f.firkant!.forEach((p, i) => { expect(Math.abs(p.x - kvittering[i].x)).toBeLessThan(6); expect(Math.abs(p.y - kvittering[i].y)).toBeLessThan(6); });
    expect(f.vedKanten).toBe(false);
    expect(f.fylling).toBeGreaterThan(0.85);
    expect(vurder(f)).toBe('stille');
  });
  it('ber om å gå nærmere når kvitteringen er liten', () => {
    const liten: Firkant = [{ x: 110, y: 140 }, { x: 135, y: 140 }, { x: 135, y: 185 }, { x: 110, y: 185 }];
    expect(vurder(finnDokument(bilde(W, H, liten), W, H))).toBe('naermere');
  });
  it('sier fra når kvitteringen går ut av bildet', () => {
    const utenfor: Firkant = [{ x: 60, y: -20 }, { x: 180, y: -20 }, { x: 180, y: 200 }, { x: 60, y: 200 }];
    expect(vurder(finnDokument(bilde(W, H, utenfor), W, H))).toBe('hele');
  });
  it('sier fra når det er for mørkt', () => {
    expect(vurder(finnDokument(bilde(W, H, kvittering, 10, 35), W, H))).toBe('morkt');
  });
  it('tar bildet først når kvitteringen har vært i ro en stund', () => {
    const a = new Autoutlos(4);
    const f = finnDokument(bilde(W, H, kvittering), W, H);
    const svar = [1, 2, 3, 4, 5].map(() => a.mal(f, W));
    expect(svar).toEqual(['stille', 'stille', 'stille', 'stille', 'klar']);
    // Bevegelse nullstiller
    const flyttet: Firkant = kvittering.map(p => ({ x: p.x + 20, y: p.y })) as Firkant;
    expect(a.mal(finnDokument(bilde(W, H, flyttet), W, H), W)).toBe('stille');
  });
  it('homografien treffer hjørnene', () => {
    const Hm = homografi(100, 200, kvittering);
    const map = (x: number, y: number) => { const z = Hm[6] * x + Hm[7] * y + 1; return [(Hm[0] * x + Hm[1] * y + Hm[2]) / z, (Hm[3] * x + Hm[4] * y + Hm[5]) / z]; };
    expect(map(0, 0).map(Math.round)).toEqual([70, 40]);
    expect(map(100, 200).map(Math.round)).toEqual([168, 280]);
  });
  it('retter opp: resultatet er nesten bare papir', () => {
    const g = bilde(W, H, kvittering);
    const rgba = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < g.length; i++) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = g[i]; rgba[i * 4 + 3] = 255; }
    const m = malStorrelse(kvittering, 400);
    expect(m.h).toBeGreaterThan(m.w);
    const ut = rettOpp(rgba, W, H, kvittering, m.w, m.h);
    let morke = 0;
    for (let i = 0; i < ut.length; i += 4) if (ut[i] < 70) morke++;
    expect(morke / (ut.length / 4)).toBeLessThan(0.03);
  });
  it('skarphet er høyere for skarpe kanter enn for jevne flater', () => {
    const jevn = new Uint8Array(50 * 50).fill(128);
    const skarp = bilde(50, 50, [{ x: 10, y: 10 }, { x: 40, y: 10 }, { x: 40, y: 40 }, { x: 10, y: 40 }]);
    expect(skarphet(skarp, 50, 50)).toBeGreaterThan(skarphet(jevn, 50, 50) + 100);
  });
});
