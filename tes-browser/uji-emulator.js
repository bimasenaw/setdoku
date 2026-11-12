// Uji duel online dengan Firebase Emulator. Dua hal yang tidak bisa diuji dengan server tiruan:
//   1. Aturan keamanan di database.rules.json, lewat permintaan REST sebagai pemain yang berbeda.
//   2. public/online.js yang sungguhan, lewat duel antara dua browser terpisah.
// Jalankan: npm run uji:emulator. Butuh Java, dan internet untuk SDK Firebase dari CDN.
// Satu kelompok saja: npm run uji:emulator -- aturan (atau duel, atau waktu).
// Kelompok waktu menunggu satu ronde 3 menit sampai habis, jadi seluruh uji memakan sekitar 6 menit.
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

const ATUR = { kesulitan: 'easy', target: 3, sistem: 'rebutan', rev: 0 };

function isiRoom(uid, tambahan = {}) {
  return {
    v: D.VERSI, dibuat: SV, tuan: uid, sidik: D.sidikKumpulan(LEVEL), atur: ATUR,
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
  const daftar = D.pilihDaftarPuzzle(LEVEL, ATUR); // 5 puzzle, ronde 0 sampai 4
  const papan = [0, 1, 2, 3, 4, 5, 6, 7, 80];
  const siap = (kode, p, nilai) => rest('PUT', room(kode, 'pemain', p.uid, 'siap'), p.token, nilai);
  const mulai = (kode, p, isi = {}) => rest('PATCH', room(kode), p.token, { mulaiPada: SV, puzzle: daftar, ...isi });
  const jawab = (kode, r, p, isi = {}) => rest('PUT', room(kode, 'ronde', r, p.uid), p.token, { papan, pada: SV, ...isi });
  const klaim = (kode, p, isi = {}) => rest('PUT', room(kode, 'akhir'), p.token, { pemenang: p.uid, alasan: 'putus', pada: SV, ...isi });
  const buat = (kode, p, tambahan) => rest('PUT', room(kode), p.token, isiRoom(p.uid, tambahan));

  const k = D.buatKode();

  /* Membaca dan membuat */
  await tolak('membaca room tanpa login', rest('GET', room(k), null));
  await tolak('membaca daftar semua room', rest('GET', 'rooms', a.token));
  await tolak('membuat room tanpa login', rest('PUT', room(k), null, isiRoom(a.uid)));
  await tolak('menulis di luar rooms', rest('PUT', 'lain/x', a.token, 1));
  await tolak('kode room huruf kecil', buat('abcde', a));
  await tolak('kode room 6 karakter', buat('ABCDEF', a));
  await tolak('kode room dengan angka 0', buat('ABCD0', a));
  await tolak('kode room dengan huruf I', buat('ABCDI', a));
  await tolak('room atas nama orang lain', rest('PUT', room(k), a.token, isiRoom(b.uid)));
  await tolak('room dengan waktu dibuat karangan', buat(k, a, { dibuat: Date.now() - 3600000 }));
  await tolak('room dengan versi lama', buat(k, a, { v: 1 }));
  await tolak('room dengan field asing', buat(k, a, { hadiah: 1 }));
  await tolak('room tanpa pengaturan', buat(k, a, { atur: null }));
  await tolak('pengaturan dengan tingkat asing', buat(k, a, { atur: { ...ATUR, kesulitan: 'dewa' } }));
  await tolak('pengaturan dengan 4 poin', buat(k, a, { atur: { ...ATUR, target: 4 } }));
  await tolak('pengaturan dengan sistem asing', buat(k, a, { atur: { ...ATUR, sistem: 'acak' } }));
  await tolak('pengaturan tanpa nomor versi', buat(k, a, { atur: { kesulitan: 'easy', target: 3, sistem: 'rebutan' } }));
  await tolak('pengaturan dengan nomor versi negatif', buat(k, a, { atur: { ...ATUR, rev: -1 } }));
  await tolak('pengaturan dengan field asing', buat(k, a, { atur: { ...ATUR, curang: true } }));
  await tolak('room tanpa data pembuatnya', buat(k, a, { pemain: { [b.uid]: { nama: 'Budi', tersambung: true } } }));
  await tolak('nama pemain 2 huruf', buat(k, a, { pemain: { [a.uid]: { nama: 'ab', tersambung: true } } }));
  await tolak('nama pemain 33 huruf', buat(k, a, { pemain: { [a.uid]: { nama: 'x'.repeat(33), tersambung: true } } }));
  await tolak('room yang langsung berisi tamu', buat(k, a, { tamu: b.uid, pemain: { [a.uid]: { nama: 'Ani', tersambung: true }, [b.uid]: { nama: 'Budi', tersambung: true } } }));
  await tolak('room yang langsung dimulai', buat(k, a, { mulaiPada: SV, puzzle: daftar }));
  await tolak('room yang langsung berisi jawaban', buat(k, a, { ronde: { 0: { [a.uid]: { papan, pada: SV } } } }));
  await tolak('room yang langsung berisi ajakan main lagi', buat(k, a, { lanjut: D.buatKode() }));
  await tolak('room yang langsung berisi hasil', buat(k, a, { akhir: { pemenang: a.uid, alasan: 'putus', pada: SV } }));
  await boleh('membuat room yang sah', buat(k, a));
  const dibuat = await bacaAdmin(room(k, 'dibuat'));
  cek('aturan: waktu dibuat diisi server', Math.abs(dibuat - Date.now()) < 5000, String(dibuat));
  await tolak('menimpa room orang lain', buat(k, b));
  await tolak('menimpa room sendiri yang masih baru', buat(k, a));
  await boleh('calon tamu membaca room yang belum berisi tamu', rest('GET', room(k), c.token));

  /* Pengaturan */
  await tolak('orang lain mengubah pengaturan', rest('PUT', room(k, 'atur'), c.token, { ...ATUR, target: 5, rev: 1 }));
  await tolak('mengubah pengaturan tanpa menaikkan nomor versinya', rest('PUT', room(k, 'atur'), a.token, { ...ATUR, target: 5 }));
  await tolak('mengubah poin target menjadi 4', rest('PUT', room(k, 'atur'), a.token, { ...ATUR, target: 4, rev: 1 }));
  await tolak('menghapus pengaturan', rest('DELETE', room(k, 'atur'), a.token));
  await boleh('pembuat room mengubah pengaturan', rest('PUT', room(k, 'atur'), a.token, { kesulitan: 'hard', target: 10, sistem: 'balapan', rev: 1 }));
  await boleh('pembuat room mengubah pengaturan lagi', rest('PUT', room(k, 'atur'), a.token, { ...ATUR, rev: 2 }));

  /* Bergabung */
  await tolak('pembuat menjadi tamu di room sendiri', gabung(k, a));
  await tolak('mendaftarkan orang lain sebagai tamu', rest('PUT', room(k, 'tamu'), c.token, b.uid));
  await tolak('menjadi tamu tanpa data pemain', rest('PUT', room(k, 'tamu'), b.token, b.uid));
  await tolak('menulis data pemain tanpa menjadi tamu', rest('PUT', room(k, 'pemain', c.uid), c.token, { nama: 'Cici', tersambung: true }));
  await boleh('bergabung sebagai tamu', gabung(k, b));
  await tolak('orang ketiga membaca room berisi dua pemain', rest('GET', room(k), c.token));
  await tolak('orang ketiga bergabung', gabung(k, c, 'Cici'));
  await tolak('orang ketiga menulis data pemain', rest('PUT', room(k, 'pemain', c.uid), c.token, { nama: 'Cici', tersambung: true }));
  await boleh('pemain membaca room-nya', rest('GET', room(k), b.token));
  await tolak('tamu mengubah pengaturan', rest('PUT', room(k, 'atur'), b.token, { ...ATUR, target: 10, rev: 3 }));

  /* Siap dan memulai */
  await tolak('memulai sebelum ada yang siap', mulai(k, a));
  await tolak('menandai lawan siap', rest('PUT', room(k, 'pemain', b.uid, 'siap'), a.token, 2));
  await tolak('tanda siap bukan angka', siap(k, a, true));
  await boleh('pembuat room siap', siap(k, a, 2));
  await tolak('memulai saat tamu belum siap', mulai(k, a));
  await boleh('tamu siap untuk pengaturan yang lama', siap(k, b, 1));
  await tolak('memulai saat tamu baru menyetujui pengaturan lama', mulai(k, a));
  await boleh('tamu siap', siap(k, b, 2));
  await boleh('tamu membatalkan siap', siap(k, b, -1));
  await tolak('memulai setelah tamu membatalkan siap', mulai(k, a));
  await boleh('tamu siap lagi', siap(k, b, 2));
  await tolak('mengirim jawaban sebelum mulai', jawab(k, 0, a));
  await tolak('mengajak main lagi sebelum mulai', rest('PUT', room(k, 'lanjut'), a.token, D.buatKode()));
  await tolak('mengklaim menang sebelum mulai', klaim(k, a));
  await tolak('tamu memulai', mulai(k, b));
  await tolak('waktu mulai tanpa daftar puzzle', rest('PUT', room(k, 'mulaiPada'), a.token, SV));
  await tolak('daftar puzzle tanpa waktu mulai', rest('PUT', room(k, 'puzzle'), a.token, daftar));
  await tolak('waktu mulai karangan', mulai(k, a, { mulaiPada: Date.now() - 600000 }));
  await tolak('mengubah pengaturan sambil memulai', mulai(k, a, { atur: { ...ATUR, target: 10, rev: 3 } }));
  await tolak('daftar puzzle 20 ronde', mulai(k, a, { puzzle: Array.from({ length: 20 }, (_, i) => daftar[i % 5]) }));
  await tolak('puzzle dengan level di luar 1-100', mulai(k, a, { puzzle: daftar.map((p, i) => (i === 2 ? { ...p, level: 101 } : p)) }));
  await tolak('puzzle dengan field asing', mulai(k, a, { puzzle: daftar.map((p, i) => (i === 2 ? { ...p, solusi: [1] } : p)) }));
  await boleh('pembuat room memulai setelah keduanya siap', mulai(k, a));
  const awal = await bacaAdmin(room(k));
  cek('aturan: waktu mulai diisi server, dan daftar puzzle tersimpan', Math.abs(awal.mulaiPada - Date.now()) < 5000 && Object.keys(awal.puzzle).length === 5, JSON.stringify(awal.puzzle));
  await tolak('memulai dua kali', mulai(k, a));
  await tolak('mengganti daftar puzzle', rest('PUT', room(k, 'puzzle'), a.token, daftar.slice().reverse()));
  await tolak('membatalkan waktu mulai', rest('DELETE', room(k, 'mulaiPada'), a.token));
  await tolak('mengubah pengaturan setelah mulai', rest('PUT', room(k, 'atur'), a.token, { ...ATUR, target: 10, rev: 9 }));

  /* Data pemain */
  await tolak('mengubah data pemain lawan', rest('PATCH', room(k, 'pemain', b.uid), a.token, { tersambung: false }));
  await tolak('menyerah atas nama lawan', rest('PUT', room(k, 'pemain', b.uid, 'menyerah'), a.token, SV));
  await tolak('mengganti nama di tengah duel', rest('PATCH', room(k, 'pemain', a.uid), a.token, { nama: 'Lain' }));
  await tolak('waktu putus di masa depan', rest('PATCH', room(k, 'pemain', a.uid), a.token, { tersambung: false, putusPada: Date.now() + 600000 }));
  await tolak('field asing di data pemain', rest('PATCH', room(k, 'pemain', a.uid), a.token, { skor: 9 }));
  await tolak('menghapus data pemain sendiri', rest('DELETE', room(k, 'pemain', a.uid), a.token));
  await boleh('menandai diri terputus', rest('PATCH', room(k, 'pemain', a.uid), a.token, { tersambung: false, putusPada: SV }));
  await boleh('menandai diri tersambung lagi', rest('PATCH', room(k, 'pemain', a.uid), a.token, { tersambung: true, putusPada: null }));
  await boleh('melaporkan progres', rest('PUT', room(k, 'pemain', a.uid, 'maju'), a.token, 23));
  await tolak('progres di luar 0-189', rest('PUT', room(k, 'pemain', a.uid, 'maju'), a.token, 190));
  await tolak('progres pecahan', rest('PUT', room(k, 'pemain', a.uid, 'maju'), a.token, 2.5));
  await tolak('melaporkan progres lawan', rest('PUT', room(k, 'pemain', b.uid, 'maju'), a.token, 44));

  /* Jawaban per ronde */
  await tolak('mengirim jawaban atas nama lawan', rest('PUT', room(k, 'ronde', 0, b.uid), a.token, { papan, pada: SV }));
  await tolak('orang ketiga mengirim jawaban', jawab(k, 0, c));
  await tolak('jawaban untuk ronde di luar daftar puzzle', jawab(k, 5, a));
  await tolak('jawaban untuk ronde bernama asing', jawab(k, 'x', a));
  await tolak('papan berisi 8 kartu', jawab(k, 0, a, { papan: papan.slice(0, 8) }));
  await tolak('papan berisi 10 kartu', jawab(k, 0, a, { papan: [...papan, 9] }));
  await tolak('kartu nomor 81', jawab(k, 0, a, { papan: [81, ...papan.slice(1)] }));
  await tolak('papan dengan slot kosong', jawab(k, 0, a, { papan: [-1, ...papan.slice(1)] }));
  await tolak('kartu pecahan', jawab(k, 0, a, { papan: [1.5, ...papan.slice(1)] }));
  await tolak('kartu berupa teks', jawab(k, 0, a, { papan: ['0', ...papan.slice(1)] }));
  await tolak('waktu jawaban karangan', jawab(k, 0, a, { pada: Date.now() - 60000 }));
  await tolak('field asing di jawaban', jawab(k, 0, a, { benar: true }));
  await boleh('mengirim jawaban ronde 1', jawab(k, 0, a));
  await tolak('mengganti jawaban', jawab(k, 0, a));
  await tolak('menghapus jawaban', rest('DELETE', room(k, 'ronde', 0, a.uid), a.token));
  await boleh('lawan mengirim jawaban ronde 1', jawab(k, 0, b));
  await boleh('mengirim jawaban ronde terakhir', jawab(k, 4, a));
  await tolak('menghapus semua jawaban', rest('DELETE', room(k, 'ronde'), a.token));

  /* Klaim menang karena lawan putus */
  await tolak('klaim saat lawan masih tersambung', klaim(k, a));
  await boleh('lawan terputus 10 detik lalu', rest('PATCH', room(k, 'pemain', b.uid), b.token, { tersambung: false, putusPada: Date.now() - 10000 }));
  await tolak('klaim sebelum 30 detik', klaim(k, a));
  await boleh('lawan terputus 31 detik lalu', rest('PATCH', room(k, 'pemain', b.uid), b.token, { tersambung: false, putusPada: Date.now() - 31000 }));
  await tolak('klaim atas nama orang lain', klaim(k, a, { pemenang: b.uid }));
  await tolak('klaim dengan alasan selain putus', klaim(k, a, { alasan: 'poin' }));
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

  /* Menghapus dan memakai ulang kode. Batasnya di atas pertandingan terpanjang. */
  await tolak('menghapus room berisi dua pemain yang masih baru', rest('DELETE', room(k), a.token));
  const k2 = D.buatKode();
  await boleh('membuat room kedua', buat(k2, a));
  await tolak('menghapus room orang lain', rest('DELETE', room(k2), c.token));
  await boleh('pembuat menghapus room yang belum berisi tamu', rest('DELETE', room(k2), a.token));

  const lama = (menit, tambahan = {}) => isiRoom(a.uid, { dibuat: Date.now() - menit * 60000, atur: { ...ATUR, rev: 7 }, ...tambahan });
  const duaPemain = { tamu: b.uid, pemain: { [a.uid]: { nama: 'Ani', tersambung: false }, [b.uid]: { nama: 'Budi', tersambung: false } } };
  const [k3, k4, k5, k6, k7] = [D.buatKode(), D.buatKode(), D.buatKode(), D.buatKode(), D.buatKode()];
  await rest('PUT', room(k3), ADMIN, lama(181, duaPemain));
  await rest('PUT', room(k4), ADMIN, lama(179, duaPemain));
  await rest('PUT', room(k5), ADMIN, lama(241));
  await rest('PUT', room(k6), ADMIN, lama(239));
  await rest('PUT', room(k7), ADMIN, lama(11));
  await tolak('menghapus room dua pemain berumur 179 menit', rest('DELETE', room(k4), b.token));
  await tolak('orang ketiga menghapus room lama', rest('DELETE', room(k3), c.token));
  await boleh('pemain menghapus room-nya setelah 3 jam', rest('DELETE', room(k3), b.token));
  await tolak('merebut kode room berumur 239 menit', buat(k6, c));
  await boleh('memakai lagi kode room berumur lebih dari 4 jam', buat(k5, c));
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

// mode 'duel': alur utama. mode 'waktu': satu ronde dibiarkan sampai waktunya habis (3 menit).
async function ujiDuel(mode) {
  console.log(mode === 'waktu' ? '\n== Duel sungguhan: waktu ronde habis ==' : '\n== Duel sungguhan antara dua browser ==');
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
  const klik = (p, id) => p.page.evaluate((i) => document.getElementById(i).click(), id);
  const teksDi = (p, id) => p.page.evaluate((i) => document.getElementById(i).textContent, id);
  const tunggu = (p, fn, ms = 15000, ...arg) => p.page.waitForFunction(fn, { timeout: ms, polling: 100 }, ...arg).then(() => true, () => false);
  const uidDi = (p) => p.page.evaluate(() => Online.uid());
  const galatTampil = (p) => p.page.evaluate(() => {
    const el = document.getElementById('galat-online');
    return el.hidden ? null : el.textContent;
  });
  const semuaToast = (p) => p.page.evaluate(() => [...document.querySelectorAll('.toast .toast-teks')].map((e) => e.textContent));
  const keLobi = async (p) => {
    await klik(p, 'tombol-online');
    await tidur(500);
    await p.page.evaluate((n) => { document.getElementById('input-nama').value = n; }, p.nama);
  };
  const buatRoom = async (p) => {
    await klik(p, 'tombol-buat-room');
    const ada = await tunggu(p, () => !document.getElementById('online-tunggu').hidden && /Menunggu lawan/.test(document.getElementById('status-tunggu').textContent), 30000);
    return ada ? teksDi(p, 'kode-room') : null;
  };
  const gabung = async (p, kode) => {
    await p.page.evaluate((k) => { document.getElementById('input-kode').value = k; }, kode);
    await klik(p, 'tombol-gabung');
  };
  const diRuangTunggu = (p) => tunggu(p, () => !document.getElementById('online-tunggu').hidden && !document.getElementById('tombol-siap').hidden, 30000);
  const pilihAtur = (p, bagian, nilai) => p.page.evaluate((b, v) => document.querySelector(`#atur-tunggu [data-atur="${b}"][data-nilai="${v}"]`).click(), bagian, String(nilai));
  const aturTampil = (p) => p.page.evaluate(() => ['kesulitan', 'target', 'sistem'].map((b) => (document.querySelector(`#atur-tunggu [data-atur="${b}"][aria-checked="true"]`) || { dataset: {} }).dataset.nilai).join());
  const ruang = (p) => p.page.evaluate(() => ({
    saya: `${document.getElementById('nama-saya-tunggu').textContent}|${document.getElementById('siap-saya').textContent}`,
    lawan: `${document.getElementById('nama-lawan-tunggu').textContent}|${document.getElementById('siap-lawan').textContent}`,
    status: document.getElementById('status-tunggu').textContent,
    terkunci: [...document.querySelectorAll('#atur-tunggu [data-atur]')].every((b) => b.getAttribute('aria-disabled') === 'true'),
  }));
  // Menekan Siap, lalu menunggu sampai server mencatatnya.
  const siap = async (p) => {
    await klik(p, 'tombol-siap');
    return tunggu(p, () => document.getElementById('siap-saya').textContent === 'Siap' || document.getElementById('online-tunggu').hidden || document.getElementById('tombol-siap').hidden, 10000);
  };
  const papanTampil = (p, ms = 30000) => tunggu(p, () => !document.getElementById('layar-solo').hidden && !document.getElementById('layar-solo').classList.contains('pergi') && document.querySelectorAll('.slot').length === 9 && /^Duel · /.test(document.getElementById('judul-level').textContent) && !document.querySelector('.slot').disabled, ms);
  const dataPuzzle = (p, room, r) => p.page.evaluate((isi, n) => {
    const puzzle = DuelOnline.ambilDaftarPuzzle(DataLevel, isi)[n];
    return { papan: puzzle.papan, tersedia: puzzle.tersedia, solusi: DuelOnline.solusi(puzzle) };
  }, room, r);
  const isiSemua = async (p, puzzle, { tukar = false, hanya = Infinity } = {}) => {
    const kosong = puzzle.papan.flatMap((k, i) => (k === null ? [i] : [])).slice(0, hanya);
    const isi = Object.fromEntries(kosong.map((i) => [i, puzzle.solusi[i]]));
    if (tukar) [isi[kosong[0]], isi[kosong[1]]] = [isi[kosong[1]], isi[kosong[0]]];
    for (const i of kosong) {
      await p.page.evaluate((n, s) => {
        document.querySelectorAll('.sedia')[n].click();
        document.querySelectorAll('.slot')[s].click();
      }, puzzle.tersedia.indexOf(isi[i]), i);
      await tidur(60);
    }
    await p.page.waitForFunction(() => !document.querySelector('#lapisan-seret .hantu') && !document.querySelector('.menunggu'), { timeout: 5000 }).catch(() => {});
  };
  const selesaikan = async (p, room, r) => {
    await isiSemua(p, await dataPuzzle(p, room, r));
    await klik(p, 'tombol-kunci');
  };
  const bilah = (p) => p.page.evaluate(() => ({
    saya: document.getElementById('skor-saya').textContent,
    lawan: document.getElementById('skor-lawan').textContent,
    info: document.getElementById('info-duel').textContent,
    nama: document.getElementById('nama-lawan-duel').textContent,
    titik: document.querySelectorAll('#titik-lawan i').length,
    isi: document.querySelectorAll('#titik-lawan i.isi').length,
  }));
  const lapis = (p) => p.page.evaluate(() => (document.getElementById('lapis-ronde').hidden ? null : `${document.getElementById('judul-ronde').textContent} | ${document.getElementById('skor-ronde').textContent}`));
  const adaLapis = (p, pola, ms = 15000) => tunggu(p, (x) => !document.getElementById('lapis-ronde').hidden && new RegExp(x).test(document.getElementById('judul-ronde').textContent), ms, pola);
  // Papan ronde berikutnya sudah terpasang dan bisa dimainkan.
  const rondeMulai = (p, teks, ms = 15000) => tunggu(p, (t) => document.getElementById('lapis-ronde').hidden && document.getElementById('info-duel').textContent === t && !document.querySelector('.slot').disabled, ms, teks);
  const idPapan = (p) => p.page.evaluate(() => [...document.querySelectorAll('.slot')].map((s) => s.getAttribute('aria-label')).join('|'));
  const papanGanti = (p, lama, ms = 10000) => tunggu(p, (id) => [...document.querySelectorAll('.slot')].map((s) => s.getAttribute('aria-label')).join('|') !== id && !document.querySelector('.slot').disabled, ms, lama);
  const adaHasil = (p, ms = 15000) => p.page.waitForSelector('#layar-hasil:not([hidden])', { timeout: ms }).then(() => tidur(450), () => {});
  const hasilTampil = (p) => p.page.evaluate(() => ({
    tampil: !document.getElementById('layar-hasil').hidden,
    judul: document.getElementById('judul-hasil').textContent,
    detail: document.getElementById('detail-hasil').textContent,
    lanjut: document.getElementById('tombol-level-lanjut').hidden ? null : document.getElementById('tombol-level-lanjut').textContent,
  }));
  const detik = (judul) => {
    const m = /(\d+):(\d\d)$/.exec(judul);
    return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
  };
  // Keduanya menekan Siap, lalu papan ronde pertama tampil di kedua browser.
  const mulaiBerdua = async (a, b) => {
    await siap(b);
    await siap(a);
    return (await Promise.all([papanTampil(a), papanTampil(b)])).every(Boolean);
  };

  const skenarioWaktu = async () => {
    const ani = await pemain('Ani');
    const budi = await pemain('Budi');
    await keLobi(ani);
    const kode = await buatRoom(ani);
    await pilihAtur(ani, 'kesulitan', 'easy');
    await keLobi(budi);
    await gabung(budi, kode);
    await diRuangTunggu(budi);
    await tunggu(budi, () => document.querySelector('#atur-tunggu [data-nilai="easy"]').getAttribute('aria-checked') === 'true');
    cek('waktu habis: pertandingan rebutan Mudah dimulai', await mulaiBerdua(ani, budi), String(await galatTampil(budi)));
    const room = await bacaAdmin(`rooms/${kode}`);
    const tenggat = D.mulaiMain(room) + 3 * 60 * 1000;
    // Ani memasang satu kartu, supaya terlihat bahwa papan yang belum selesai tidak bernilai.
    await isiSemua(ani, await dataPuzzle(ani, room, 0), { hanya: 1 });
    console.log(`   menunggu ${Math.round((tenggat - Date.now()) / 1000)} detik sampai waktu ronde habis…`);
    await tidur(Math.max(0, tenggat - Date.now() - 4000));
    cek('waktu habis: sebelum tenggat ronde masih berjalan', (await lapis(ani)) === null && (await lapis(budi)) === null && (await bilah(ani)).info === 'Ronde 1/5', await teksDi(ani, 'judul-level'));
    const kosong = (await Promise.all([adaLapis(ani, '^Ronde 1: tidak ada poin$', 20000), adaLapis(budi, '^Ronde 1: tidak ada poin$', 20000)])).every(Boolean);
    cek('K-2: waktu ronde habis, kedua browser sepakat tidak ada poin', kosong, `${await lapis(ani)} || ${await lapis(budi)}`);
    cek('K-2: tidak ada papan yang dikirim saat waktu habis', (await bacaAdmin(`rooms/${kode}/ronde`)) === null);
    const lanjut = (await Promise.all([rondeMulai(ani, 'Ronde 2/5'), rondeMulai(budi, 'Ronde 2/5')])).every(Boolean);
    const [judulA, judulB] = [await teksDi(ani, 'judul-level'), await teksDi(budi, 'judul-level')];
    cek('S1-2: ronde 2 mulai bersamaan di kedua browser, dengan timer baru', lanjut && /^Duel · (3:00|2:5\d)$/.test(judulA) && Math.abs(detik(judulA) - detik(judulB)) <= 1 && (await idPapan(ani)) === (await idPapan(budi)), `${judulA} | ${judulB}`);
    await selesaikan(ani, room, 1);
    const menang = (await Promise.all([adaLapis(ani, '^Kamu menang ronde 2$'), adaLapis(budi, '^Ani menang ronde 2$')])).every(Boolean);
    cek('rebutan: ronde sesudah waktu habis tetap bisa dimenangkan', menang && (await lapis(ani)) === 'Kamu menang ronde 2 | 1 – 0', `${await lapis(ani)} || ${await lapis(budi)}`);
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

    /* Membuat room, keluar, lalu membuat lagi */
    await keLobi(ani);
    const kodeBatal = await buatRoom(ani);
    cek('duel: room dibuat lewat Firebase dan kodenya tampil', D.kodeSah(kodeBatal || ''), String(kodeBatal || await galatTampil(ani)));
    const uidAni = await uidDi(ani);
    const roomBatal = await bacaAdmin(`rooms/${kodeBatal}`);
    cek('duel: isi room di database sesuai rancangan', !!roomBatal && roomBatal.tuan === uidAni && roomBatal.v === D.VERSI && roomBatal.sidik === D.sidikKumpulan(LEVEL)
      && JSON.stringify(roomBatal.atur) === JSON.stringify({ kesulitan: 'medium', rev: 0, sistem: 'rebutan', target: 3 })
      && Math.abs(roomBatal.dibuat - Date.now()) < 30000 && roomBatal.pemain[uidAni].nama === 'Ani' && roomBatal.pemain[uidAni].tersambung === true, JSON.stringify(roomBatal));
    await klik(ani, 'tombol-batal-room');
    await tunggu(ani, () => !document.getElementById('online-lobi').hidden, 5000);
    await tidur(800);
    cek('duel: keluar dari room tanpa lawan menghapusnya dari database', (await bacaAdmin(`rooms/${kodeBatal}`)) === null);

    /* Ruang tunggu: pengaturan dan Siap */
    const kode1 = await buatRoom(ani);
    await pilihAtur(ani, 'kesulitan', 'easy');
    await tunggu(ani, () => document.querySelector('#atur-tunggu [data-nilai="easy"]').getAttribute('aria-checked') === 'true');
    await tidur(500);
    cek('T-2: pengaturan pembuat room tersimpan di database', JSON.stringify(await bacaAdmin(`rooms/${kode1}/atur`)) === JSON.stringify({ kesulitan: 'easy', rev: 1, sistem: 'rebutan', target: 3 }), JSON.stringify(await bacaAdmin(`rooms/${kode1}/atur`)));
    await keLobi(budi);
    await gabung(budi, kode1.toLowerCase());
    const masuk = await diRuangTunggu(budi);
    await diRuangTunggu(ani);
    const uidBudi = await uidDi(budi);
    const [ruangA, ruangB] = [await ruang(ani), await ruang(budi)];
    cek('T-1: kedua browser masuk ruang tunggu dan saling melihat nama', masuk && uidAni !== uidBudi && ruangA.saya === 'Ani|Belum siap' && ruangA.lawan === 'Budi|Belum siap' && ruangB.saya === 'Budi|Belum siap' && ruangB.lawan === 'Ani|Belum siap', `${JSON.stringify(ruangA)} ${JSON.stringify(ruangB)} ${await galatTampil(budi)}`);
    cek('T-2: tamu melihat pengaturan pembuat room, tanpa bisa mengubahnya', (await aturTampil(budi)) === 'easy,3,rebutan' && ruangB.terkunci && !ruangA.terkunci, await aturTampil(budi));
    await pilihAtur(budi, 'target', 10);
    await tidur(700);
    cek('T-2: ketukan tamu di pengaturan tidak mengubah database', (await bacaAdmin(`rooms/${kode1}/atur/target`)) === 3);

    await siap(budi);
    await tunggu(ani, () => document.getElementById('siap-lawan').textContent === 'Siap');
    cek('T-3: tanda siap tamu sampai ke pembuat room', (await ruang(ani)).lawan === 'Budi|Siap' && (await bacaAdmin(`rooms/${kode1}/pemain/${uidBudi}/siap`)) === 1);
    await tidur(1200);
    cek('T-5: baru satu pemain yang siap, pertandingan belum dimulai', (await bacaAdmin(`rooms/${kode1}/mulaiPada`)) === null);
    await pilihAtur(ani, 'target', 5);
    const batalSiap = await tunggu(budi, () => document.getElementById('siap-saya').textContent === 'Belum siap' && document.querySelector('#atur-tunggu [data-atur="target"][data-nilai="5"]').getAttribute('aria-checked') === 'true');
    cek('T-4: pengaturan yang diubah membatalkan siap tamu, dan tamu diberi tahu', batalSiap && (await semuaToast(budi)).includes('Pengaturan diubah') && (await ruang(ani)).lawan === 'Budi|Belum siap', JSON.stringify(await semuaToast(budi)));
    await pilihAtur(ani, 'target', 3);
    await tunggu(budi, () => document.querySelector('#atur-tunggu [data-atur="target"][data-nilai="3"]').getAttribute('aria-checked') === 'true');

    /* Rebutan: ronde 1 */
    const mulai = await mulaiBerdua(ani, budi);
    cek('T-5: setelah keduanya siap, papan ronde 1 tampil di kedua browser', mulai, `${await teksDi(ani, 'status-tunggu')} | ${await teksDi(budi, 'status-tunggu')}`);
    const room1 = await bacaAdmin(`rooms/${kode1}`);
    cek('duel: waktu mulai diisi server, dan daftar 5 puzzle-nya cocok dengan game ini', room1.tamu === uidBudi && Math.abs(room1.mulaiPada - Date.now()) < 30000 && Object.keys(room1.puzzle).length === 5 && !!D.ambilDaftarPuzzle(LEVEL, room1), JSON.stringify(room1.puzzle));
    await tidur(500);
    const [judulA, judulB] = [await teksDi(ani, 'judul-level'), await teksDi(budi, 'judul-level')];
    cek('duel: timer ronde 3 menit berjalan sama di kedua browser', /^Duel · (3:00|2:5\d)$/.test(judulA) && Math.abs(detik(judulA) - detik(judulB)) <= 1, `${judulA} | ${judulB}`);
    const [bilahA, bilahB] = [await bilah(ani), await bilah(budi)];
    cek('P-1: bilah skor 0-0, Ronde 1/5, dan nama lawan di kedua browser', bilahA.nama === 'Budi' && bilahB.nama === 'Ani' && [bilahA, bilahB].every((x) => x.saya === '0' && x.lawan === '0' && x.info === 'Ronde 1/5'), `${JSON.stringify(bilahA)} ${JSON.stringify(bilahB)}`);
    cek('duel: kedua pemain mendapat puzzle yang sama', (await idPapan(ani)) === (await idPapan(budi)) && (await idPapan(ani)).length > 20);
    await ani.page.screenshot({ path: path.join(FOTO, 'emulator-duel.png') });

    await keLobi(cici);
    await gabung(cici, kode1);
    await tunggu(cici, () => !document.getElementById('galat-online').hidden, 15000);
    cek('duel: orang ketiga ditolak dengan penjelasan', /sudah berisi dua pemain/.test(await galatTampil(cici) || ''), String(await galatTampil(cici)));

    const puzzle0 = await dataPuzzle(ani, room1, 0);
    await isiSemua(budi, puzzle0, { tukar: true });
    const terisi = await tunggu(ani, (n) => document.querySelectorAll('#titik-lawan i.isi').length === n, 8000, bilahA.titik);
    cek('P-2: progres lawan sampai ke browser satunya, tanpa kartunya', terisi && (await bacaAdmin(`rooms/${kode1}/pemain/${uidBudi}/maju`)) === bilahA.titik, JSON.stringify(await bilah(ani)));
    await klik(budi, 'tombol-kunci');
    await tidur(1200);
    const beku = await teksDi(budi, 'tombol-kunci');
    cek('K-5: kunci salah membekukan tombol 7 detik, dan tidak ada yang dikirim', /^Tunggu [567] detik$/.test(beku) && (await bacaAdmin(`rooms/${kode1}/ronde`)) === null && (await lapis(ani)) === null, beku);

    await isiSemua(ani, puzzle0);
    await klik(ani, 'tombol-kunci');
    const ronde1 = (await Promise.all([adaLapis(ani, '^Kamu menang ronde 1$'), adaLapis(budi, '^Ani menang ronde 1$')])).every(Boolean);
    cek('S1-1: yang mengunci benar lebih dulu dapat poin, dan keduanya melihatnya', ronde1 && (await lapis(ani)) === 'Kamu menang ronde 1 | 1 – 0' && (await lapis(budi)) === 'Ani menang ronde 1 | 0 – 1', `${await lapis(ani)} || ${await lapis(budi)}`);
    const sesudah1 = await bacaAdmin(`rooms/${kode1}`);
    cek('duel: database hanya menyimpan papan dan waktunya, tanpa skor atau pemenang', sesudah1.ronde[0][uidAni].papan.join() === puzzle0.solusi.join() && sesudah1.ronde[0][uidAni].pada >= D.mulaiMain(sesudah1)
      && !sesudah1.ronde[0][uidBudi] && !sesudah1.akhir && !('skor' in sesudah1) && !('pemenang' in sesudah1), JSON.stringify(sesudah1.ronde));
    await budi.page.screenshot({ path: path.join(FOTO, 'emulator-jeda.png') });

    /* Ronde 2: mulai bersamaan, lalu Budi memuat ulang halaman */
    const awal2 = Date.now();
    const ronde2 = (await Promise.all([rondeMulai(ani, 'Ronde 2/5'), rondeMulai(budi, 'Ronde 2/5')])).every(Boolean);
    const [judul2A, judul2B] = [await teksDi(ani, 'judul-level'), await teksDi(budi, 'judul-level')];
    cek('S1-2: setelah jeda 5 detik, ronde 2 mulai bersamaan dengan puzzle baru yang sama', ronde2 && Date.now() - awal2 > 2000 && (await idPapan(ani)) === (await idPapan(budi)) && Math.abs(detik(judul2A) - detik(judul2B)) <= 1 && /^Duel · (3:00|2:5\d)$/.test(judul2A), `${judul2A} | ${judul2B}`);
    cek('K-5: pembekuan tidak terbawa ke ronde berikutnya', (await teksDi(budi, 'tombol-kunci')) === 'Kunci jawaban');

    await budi.page.reload();
    await tidur(700);
    const terputus = await tunggu(ani, () => /Budi terputus/.test(document.getElementById('pesan-solo').textContent), 10000);
    cek('putus: lawan yang memuat ulang halaman terlihat terputus', terputus, await teksDi(ani, 'pesan-solo'));
    const putus2 = await bacaAdmin(`rooms/${kode1}/pemain/${uidBudi}`);
    cek('putus: server mencatat waktu putusnya', putus2.tersambung === false && Math.abs(putus2.putusPada - Date.now()) < 15000, JSON.stringify(putus2));
    await keLobi(budi);
    await gabung(budi, kode1);
    const masukLagi = await papanTampil(budi);
    await tidur(600);
    const bilahLagi = await bilah(budi);
    cek('putus: pemain masuk lagi lewat kode, dan skor serta rondenya tidak hilang', masukLagi && (await uidDi(budi)) === uidBudi && bilahLagi.info === 'Ronde 2/5' && bilahLagi.saya === '0' && bilahLagi.lawan === '1', JSON.stringify(bilahLagi));
    const kembali = await tunggu(ani, () => !/terputus/.test(document.getElementById('pesan-solo').textContent), 10000);
    cek('putus: lawan melihatnya tersambung lagi, dan pertandingan lanjut', kembali && (await bacaAdmin(`rooms/${kode1}/pemain/${uidBudi}/tersambung`)) === true && !(await hasilTampil(ani)).tampil, await teksDi(ani, 'pesan-solo'));

    /* Ronde 2 sampai 4: Budi menang satu ronde, lalu Ani mencapai 3 poin */
    await selesaikan(budi, room1, 1);
    const r2 = (await Promise.all([adaLapis(ani, '^Budi menang ronde 2$'), adaLapis(budi, '^Kamu menang ronde 2$')])).every(Boolean);
    cek('rebutan: ronde 2 dimenangkan lawan, skor 1-1', r2 && (await lapis(ani)) === 'Budi menang ronde 2 | 1 – 1', `${await lapis(ani)} || ${await lapis(budi)}`);
    await Promise.all([rondeMulai(ani, 'Ronde 3/5'), rondeMulai(budi, 'Ronde 3/5')]);
    await selesaikan(ani, room1, 2);
    await Promise.all([adaLapis(ani, '^Kamu menang ronde 3$'), adaLapis(budi, '^Ani menang ronde 3$')]);
    await Promise.all([rondeMulai(ani, 'Ronde 4/5'), rondeMulai(budi, 'Ronde 4/5')]);
    await selesaikan(ani, room1, 3);
    await Promise.all([adaHasil(ani), adaHasil(budi)]);
    const [menang, kalah] = [await hasilTampil(ani), await hasilTampil(budi)];
    cek('S1-5: yang pertama mencapai 3 poin menang pertandingan', menang.tampil && menang.judul === 'Kamu menang!' && menang.detail === 'Skor akhir 3–1.', JSON.stringify(menang));
    cek('S1-5: lawannya melihat kalah dengan skor yang sama', kalah.tampil && kalah.judul === 'Kamu kalah' && kalah.detail === 'Skor akhir 1–3.', JSON.stringify(kalah));
    const akhir1 = await bacaAdmin(`rooms/${kode1}`);
    cek('duel: empat ronde tercatat, dan hasilnya tidak ditulis siapa pun', Object.keys(akhir1.ronde).length === 4 && !akhir1.akhir && !('pemenang' in akhir1) && !akhir1.ronde[4], JSON.stringify(Object.keys(akhir1.ronde)));
    await budi.page.screenshot({ path: path.join(FOTO, 'emulator-kalah.png') });

    /* Main lagi, kali ini Balapan */
    await klik(ani, 'tombol-level-lanjut');
    await tunggu(ani, () => !document.getElementById('online-tunggu').hidden && /Menunggu lawan/.test(document.getElementById('status-tunggu').textContent), 30000);
    const kode2 = await teksDi(ani, 'kode-room');
    const diajak = await tunggu(budi, () => document.getElementById('tombol-level-lanjut').textContent === 'Gabung pertandingan baru', 10000);
    cek('main lagi: room baru dengan pengaturan yang sama, dan lawan menerima ajakan', D.kodeSah(kode2) && kode2 !== kode1 && diajak && (await bacaAdmin(`rooms/${kode1}/lanjut`)) === kode2
      && JSON.stringify(await bacaAdmin(`rooms/${kode2}/atur`)) === JSON.stringify({ kesulitan: 'easy', rev: 0, sistem: 'rebutan', target: 3 }), `${kode2}, ${await teksDi(budi, 'tombol-level-lanjut')}`);
    await klik(budi, 'tombol-level-lanjut');
    const ruangLagi = (await Promise.all([diRuangTunggu(ani), diRuangTunggu(budi)])).every(Boolean);
    cek('main lagi: keduanya kembali ke ruang tunggu, bukan langsung bermain', ruangLagi && (await bacaAdmin(`rooms/${kode2}/mulaiPada`)) === null, String(await galatTampil(budi)));
    await pilihAtur(ani, 'sistem', 'balapan');
    await tunggu(budi, () => document.querySelector('#atur-tunggu [data-nilai="balapan"]').getAttribute('aria-checked') === 'true');
    const balapan = await mulaiBerdua(ani, budi);
    const room2 = await bacaAdmin(`rooms/${kode2}`);
    await tidur(500);
    const judulBalap = await teksDi(ani, 'judul-level');
    cek('balapan: dimulai dengan 3 puzzle dan satu timer 9 menit', balapan && Object.keys(room2.puzzle).length === 3 && /^Duel · (9:00|8:5\d)$/.test(judulBalap) && (await bilah(budi)).nama === 'Ani · puzzle 1', judulBalap);

    const papanAni = await idPapan(ani);
    const papanBudi = await idPapan(budi);
    await selesaikan(ani, room2, 0);
    const aniLanjut = await papanGanti(ani, papanAni);
    await tunggu(budi, () => document.getElementById('skor-lawan').textContent === '1', 8000);
    const [balapA, balapB] = [await bilah(ani), await bilah(budi)];
    cek('S2-2: yang selesai langsung mendapat puzzle berikutnya, tanpa menunggu lawan', aniLanjut && balapA.saya === '1' && (await lapis(ani)) === null, JSON.stringify(balapA));
    cek('S2-1: yang tertinggal tetap di puzzle-nya, dan melihat lawan sudah di puzzle 2', (await idPapan(budi)) === papanBudi && balapB.saya === '0' && balapB.lawan === '1' && balapB.nama === 'Ani · puzzle 2', JSON.stringify(balapB));
    await selesaikan(budi, room2, 0);
    await papanGanti(budi, papanBudi);
    await tunggu(ani, () => document.getElementById('skor-lawan').textContent === '1', 8000);
    cek('K-1: puzzle yang selesai memberi poin untuk pemain itu sendiri, jadi skor 1-1', (await bilah(ani)).lawan === '1' && (await bilah(budi)).saya === '1' && (await bilah(ani)).nama === 'Budi · puzzle 2', JSON.stringify(await bilah(ani)));
    await ani.page.screenshot({ path: path.join(FOTO, 'emulator-balapan.png') });

    /* Menyerah di tengah balapan */
    await klik(budi, 'tombol-solo-keluar');
    await tidur(500);
    await klik(budi, 'tombol-yakin-keluar');
    await adaHasil(ani);
    const ditinggal = await hasilTampil(ani);
    cek('menyerah: lawan yang keluar di tengah pertandingan membuat pemain ini menang', ditinggal.tampil && ditinggal.judul === 'Kamu menang!' && ditinggal.detail === 'Budi keluar dari duel.', JSON.stringify(ditinggal));
    cek('menyerah: yang keluar kembali ke lobi', await tunggu(budi, () => !document.getElementById('online-lobi').hidden && document.getElementById('layar-solo').hidden, 5000));

    /* Balapan sampai selesai */
    await klik(ani, 'tombol-level-peta');
    await tunggu(ani, () => !document.getElementById('online-lobi').hidden && document.getElementById('layar-hasil').hidden, 5000);
    const kode3 = await buatRoom(ani);
    cek('pengaturan terakhir (Balapan) diingat saat membuat room baru', JSON.stringify(await bacaAdmin(`rooms/${kode3}/atur`)) === JSON.stringify({ kesulitan: 'easy', rev: 0, sistem: 'balapan', target: 3 }), JSON.stringify(await bacaAdmin(`rooms/${kode3}/atur`)));
    await gabung(budi, kode3);
    await Promise.all([diRuangTunggu(ani), diRuangTunggu(budi)]);
    await mulaiBerdua(ani, budi);
    const room3 = await bacaAdmin(`rooms/${kode3}`);
    for (let r = 0; r < 3; r++) {
      const lama = await idPapan(budi);
      await selesaikan(budi, room3, r);
      if (r < 2) await papanGanti(budi, lama);
    }
    await Promise.all([adaHasil(ani), adaHasil(budi)]);
    const [kalahBalap, menangBalap] = [await hasilTampil(ani), await hasilTampil(budi)];
    cek('K-1: yang pertama menyelesaikan 3 puzzle menang balapan, di kedua browser', menangBalap.judul === 'Kamu menang!' && menangBalap.detail === 'Skor akhir 3–0.' && kalahBalap.judul === 'Kamu kalah' && kalahBalap.detail === 'Skor akhir 0–3.', `${JSON.stringify(menangBalap)} ${JSON.stringify(kalahBalap)}`);

    /* Koneksi putus lebih dari 30 detik */
    await klik(ani, 'tombol-level-lanjut');
    await tunggu(ani, () => !document.getElementById('online-tunggu').hidden && /Menunggu lawan/.test(document.getElementById('status-tunggu').textContent), 30000);
    const kode4 = await teksDi(ani, 'kode-room');
    await tunggu(budi, () => document.getElementById('tombol-level-lanjut').textContent === 'Gabung pertandingan baru', 10000);
    await klik(budi, 'tombol-level-lanjut');
    await Promise.all([diRuangTunggu(ani), diRuangTunggu(budi)]);
    cek('pertandingan keempat dimulai', await mulaiBerdua(ani, budi));
    await budi.konteks.close();
    const hilang = await tunggu(ani, () => /Budi terputus/.test(document.getElementById('pesan-solo').textContent), 10000);
    cek('putus: lawan yang menutup browser terlihat terputus', hilang, await teksDi(ani, 'pesan-solo'));
    console.log('   menunggu 30 detik sampai klaim menang dibolehkan…');
    await tidur(20000);
    cek('putus: belum 30 detik, belum ada hasil', !(await hasilTampil(ani)).tampil && (await bacaAdmin(`rooms/${kode4}/akhir`)) === null);
    await adaHasil(ani, 25000);
    const klaim = await hasilTampil(ani);
    const akhir4 = await bacaAdmin(`rooms/${kode4}/akhir`);
    cek('putus: setelah 30 detik pemain ini menang seluruh pertandingan', klaim.tampil && klaim.judul === 'Kamu menang!' && klaim.detail === 'Budi terputus lebih dari 30 detik.', JSON.stringify(klaim));
    cek('putus: klaimnya tercatat di database dan lolos aturan', !!akhir4 && akhir4.pemenang === uidAni && akhir4.alasan === 'putus', JSON.stringify(akhir4));

    /* Tamu keluar dari ruang tunggu */
    await klik(ani, 'tombol-level-peta');
    await tunggu(ani, () => !document.getElementById('online-lobi').hidden && document.getElementById('layar-hasil').hidden, 5000);
    const kode5 = await buatRoom(ani);
    await gabung(cici, kode5);
    cek('ruang tunggu: pemain lain bisa bergabung ke room baru', await diRuangTunggu(cici), String(await galatTampil(cici)));
    await klik(cici, 'tombol-batal-room');
    const batal = await tunggu(ani, () => !document.getElementById('online-lobi').hidden && /Cici keluar sebelum duel dimulai/.test(document.getElementById('galat-online').textContent), 10000);
    cek('T-6: tamu yang keluar dari ruang tunggu mengembalikan pembuat room ke lobi', batal, String(await galatTampil(ani)));
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
