// Rettført – leser bilag i nettleseren. EHF (XML) leses direkte, PDF med pdf.js,
// bilder og skannede PDF-er med tekstgjenkjenning (Tesseract, norsk). Alt kjører
// lokalt; bibliotekene ligger i /vendor og lastes bare når de trengs.
import { decodeFile } from './rettfort-engine.js';

const V = '/vendor';
let pdfjs = null, ocr = null;

async function getPdf() {
  if (!pdfjs) { pdfjs = await import(V + '/pdfjs/pdf.min.mjs'); pdfjs.GlobalWorkerOptions.workerSrc = V + '/pdfjs/pdf.worker.min.mjs'; }
  return pdfjs;
}
const loadScript = src => new Promise((ok, bad) => {
  if (window.Tesseract) return ok();
  const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => bad(new Error('Kunne ikke laste tekstgjenkjenningen.')); document.head.appendChild(s);
});
async function getOcr() {
  if (!ocr) {
    await loadScript(V + '/tesseract/tesseract.min.js');
    ocr = await window.Tesseract.createWorker('nor', 1, { workerPath: V + '/tesseract/worker.min.js', corePath: V + '/tesseract/core', langPath: V + '/tesseract/lang', gzip: true, workerBlobURL: false });
  }
  return ocr;
}
export async function closeOcr() { if (ocr) { try { await ocr.terminate(); } catch (e) { /* allerede stoppet */ } ocr = null; } }
async function ocrOnce(img) { const w = await getOcr(); const { data } = await w.recognize(img); return { text: data.text || '', conf: Math.max(0, Math.min(1, (data.confidence || 0) / 100)) }; }

// Forbereder et bilde for tekstgjenkjenning, slik et mobilfoto trenger det:
// 1) riktig størrelse (1600–2400 px bredt), 2) gråtoner, 3) skyggefjerning (deler
// på beregnet bakgrunnslys), 4) kontraststrekk, 5) retter skjevhet (måler vinkelen
// på tekstlinjene), 6) valgfritt ren svart-hvitt (Otsu).
async function prepare(src, binary = false) {
  const bmp = src instanceof HTMLCanvasElement ? src : await createImageBitmap(src);
  const k = Math.min(3, Math.max(1600 / bmp.width, Math.min(1, 2400 / bmp.width)));
  const W = Math.round(bmp.width * k), H = Math.round(bmp.height * k);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, W, H);
  const img = g.getImageData(0, 0, W, H), d = img.data, gray = new Float32Array(W * H);
  for (let p = 0, i = 0; p < gray.length; p++, i += 4) gray[p] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
  // Bakgrunnslys: gjennomsnitt i et stort vindu (integralbilde), maks-filtrert via lyseste av tekst og papir.
  const r = Math.max(15, Math.round(W / 30)), S = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += gray[y * W + x]; S[(y + 1) * (W + 1) + x + 1] = S[y * (W + 1) + x + 1] + row; } }
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) { const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1); for (let x = 0; x < W; x++) { const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1); const mean = (S[y1 * (W + 1) + x1] - S[y0 * (W + 1) + x1] - S[y1 * (W + 1) + x0] + S[y0 * (W + 1) + x0]) / ((y1 - y0) * (x1 - x0)); const bg = Math.max(mean * 1.08, 1); out[y * W + x] = Math.min(255, gray[y * W + x] / bg * 255); } }
  const hist = new Uint32Array(256); out.forEach(v => hist[v | 0]++);
  let lo = 0, hi = 255, acc = 0; const n = out.length; while (lo < 255 && (acc += hist[lo]) < n * 0.005) lo++; acc = 0; while (hi > 0 && (acc += hist[hi]) < n * 0.3) hi--;
  const span = Math.max(1, hi - lo); for (let p = 0; p < n; p++) out[p] = Math.max(0, Math.min(255, (out[p] - lo) * 255 / span));
  // Skjevhet: prøv vinkler og velg den som gir skarpest radprofil (mørke piksler på få rader).
  const step = Math.max(1, Math.round(W / 700)); let bestA = 0, bestV = -1;
  for (let a = -8; a <= 8.001; a += 0.25) { const t = Math.tan(a * Math.PI / 180), rows = new Float64Array(H + W); for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) if (out[y * W + x] < 120) rows[Math.round(y - x * t + W)]++; let v = 0; for (let q = 0; q < rows.length; q++) v += rows[q] * rows[q]; if (v > bestV) { bestV = v; bestA = a; } }
  let t = 128;
  if (binary) { const h2 = new Uint32Array(256); out.forEach(v => h2[v | 0]++); let sum = 0, sB = 0, wB = 0, best = 0; for (let q = 0; q < 256; q++) sum += q * h2[q]; for (let q = 0; q < 256; q++) { wB += h2[q]; if (!wB) continue; const wF = n - wB; if (!wF) break; sB += q * h2[q]; const v = wB * wF * (sB / wB - (sum - sB) / wF) ** 2; if (v > best) { best = v; t = q; } } }
  for (let p = 0, i = 0; p < n; p++, i += 4) { const v = binary ? (out[p] > t ? 255 : 0) : out[p]; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  if (Math.abs(bestA) < 0.3) return c;
  const o = document.createElement('canvas'); o.width = W; o.height = H; const og = o.getContext('2d');
  og.fillStyle = '#fff'; og.fillRect(0, 0, W, H); og.translate(W / 2, H / 2); og.rotate(-Math.atan(Math.tan(bestA * Math.PI / 180))); og.drawImage(c, -W / 2, -H / 2);
  return o;
}
async function recognize(src) {
  let best = await ocrOnce(await prepare(src));
  if (best.conf < 0.6) { const r = await ocrOnce(await prepare(src, true)); if (r.conf > best.conf) best = r; }
  return best;
}

// Setter tekstbitene fra pdf.js sammen til linjer, ovenfra og ned.
function linesOf(items) {
  const rows = [];
  items.filter(i => i.str && i.str.trim()).forEach(i => { const y = i.transform[5]; let r = rows.find(x => Math.abs(x.y - y) < 3); if (!r) rows.push(r = { y, items: [] }); r.items.push(i); });
  return rows.sort((a, b) => b.y - a.y).map(r => r.items.sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str.trim()).join('   ')).join('\n');
}

// Returnerer { name, kind, xml? | text?, conf?, error? } til kontrollmotoren.
export async function readBilag(file, onStep) {
  const name = file.name, ext = (name.split('.').pop() || '').toLowerCase(), type = (file.type || '').toLowerCase();
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    if (!buf.length) return { name, error: 'Filen er tom.' };
    if (ext === 'xml' || /xml/.test(type)) return { name, kind: 'ehf', xml: decodeFile(buf, 'xml') };
    if (ext === 'pdf' || type === 'application/pdf') {
      const lib = await getPdf();
      const doc = await lib.getDocument({ data: buf, isEvalSupported: false }).promise;
      let text = '';
      for (let i = 1; i <= Math.min(doc.numPages, 4); i++) { const p = await doc.getPage(i); text += linesOf((await p.getTextContent()).items) + '\n'; }
      if (text.replace(/\s/g, '').length >= 40) return { name, kind: 'pdf', text, conf: 1 };
      // Skannet PDF uten tekstlag: tegn første side og les den med tekstgjenkjenning.
      onStep && onStep(`Tekstgjenkjenning av «${name}»`);
      const p = await doc.getPage(1), vp = p.getViewport({ scale: 2 }), c = document.createElement('canvas');
      c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      await p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      return { name, kind: 'bilde', ...(await recognize(c)) };
    }
    if (/heic|heif/.test(ext + type)) return { name, error: 'HEIC-bilder (iPhone) støttes ikke. Ta bildet som JPG, eller eksporter det som JPG først.' };
    if (/^image\//.test(type) || /^(png|jpe?g|webp|gif|bmp)$/.test(ext)) {
      onStep && onStep(`Tekstgjenkjenning av «${name}»`);
      return { name, kind: 'bilde', ...(await recognize(new Blob([buf], { type: type || 'image/' + (ext === 'jpg' ? 'jpeg' : ext) }))) };
    }
    return { name, error: 'Filtypen støttes ikke. Bruk PDF, bilde (JPG eller PNG) eller EHF (XML).' };
  } catch (e) {
    return { name, error: String(e && e.message || e) };
  }
}
