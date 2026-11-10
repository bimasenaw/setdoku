/*
 * SETDOKU: membuat ikon aplikasi dan gambar pratinjau tautan dari kode.
 * Jalankan: npm run ikon. Hasilnya masuk ke public/ikon.
 * Toko aplikasi dan browser butuh PNG, jadi SVG buatan kode digambar lewat Edge.
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const EDGE = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const KELUAR = path.join(__dirname, '..', 'public', 'ikon');
const WARNA = ['#fae242', '#68dcf3', '#f0506e'];

function jalurBintang() {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 9 : 21;
    const sudut = (-90 + i * 36) * Math.PI / 180;
    d += (i ? 'L' : 'M') + (r * Math.cos(sudut)).toFixed(2) + ' ' + (r * Math.sin(sudut)).toFixed(2);
  }
  return d + 'Z';
}

const BENTUK = [
  (c) => `<path d="${jalurBintang()}" fill="${c}"/>`,
  (c) => `<path d="M13 -17A19 19 0 1 0 13 17A21 21 0 0 1 13 -17Z" fill="${c}"/>`,
  (c) => `<circle r="12.5" fill="${c}"/><ellipse rx="21" ry="6.5" fill="none" stroke="${c}" stroke-width="3" transform="rotate(-22)"/>`,
];

// Tiga kartu berjajar yang semua sifatnya berbeda: contoh rasi.
function kartu(n, x, y, lebar, putar) {
  const s = lebar / 100;
  return `<g transform="translate(${x} ${y}) rotate(${putar}) scale(${s})">
    <rect x="-48" y="-68" width="96" height="136" rx="12" fill="#1d2350" stroke="#7a84d6" stroke-width="3"/>
    <g transform="scale(1.35)">${BENTUK[n](WARNA[n])}</g>
  </g>`;
}

function tigaKartu(cx, cy, lebar) {
  const jarak = lebar * 1.02;
  return kartu(0, cx - jarak, cy + lebar * 0.1, lebar, -9)
    + kartu(2, cx + jarak, cy + lebar * 0.1, lebar, 9)
    + kartu(1, cx, cy, lebar, 0);
}

const LATAR = '#0b0e24';

// Ikon biasa: sudut membulat. Ikon maskable: penuh, dan isinya di dalam zona aman 80%.
function svgIkon({ maskable = false } = {}) {
  const lebarKartu = maskable ? 118 : 156;
  const sudut = maskable ? 0 : 112;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <rect width="512" height="512" rx="${sudut}" fill="${LATAR}"/>
    ${tigaKartu(256, 256, lebarKartu)}
  </svg>`;
}

function htmlPratinjau() {
  return `<!doctype html><meta charset="utf-8">
  <style>
    html, body { margin: 0; width: 1200px; height: 630px; background: ${LATAR}; color: #eef0ff; font-family: "Segoe UI", system-ui, sans-serif; }
    .isi { display: flex; align-items: center; justify-content: center; gap: 56px; height: 100%; }
    h1 { margin: 0; font-size: 104px; font-weight: 800; letter-spacing: -.02em; line-height: 1; }
    p { margin: 18px 0 0; font-size: 38px; color: #a9afd8; }
    svg { width: 420px; height: 420px; flex: none; }
  </style>
  <div class="isi">
    <svg viewBox="0 0 512 512">${tigaKartu(256, 256, 156)}</svg>
    <div><h1>SETDOKU</h1><p>Puzzle dan duel tiga kartu</p></div>
  </div>`;
}

async function gambar(browser, html, lebar, tinggi, nama, transparan = false) {
  const page = await browser.newPage();
  await page.setViewport({ width: lebar, height: tinggi });
  await page.setContent(html);
  await page.screenshot({ path: path.join(KELUAR, nama), omitBackground: transparan });
  await page.close();
}

function halamanIkon(svg, ukuran) {
  return `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${ukuran}px;height:${ukuran}px}</style>${svg}`;
}

(async () => {
  fs.mkdirSync(KELUAR, { recursive: true });
  fs.writeFileSync(path.join(KELUAR, 'ikon.svg'), svgIkon());
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new' });
  for (const ukuran of [192, 512]) {
    await gambar(browser, halamanIkon(svgIkon(), ukuran), ukuran, ukuran, `ikon-${ukuran}.png`, true);
  }
  await gambar(browser, halamanIkon(svgIkon({ maskable: true }), 512), 512, 512, 'ikon-maskable-512.png');
  // iOS menambahkan sudut membulat sendiri, jadi ikonnya penuh tanpa transparansi.
  await gambar(browser, halamanIkon(svgIkon({ maskable: true }), 180), 180, 180, 'apple-touch-icon.png');
  await gambar(browser, htmlPratinjau(), 1200, 630, 'pratinjau.png');
  await browser.close();
  console.log('Ikon dibuat di', KELUAR);
})();
