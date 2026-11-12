// Uji duel online dengan Firebase Emulator. Dua hal yang tidak bisa diuji dengan server tiruan:
//   1. Aturan keamanan di database.rules.json, lewat permintaan REST sebagai pemain yang berbeda.
//   2. public/online.js yang sungguhan, lewat duel antara dua browser terpisah.
// Jalankan: npm run uji:emulator. Butuh Java, dan internet untuk SDK Firebase dari CDN.
// Satu kelompok saja: npm run uji:emulator -- aturan (atau duel, atau waktu).
// Kelompok waktu menunggu duel 3 menit sampai habis, jadi seluruh uji memakan sekitar 5 menit.
const puppeteer = require('puppeteer-core');
const http = require('http');
const path = require('path');
const fs = require('fs');
const D = require('../public/duel-online.js');
const LEVEL = require('../public/level.js');

const EDGE = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PUBLIK = path.join(__dirname, '..', 'public');
const FOTO = path.join(__dirname, 'foto');
const DB = 'http://127.0.0.1:9000';
const AUTH = 'http://127.0.0.1:9099';
const NS = 'demo-setdoku-default-rtdb';
const SV = { '.sv': 'timestamp' };
const ADMIN = 'owner'; // di emulator, token ini melewati aturan keamanan
fs.mkdirSync(FOTO, { recursive: true });

const hasil = [];
function cek(nama, lolos, info = '') {
  hasil.push({ nama, lolos });
  console.log(`${lolos ? 'LOLOS' : 'GAGAL'}  ${nama}${info ? '  -> ' + info : ''}`);
}
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

/* Permintaan REST ke emulator */

async function pemainBaru() {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  const isi = await r.json();
  if (!isi.idToken) throw new Error('emulator Auth tidak menjawab: ' + JSON.stringify(isi));
  return { uid: isi.localId, token: isi.idToken };
}

// Token pemain dikirim lewat ?auth=, seperti di Firebase sungguhan. Authorization: Bearer
// dianggap token admin, jadi hanya dipakai untuk ADMIN.
async function rest(metode, jalur, token, isi) {
  const pemain = token && token !== ADMIN ? `&auth=${encodeURIComponent(token)}` : '';
  const r = await fetch(`${DB}/${jalur}.json?ns=${NS}${pemain}`, {
    method: metode,
    headers: { 'Content-Type': 'application/json', ...(token === ADMIN ? { Authorization: `Bearer ${ADMIN}` } : {}) },
    body: isi === undefined ? undefined : JSON.stringify(isi),
  });
  const teks = await r.text();
  let nilai = null;
  try { nilai = JSON.parse(teks); } catch (e) {}
  return { ok: r.ok, status: r.status, nilai, teks };
}

// Aturan dipasang sendiri ke database yang dipakai game, supaya tidak bergantung pada
// nama database bawaan emulator, yang berbeda antarversi firebase-tools.
async function pasangAturan() {
  const aturan = fs.readFileSync(path.join(__dirname, '..', 'database.rules.json'), 'utf8');
  const r = await fetch(`${DB}/.settings/rules.json?ns=${NS}`, { method: 'PUT', headers: { Authorization: `Bearer ${ADMIN}` }, body: aturan });
  if (!r.ok) throw new Error('aturan ditolak emulator: ' + (await r.text()));
  const terpasang = await (await fetch(`${DB}/.settings/rules.json?ns=${NS}`, { headers: { Authorization: `Bearer ${ADMIN}` } })).json();
  cek('aturan: database.rules.json diterima emulator', JSON.stringify(terpasang) === JSON.stringify(JSON.parse(aturan)));
}

const bacaAdmin = (jalur) => rest('GET', jalur, ADMIN).then((r) => r.nilai);

async function boleh(nama, janji) {
  const r = await janji;
  cek(`aturan: boleh ${nama}`, r.ok, r.ok ? '' : `${r.status} ${r.teks.slice(0, 120)}`);
}

// Hanya 401 dan 403 yang berarti ditolak aturan. Status lain berarti permintaannya yang salah.
async function tolak(nama, janji) {
  const r = await janji;
  cek(`aturan: tolak ${nama}`, r.status === 401 || r.status === 403, r.status === 401 || r.status === 403 ? '' : `${r.status} ${r.teks.slice(0, 120)}`);
}

function isiRoom(uid, tambahan = {}) {
  const p = D.pilihPuzzle(LEVEL, 'easy');
  return {
    v: D.VERSI, dibuat: SV, tuan: uid, kesulitan: 'easy', level: p.level, jenis: p.jenis, sidik: p.sidik,
    pemain: { [uid]: { nama: 'Ani', tersambung: true } },
    ...tambahan,
  };
}

async function ujiAturan() {
  console.log('\n== Aturan keamanan database ==');
  const [a, b, c] = [await pemainBaru(), await pemainBaru(), await pemainBaru()];
  const room = (kode, ...anak) => ['rooms', kode, ...anak].join('/');
  const gabung = (kode, p, nama = 'Budi') => rest('PATCH', room(kode), p.token, {
    tamu: p.uid,
    [`pemain/${p.uid}`]: { nama, tersambung: true },
  });
  const papan = [0, 1, 2, 3, 4, 5, 6, 7, 80];
  const jawab = (kode, p, isi = {}) => rest('PUT', room(kode, 'jawaban', p.uid), p.token, { papan, pada: SV, ...isi });
  const klaim = (kode, p, isi = {}) => rest('PUT', room(kode, 'akhir'), p.token, { pemenang: p.uid, alasan: 'putus', pada: SV, ...isi });

  const k = D.buatKode();

  /* Membaca dan membuat */
  await tolak('membaca room tanpa login', rest('GET', room(k), null));
  await tolak('membaca daftar semua room', rest('GET', 'rooms', a.token));
  await tolak('membuat room tanpa login', rest('PUT', room(k), null, isiRoom(a.uid)));
  await tolak('menulis di luar rooms', rest('PUT', 'lain/x', a.token, 1));
  await tolak('kode room huruf kecil', rest('PUT', room('abcde'), a.token, isiRoom(a.uid)));
  await tolak('kode room 6 karakter', rest('PUT', room('ABCDEF'), a.token, isiRoom(a.uid)));
  await tolak('kode room dengan angka 0', rest('PUT', room('ABCD0'), a.token, isiRoom(a.uid)));
  await tolak('kode room dengan huruf I', rest('PUT', room('ABCDI'), a.token, isiRoom(a.uid)));
  await tolak('room atas nama orang lain', rest('PUT', room(k), a.token, isiRoom(b.uid)));
  await tolak('room dengan waktu dibuat karangan', rest('PUT', room(k), a.token, isiRoom(a.uid, { dibuat: Date.now() - 3600000 })));
  await tolak('room dengan versi lain', rest('PUT', room(k), a.token, isiRoom(a.uid, { v: 2 })));
  await tolak('room dengan field asing', rest('PUT', room(k), a.token, isiRoom(a.uid, { hadiah: 1 })));
  await tolak('room dengan tingkat asing', rest('PUT', room(k), a.token, isiRoom(a.uid, { kesulitan: 'dewa' })));
  await tolak('room dengan level di luar 1-100', rest('PUT', room(k), a.token, isiRoom(a.uid, { level: 101 })));
  await tolak('room tanpa data pembuatnya', rest('PUT', room(k), a.token, isiRoom(a.uid, { pemain: { [b.uid]: { nama: 'Budi', tersambung: true } } })));
  await tolak('nama pemain 2 huruf', rest('PUT', room(k), a.token, isiRoom(a.uid, { pemain: { [a.uid]: { nama: 'ab', tersambung: true } } })));
  await tolak('nama pemain 33 huruf', rest('PUT', room(k), a.token, isiRoom(a.uid, { pemain: { [a.uid]: { nama: 'x'.repeat(33), tersambung: true } } })));
  await tolak('room yang langsung dimulai tanpa tamu', rest('PUT', room(k), a.token, isiRoom(a.uid, { mulaiPada: SV })));
  await tolak('room yang langsung berisi ajakan main lagi', rest('PUT', room(k), a.token, isiRoom(a.uid, { lanjut: D.buatKode() })));
  await tolak('room yang langsung berisi hasil', rest('PUT', room(k), a.token, isiRoom(a.uid, { akhir: { pemenang: a.uid, alasan: 'putus', pada: SV } })));
  await boleh('membuat room yang sah', rest('PUT', room(k), a.token, isiRoom(a.uid)));
  const dibuat = await bacaAdmin(room(k, 'dibuat'));
  cek('aturan: waktu dibuat diisi server', Math.abs(dibuat - Date.now()) < 5000, String(dibuat));
  await tolak('menimpa room orang lain', rest('PUT', room(k), b.token, isiRoom(b.uid)));
  await tolak('menimpa room sendiri yang masih baru', rest('PUT', room(k), a.token, isiRoom(a.uid)));
  await boleh('calon tamu membaca room yang belum berisi tamu', rest('GET', room(k), c.token));

  /* Bergabung */
  await tolak('memulai duel sebelum ada tamu', rest('PUT', room(k, 'mulaiPada'), a.token, SV));
  await tolak('pembuat menjadi tamu di room sendiri', gabung(k, a));
  await tolak('mendaftarkan orang lain sebagai tamu', rest('PUT', room(k, 'tamu'), c.token, b.uid));
  await tolak('menjadi tamu tanpa data pemain', rest('PUT', room(k, 'tamu'), b.token, b.uid));
  await tolak('menulis data pemain tanpa menjadi tamu', rest('PUT', room(k, 'pemain', c.uid), c.token, { nama: 'Cici', tersambung: true }));
  await boleh('bergabung sebagai tamu', gabung(k, b));
  await tolak('orang ketiga membaca room berisi dua pemain', rest('GET', room(k), c.token));
  await tolak('orang ketiga bergabung', gabung(k, c, 'Cici'));
  await tolak('orang ketiga menulis data pemain', rest('PUT', room(k, 'pemain', c.uid), c.token, { nama: 'Cici', tersambung: true }));
  await boleh('pemain membaca room-nya', rest('GET', room(k), b.token));

  /* Memulai */
  await tolak('mengirim jawaban sebelum duel mulai', jawab(k, a));
  await tolak('mengajak main lagi sebelum duel mulai', rest('PUT', room(k, 'lanjut'), a.token, D.buatKode()));
  await tolak('mengklaim menang sebelum duel mulai', klaim(k, a));
  await tolak('tamu memulai duel', rest('PUT', room(k, 'mulaiPada'), b.token, SV));
  await tolak('waktu mulai karangan', rest('PUT', room(k, 'mulaiPada'), a.token, Date.now() - 600000));
  await boleh('pembuat memulai duel', rest('PUT', room(k, 'mulaiPada'), a.token, SV));
  await tolak('memulai duel dua kali', rest('PUT', room(k, 'mulaiPada'), a.token, SV));
  await tolak('membatalkan waktu mulai', rest('DELETE', room(k, 'mulaiPada'), a.token));

  /* Data pemain */
  await tolak('mengubah data pemain lawan', rest('PATCH', room(k, 'pemain', b.uid), a.token, { tersambung: false }));
  await tolak('menyerah atas nama lawan', rest('PUT', room(k, 'pemain', b.uid, 'menyerah'), a.token, SV));
  await tolak('mengganti nama di tengah duel', rest('PATCH', room(k, 'pemain', a.uid), a.token, { nama: 'Lain' }));
  await tolak('waktu putus di masa depan', rest('PATCH', room(k, 'pemain', a.uid), a.token, { tersambung: false, putusPada: Date.now() + 600000 }));
  await tolak('field asing di data pemain', rest('PATCH', room(k, 'pemain', a.uid), a.token, { skor: 9 }));
  await tolak('menghapus data pemain sendiri', rest('DELETE', room(k, 'pemain', a.uid), a.token));
  await boleh('menandai diri terputus', rest('PATCH', room(k, 'pemain', a.uid), a.token, { tersambung: false, putusPada: SV }));
  await boleh('menandai diri tersambung lagi', rest('PATCH', room(k, 'pemain', a.uid), a.token, { tersambung: true, putusPada: null }));

  /* Jawaban */
  await tolak('mengirim jawaban atas nama lawan', rest('PUT', room(k, 'jawaban', b.uid), a.token, { papan, pada: SV }));
  await tolak('orang ketiga mengirim jawaban', jawab(k, c));
  await tolak('papan berisi 8 kartu', jawab(k, a, { papan: papan.slice(0, 8) }));
  await tolak('papan berisi 10 kartu', jawab(k, a, { papan: [...papan, 9] }));
  await tolak('kartu nomor 81', jawab(k, a, { papan: [81, ...papan.slice(1)] }));
  await tolak('kartu pecahan', jawab(k, a, { papan: [1.5, ...papan.slice(1)] }));
  await tolak('kartu berupa teks', jawab(k, a, { papan: ['0', ...papan.slice(1)] }));
  await tolak('waktu jawaban karangan', jawab(k, a, { pada: Date.now() - 60000 }));
  await tolak('field asing di jawaban', jawab(k, a, { benar: true }));
  await boleh('mengirim jawaban, slot kosong ditulis -1', jawab(k, a, { papan: [-1, ...papan.slice(1)] }));
  await tolak('mengganti jawaban', jawab(k, a));
  await tolak('menghapus jawaban', rest('DELETE', room(k, 'jawaban', a.uid), a.token));

  /* Klaim menang karena lawan putus */
  await tolak('klaim saat lawan masih tersambung', klaim(k, a));
  await boleh('lawan terputus 10 detik lalu', rest('PATCH', room(k, 'pemain', b.uid), b.token, { tersambung: false, putusPada: Date.now() - 10000 }));
  await tolak('klaim sebelum 30 detik', klaim(k, a));
  await boleh('lawan terputus 31 detik lalu', rest('PATCH', room(k, 'pemain', b.uid), b.token, { tersambung: false, putusPada: Date.now() - 31000 }));
  await tolak('klaim atas nama orang lain', klaim(k, a, { pemenang: b.uid }));
  await tolak('klaim dengan alasan selain putus', klaim(k, a, { alasan: 'benar' }));
  await tolak('klaim dengan waktu karangan', klaim(k, a, { pada: Date.now() - 60000 }));
  await tolak('klaim dari orang ketiga', klaim(k, c));
  await tolak('klaim dari pemain yang putus itu sendiri', klaim(k, b));
  await boleh('klaim setelah lawan putus lebih dari 30 detik', klaim(k, a));
  await tolak('klaim kedua', klaim(k, a));
  await tolak('menghapus hasil klaim', rest('DELETE', room(k, 'akhir'), b.token));

  /* Menyerah */
  await tolak('menyerah dengan waktu karangan', rest('PUT', room(k, 'pemain', b.uid, 'menyerah'), b.token, Date.now() - 600000));
  await boleh('menyerah', rest('PUT', room(k, 'pemain', b.uid, 'menyerah'), b.token, SV));
  await tolak('mengubah waktu menyerah', rest('PUT', room(k, 'pemain', b.uid, 'menyerah'), b.token, SV));
  await tolak('membatalkan menyerah', rest('DELETE', room(k, 'pemain', b.uid, 'menyerah'), b.token));
  await boleh('yang sudah menyerah tetap bisa menandai sambungannya', rest('PATCH', room(k, 'pemain', b.uid), b.token, { tersambung: true, putusPada: null }));

  /* Main lagi */
  await tolak('ajakan main lagi dari orang ketiga', rest('PUT', room(k, 'lanjut'), c.token, D.buatKode()));
  await tolak('ajakan dengan kode tidak sah', rest('PUT', room(k, 'lanjut'), b.token, 'abc'));
  await boleh('mengajak main lagi', rest('PUT', room(k, 'lanjut'), b.token, D.buatKode()));
  await tolak('mengganti ajakan main lagi', rest('PUT', room(k, 'lanjut'), a.token, D.buatKode()));

  /* Menghapus dan memakai ulang kode */
  await tolak('menghapus room berisi dua pemain yang masih baru', rest('DELETE', room(k), a.token));
  const k2 = D.buatKode();
  await boleh('membuat room kedua', rest('PUT', room(k2), a.token, isiRoom(a.uid)));
  await tolak('menghapus room orang lain', rest('DELETE', room(k2), c.token));
  await boleh('pembuat menghapus room yang belum berisi tamu', rest('DELETE', room(k2), a.token));

  const lama = (menit, tambahan = {}) => isiRoom(a.uid, { dibuat: Date.now() - menit * 60000, ...tambahan });
  const duaPemain = { tamu: b.uid, pemain: { [a.uid]: { nama: 'Ani', tersambung: false }, [b.uid]: { nama: 'Budi', tersambung: false } } };
  const [k3, k4, k5, k6, k7] = [D.buatKode(), D.buatKode(), D.buatKode(), D.buatKode(), D.buatKode()];
  await rest('PUT', room(k3), ADMIN, lama(31, duaPemain));
  await rest('PUT', room(k4), ADMIN, lama(29, duaPemain));
  await rest('PUT', room(k5), ADMIN, lama(121));
  await rest('PUT', room(k6), ADMIN, lama(119));
  await rest('PUT', room(k7), ADMIN, lama(11));
  await tolak('menghapus room dua pemain berumur 29 menit', rest('DELETE', room(k4), b.token));
  await tolak('orang ketiga menghapus room lama', rest('DELETE', room(k3), c.token));
  await boleh('pemain menghapus room-nya setelah 30 menit', rest('DELETE', room(k3), b.token));
  await tolak('merebut kode room berumur 119 menit', rest('PUT', room(k6), c.token, isiRoom(c.uid)));
  await boleh('memakai lagi kode room berumur lebih dari 2 jam', rest('PUT', room(k5), c.token, isiRoom(c.uid)));
  await tolak('bergabung ke room yang menunggu lebih dari 10 menit', gabung(k7, b));
}

/* Duel sungguhan antara dua browser */

const JENIS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

// Halaman disajikan lewat http, seperti di Vercel, supaya login dan service worker berjalan sungguhan.
function sajikan() {
  const server = http.createServer((req, res) => {
    const nama = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(PUBLIK, nama === '/' ? 'index.html' : nama);
    if (!file.startsWith(PUBLIK) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': JENIS[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((selesai) => server.listen(0, '127.0.0.1', () => selesai(server)));
}

// mode 'duel': alur utama. mode 'waktu': satu duel dibiarkan sampai waktunya habis (3 menit).
async function ujiDuel(mode) {
  console.log(mode === 'waktu' ? '\n== Duel sungguhan sampai waktu habis ==' : '\n== Duel sungguhan antara dua browser ==');
  const server = await sajikan();
  const alamat = `http://127.0.0.1:${server.address().port}/index.html?uji&emulator`;
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--mute-audio'] });
  const galat = [];

  // Setiap pemain memakai konteks browser sendiri, jadi ID anonimnya berbeda seperti dua HP.
  const pemain = async (nama) => {
    const konteks = await browser.createBrowserContext();
    const page = await konteks.newPage();
    await page.setViewport({ width: 390, height: 844 });
    page.on('pageerror', (e) => galat.push(`${nama} pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') galat.push(`${nama} console: ${m.text()}`); });
    await page.goto(alamat);
    await tidur(700);
    return { nama, konteks, page };
  };
  const klik = (page, id) => page.evaluate((i) => document.getElementById(i).click(), id);
  const teksDi = (page, id) => page.evaluate((i) => document.getElementById(i).textContent, id);
  const tunggu = (page, fn, ms = 15000, ...arg) => page.waitForFunction(fn, { timeout: ms, polling: 100 }, ...arg).then(() => true, () => false);
  const uidDi = (page) => page.evaluate(() => Online.uid());
  const galatTampil = (page) => page.evaluate(() => {
    const el = document.getElementById('galat-online');
    return el.hidden ? null : el.textContent;
  });
  const keLobi = async (p) => {
    await klik(p.page, 'tombol-online');
    await tidur(500);
    await p.page.evaluate((n) => { document.getElementById('input-nama').value = n; }, p.nama);
  };
  const buatRoom = async (p, kesulitan = 'easy') => {
    await p.page.evaluate((k) => document.querySelector(`#segmen-kesulitan [data-kesulitan="${k}"]`).click(), kesulitan);
    await klik(p.page, 'tombol-buat-room');
    const ada = await tunggu(p.page, () => !document.getElementById('online-tunggu').hidden && /Menunggu lawan/.test(document.getElementById('status-tunggu').textContent), 30000);
    return ada ? teksDi(p.page, 'kode-room') : null;
  };
  const gabung = async (p, kode) => {
    await p.page.evaluate((k) => { document.getElementById('input-kode').value = k; }, kode);
    await klik(p.page, 'tombol-gabung');
  };
  const papanTampil = (p, ms = 30000) => tunggu(p.page, () => !document.getElementById('layar-solo').hidden && document.querySelectorAll('.slot').length === 9 && /^Duel · /.test(document.getElementById('judul-level').textContent), ms);
  const dataPuzzle = (page, room) => page.evaluate((r) => {
    const puzzle = DuelOnline.ambilPuzzle(DataLevel, r);
    return { papan: puzzle.papan, tersedia: puzzle.tersedia, solusi: DuelOnline.solusi(puzzle) };
  }, room);
  const isiSemua = async (page, puzzle, { tukar = false } = {}) => {
    const kosong = puzzle.papan.flatMap((k, i) => (k === null ? [i] : []));
    const isi = Object.fromEntries(kosong.map((i) => [i, puzzle.solusi[i]]));
    if (tukar) [isi[kosong[0]], isi[kosong[1]]] = [isi[kosong[1]], isi[kosong[0]]];
    for (const i of kosong) {
      await page.evaluate((n, s) => {
        document.querySelectorAll('.sedia')[n].click();
        document.querySelectorAll('.slot')[s].click();
      }, puzzle.tersedia.indexOf(isi[i]), i);
      await tidur(60);
    }
    await page.waitForFunction(() => !document.querySelector('#lapisan-seret .hantu') && !document.querySelector('.menunggu'), { timeout: 5000 }).catch(() => {});
  };
  const adaHasil = (page, ms = 15000) => page.waitForSelector('#layar-hasil:not([hidden])', { timeout: ms }).then(() => tidur(450), () => {});
  const hasilTampil = (page) => page.evaluate(() => ({
    tampil: !document.getElementById('layar-hasil').hidden,
    judul: document.getElementById('judul-hasil').textContent,
    detail: document.getElementById('detail-hasil').textContent,
    lanjut: document.getElementById('tombol-level-lanjut').hidden ? null : document.getElementById('tombol-level-lanjut').textContent,
  }));
  const detik = (judul) => {
    const m = /(\d+):(\d\d)$/.exec(judul);
    return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
  };

  const skenarioWaktu = async () => {
    const ani = await pemain('Ani');
    const budi = await pemain('Budi');
    await keLobi(ani);
    const kode = await buatRoom(ani);
    await keLobi(budi);
    await gabung(budi, kode);
    const mulai = (await Promise.all([papanTampil(ani), papanTampil(budi)])).every(Boolean);
    cek('waktu habis: duel dimulai', mulai, String(await galatTampil(budi.page)));
    const [uidAni, uidBudi] = [await uidDi(ani.page), await uidDi(budi.page)];
    const room = await bacaAdmin(`rooms/${kode}`);
    const puzzle = await dataPuzzle(ani.page, room);
    const kosong = puzzle.papan.flatMap((k, i) => (k === null ? [i] : []));
    // Ani memasang satu kartu benar. Budi mengisi semua, dengan dua kartu tertukar.
    await ani.page.evaluate((n, s) => {
      document.querySelectorAll('.sedia')[n].click();
      document.querySelectorAll('.slot')[s].click();
    }, puzzle.tersedia.indexOf(puzzle.solusi[kosong[0]]), kosong[0]);
    await isiSemua(budi.page, puzzle, { tukar: true });
    const tenggat = D.tenggat(room);
    console.log(`   menunggu ${Math.round((tenggat - Date.now()) / 1000)} detik sampai waktu habis…`);
    await tidur(Math.max(0, tenggat - Date.now() - 4000));
    cek('waktu habis: sebelum tenggat belum ada hasil dan belum ada kiriman', !(await hasilTampil(ani.page)).tampil && !(await hasilTampil(budi.page)).tampil && (await bacaAdmin(`rooms/${kode}/jawaban`)) === null, await teksDi(ani.page, 'judul-level'));
    await Promise.all([adaHasil(ani.page, 25000), adaHasil(budi.page, 25000)]);
    const [hA, hB] = [await hasilTampil(ani.page), await hasilTampil(budi.page)];
    const akhir = await bacaAdmin(`rooms/${kode}`);
    const jawaban = akhir.jawaban || {};
    cek('waktu habis: kedua browser mengirim papannya setelah tenggat', !!jawaban[uidAni] && !!jawaban[uidBudi] && jawaban[uidAni].pada >= tenggat && jawaban[uidBudi].pada >= tenggat
      && jawaban[uidAni].pada - tenggat < 5000 && jawaban[uidBudi].pada - tenggat < 5000, JSON.stringify(jawaban));
    cek('waktu habis: slot kosong dikirim sebagai -1', !!jawaban[uidAni] && jawaban[uidAni].papan.filter((x) => x === -1).length === kosong.length - 1, JSON.stringify(jawaban[uidAni]));
    const lebih = kosong.length - 2 > 1 ? 'budi' : kosong.length - 2 < 1 ? 'ani' : 'seri';
    const cocok = lebih === 'budi' ? hA.judul === 'Kamu kalah' && hB.judul === 'Kamu menang!'
      : lebih === 'ani' ? hA.judul === 'Kamu menang!' && hB.judul === 'Kamu kalah'
        : hA.judul === hB.judul && !/menang|kalah/i.test(hA.judul);
    cek('waktu habis: posisi benar terbanyak menang, dan kedua browser sepakat', hA.tampil && hB.tampil && cocok, `${kosong.length} slot kosong | ${JSON.stringify(hA)} | ${JSON.stringify(hB)}`);
    cek('waktu habis: hasilnya tidak ditulis siapa pun ke database', !akhir.akhir && !('pemenang' in akhir));
    await ani.page.screenshot({ path: path.join(FOTO, 'emulator-waktu-habis.png') });
  };

  try {
    if (mode === 'waktu') {
      await skenarioWaktu();
      return;
    }
    const ani = await pemain('Ani');
    const budi = await pemain('Budi');
    const cici = await pemain('Cici');

    /* Membuat room, batal, lalu membuat lagi */
    await keLobi(ani);
    const kodeBatal = await buatRoom(ani);
    cek('duel: room dibuat lewat Firebase dan kodenya tampil', D.kodeSah(kodeBatal || ''), String(kodeBatal || await galatTampil(ani.page)));
    const uidAni = await uidDi(ani.page);
    const roomBatal = await bacaAdmin(`rooms/${kodeBatal}`);
    cek('duel: isi room di database sesuai rancangan', !!roomBatal && roomBatal.tuan === uidAni && roomBatal.v === D.VERSI && roomBatal.kesulitan === 'easy'
      && Math.abs(roomBatal.dibuat - Date.now()) < 30000 && roomBatal.pemain[uidAni].nama === 'Ani' && roomBatal.pemain[uidAni].tersambung === true
      && !!D.ambilPuzzle(LEVEL, roomBatal), JSON.stringify(roomBatal));
    await klik(ani.page, 'tombol-batal-room');
    await tunggu(ani.page, () => !document.getElementById('online-lobi').hidden, 5000);
    await tidur(800);
    cek('duel: membatalkan room tanpa lawan menghapusnya dari database', (await bacaAdmin(`rooms/${kodeBatal}`)) === null);

    /* Duel pertama: kunci salah, lalu menang */
    const kode1 = await buatRoom(ani);
    await keLobi(budi);
    await gabung(budi, kode1.toLowerCase());
    const mulai = (await Promise.all([papanTampil(ani), papanTampil(budi)])).every(Boolean);
    cek('duel: tamu bergabung, lalu papan tampil di kedua browser', mulai, `${await teksDi(ani.page, 'status-tunggu')} | ${await teksDi(budi.page, 'status-tunggu')} | ${await galatTampil(budi.page)}`);
    const uidBudi = await uidDi(budi.page);
    const room1 = await bacaAdmin(`rooms/${kode1}`);
    cek('duel: dua browser punya ID berbeda, dan waktu mulai diisi server', uidAni !== uidBudi && room1.tamu === uidBudi && Math.abs(room1.mulaiPada - Date.now()) < 30000 && room1.pemain[uidBudi].nama === 'Budi', JSON.stringify(room1));
    await tidur(500);
    const [judulA, judulB] = [await teksDi(ani.page, 'judul-level'), await teksDi(budi.page, 'judul-level')];
    cek('duel: timer 3 menit berjalan sama di kedua browser', /^Duel · (3:00|2:5\d)$/.test(judulA) && Math.abs(detik(judulA) - detik(judulB)) <= 1, `${judulA} | ${judulB}`);
    const [pesanA, pesanB] = [await teksDi(ani.page, 'pesan-solo'), await teksDi(budi.page, 'pesan-solo')];
    cek('duel: masing-masing melihat nama lawannya', /Budi/.test(pesanA) && /Ani/.test(pesanB), `${pesanA} | ${pesanB}`);
    const papanSama = await Promise.all([ani, budi].map((p) => p.page.evaluate(() => [...document.querySelectorAll('.slot')].map((s) => s.getAttribute('aria-label')).join('|'))));
    cek('duel: kedua pemain mendapat puzzle yang sama', papanSama[0] === papanSama[1] && papanSama[0].length > 20);
    await ani.page.screenshot({ path: path.join(FOTO, 'emulator-duel.png') });

    await keLobi(cici);
    await gabung(cici, kode1);
    await tunggu(cici.page, () => !document.getElementById('galat-online').hidden, 15000);
    cek('duel: orang ketiga ditolak dengan penjelasan', /sudah berisi dua pemain/.test(await galatTampil(cici.page) || ''), String(await galatTampil(cici.page)));

    const puzzle1 = await dataPuzzle(ani.page, room1);
    await isiSemua(budi.page, puzzle1, { tukar: true });
    await klik(budi.page, 'tombol-kunci');
    await tidur(1200);
    const beku = await teksDi(budi.page, 'tombol-kunci');
    cek('duel: kunci salah membekukan tombol 5 detik dan tidak dikirim', /^Tunggu [345] detik$/.test(beku) && (await bacaAdmin(`rooms/${kode1}/jawaban`)) === null, beku);

    await isiSemua(ani.page, puzzle1);
    await klik(ani.page, 'tombol-kunci');
    await Promise.all([adaHasil(ani.page), adaHasil(budi.page)]);
    const [menang, kalah] = [await hasilTampil(ani.page), await hasilTampil(budi.page)];
    cek('duel: yang mengunci benar lebih dulu menang', menang.tampil && menang.judul === 'Kamu menang!' && menang.detail === 'Kamu mengunci jawaban benar lebih dulu.', JSON.stringify(menang));
    cek('duel: lawannya melihat kalah', kalah.tampil && kalah.judul === 'Kamu kalah' && /Ani/.test(kalah.detail), JSON.stringify(kalah));
    const akhir1 = await bacaAdmin(`rooms/${kode1}`);
    cek('duel: database hanya menyimpan papan dan waktunya, tanpa field pemenang', !!akhir1.jawaban && akhir1.jawaban[uidAni].papan.join() === puzzle1.solusi.join()
      && akhir1.jawaban[uidAni].pada >= akhir1.mulaiPada && !akhir1.jawaban[uidBudi] && !akhir1.akhir && !('pemenang' in akhir1), JSON.stringify(akhir1.jawaban));
    await budi.page.screenshot({ path: path.join(FOTO, 'emulator-kalah.png') });

    /* Main lagi */
    await klik(ani.page, 'tombol-level-lanjut');
    await tunggu(ani.page, () => !document.getElementById('online-tunggu').hidden && /Menunggu lawan/.test(document.getElementById('status-tunggu').textContent), 30000);
    const kode2 = await teksDi(ani.page, 'kode-room');
    const diajak = await tunggu(budi.page, () => document.getElementById('tombol-level-lanjut').textContent === 'Gabung ronde berikutnya', 10000);
    cek('main lagi: room baru dibuat dan lawan menerima ajakan', D.kodeSah(kode2) && kode2 !== kode1 && diajak && (await bacaAdmin(`rooms/${kode1}/lanjut`)) === kode2, `${kode2}, ${await teksDi(budi.page, 'tombol-level-lanjut')}`);
    await klik(budi.page, 'tombol-level-lanjut');
    const ronde2 = (await Promise.all([papanTampil(ani), papanTampil(budi)])).every(Boolean);
    cek('main lagi: ronde kedua dimulai di kedua browser', ronde2, `${await galatTampil(budi.page)}`);

    /* Memuat ulang halaman di tengah duel, lalu masuk lagi */
    await budi.page.reload();
    await tidur(700);
    const terputus = await tunggu(ani.page, () => /Budi terputus/.test(document.getElementById('pesan-solo').textContent), 10000);
    cek('putus: lawan yang memuat ulang halaman terlihat terputus', terputus, await teksDi(ani.page, 'pesan-solo'));
    const putus2 = await bacaAdmin(`rooms/${kode2}/pemain/${uidBudi}`);
    cek('putus: server mencatat waktu putusnya', putus2.tersambung === false && Math.abs(putus2.putusPada - Date.now()) < 15000, JSON.stringify(putus2));
    await keLobi(budi);
    const namaTersimpan = await budi.page.evaluate(() => localStorage.getItem('setdoku-nama'));
    await gabung(budi, kode2);
    const masukLagi = await papanTampil(budi);
    cek('putus: pemain masuk lagi lewat kode dengan ID yang sama', masukLagi && (await uidDi(budi.page)) === uidBudi && namaTersimpan === 'Budi', `${await galatTampil(budi.page)}`);
    const kembali = await tunggu(ani.page, () => !/terputus/.test(document.getElementById('pesan-solo').textContent), 10000);
    cek('putus: lawan melihatnya tersambung lagi, dan duel lanjut', kembali && (await bacaAdmin(`rooms/${kode2}/pemain/${uidBudi}/tersambung`)) === true && !(await hasilTampil(ani.page)).tampil, await teksDi(ani.page, 'pesan-solo'));

    /* Menyerah */
    await klik(budi.page, 'tombol-solo-keluar');
    await tidur(500);
    await klik(budi.page, 'tombol-yakin-keluar');
    await adaHasil(ani.page);
    const ditinggal = await hasilTampil(ani.page);
    cek('menyerah: lawan yang keluar di tengah duel membuat pemain ini menang', ditinggal.tampil && ditinggal.judul === 'Kamu menang!' && ditinggal.detail === 'Budi keluar dari duel.', JSON.stringify(ditinggal));
    cek('menyerah: yang keluar kembali ke lobi', await tunggu(budi.page, () => !document.getElementById('online-lobi').hidden && document.getElementById('layar-solo').hidden, 5000));

    /* Koneksi putus lebih dari 30 detik */
    await klik(ani.page, 'tombol-level-peta');
    await tunggu(ani.page, () => !document.getElementById('online-lobi').hidden && document.getElementById('layar-hasil').hidden, 5000);
    const kode3 = await buatRoom(ani, 'medium');
    await gabung(budi, kode3);
    const ronde3 = (await Promise.all([papanTampil(ani), papanTampil(budi)])).every(Boolean);
    const judul3 = await teksDi(ani.page, 'judul-level');
    cek('duel ketiga: tingkat Sedang memakai timer 5 menit', ronde3 && /^Duel · (5:00|4:5\d)$/.test(judul3), judul3);
    await budi.konteks.close();
    const hilang = await tunggu(ani.page, () => /Budi terputus/.test(document.getElementById('pesan-solo').textContent), 10000);
    cek('putus: lawan yang menutup browser terlihat terputus', hilang, await teksDi(ani.page, 'pesan-solo'));
    console.log('   menunggu 30 detik sampai klaim menang dibolehkan…');
    await tidur(20000);
    cek('putus: belum 30 detik, belum ada hasil', !(await hasilTampil(ani.page)).tampil && (await bacaAdmin(`rooms/${kode3}/akhir`)) === null);
    await adaHasil(ani.page, 25000);
    const klaim = await hasilTampil(ani.page);
    const akhir3 = await bacaAdmin(`rooms/${kode3}/akhir`);
    cek('putus: setelah 30 detik pemain ini menang', klaim.tampil && klaim.judul === 'Kamu menang!' && klaim.detail === 'Budi terputus lebih dari 30 detik.', JSON.stringify(klaim));
    cek('putus: klaimnya tercatat di database dan lolos aturan', !!akhir3 && akhir3.pemenang === uidAni && akhir3.alasan === 'putus', JSON.stringify(akhir3));

    /* Tamu keluar sebelum duel dimulai, saat pembuat room sedang membuka aplikasi lain */
    await klik(ani.page, 'tombol-level-peta');
    await tunggu(ani.page, () => !document.getElementById('online-lobi').hidden && document.getElementById('layar-hasil').hidden, 5000);
    const kode4 = await buatRoom(ani);
    await gabung(cici, kode4);
    const ciciMasuk = await tunggu(cici.page, () => !document.getElementById('online-tunggu').hidden || !document.getElementById('layar-solo').hidden, 15000);
    cek('duel keempat: pemain lain bisa bergabung ke room baru', ciciMasuk, String(await galatTampil(cici.page)));
  } finally {
    cek('duel: tidak ada galat halaman atau console', galat.length === 0, galat.slice(0, 5).join(' | '));
    await browser.close();
    server.close();
  }
}

(async () => {
  try {
    await pemainBaru();
  } catch (e) {
    console.error('Firebase Emulator tidak hidup. Jalankan lewat: npm run uji:emulator');
    console.error(e.cause ? e.cause.message : e.message);
    process.exit(2);
  }
  const pilihan = process.argv[2];
  try {
    await pasangAturan();
  } catch (e) {
    cek('aturan: database.rules.json diterima emulator', false, e.message);
  }
  for (const [nama, fungsi] of Object.entries({ aturan: ujiAturan, duel: () => ujiDuel('duel'), waktu: () => ujiDuel('waktu') })) {
    if (pilihan && pilihan !== nama) continue;
    try {
      await fungsi();
    } catch (e) {
      cek(`${nama}: berjalan sampai selesai`, false, e.stack || e.message);
    }
  }
  const gagal = hasil.filter((h) => !h.lolos);
  console.log(`\n${hasil.length - gagal.length}/${hasil.length} lolos`);
  gagal.forEach((g) => console.log('  GAGAL: ' + g.nama));
  process.exit(gagal.length ? 1 : 0);
})();
