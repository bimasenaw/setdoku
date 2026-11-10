const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../public/progres.js');

const MENIT = 60000;
const T0 = 1_000_000_000_000;

test('progres baru: 5 nyawa, tanpa Stars, hanya level 1 terbuka', () => {
  const p = R.buatProgres();
  assert.equal(p.nyawa, 5);
  assert.equal(p.totalStars, 0);
  assert.equal(p.wallet, 0);
  assert.equal(R.levelTerbuka(p, 1), true);
  assert.equal(R.levelTerbuka(p, 2), false);
});

test('P-01/G-10: nyawa dipotong saat Ranked dimulai, bukan saat kalah', () => {
  const p = R.buatProgres();
  assert.equal(R.mulaiRanked(p, 1, T0), true);
  assert.equal(p.nyawa, 4);
  assert.equal(p.berjalan, 1);
  // Memuat ulang halaman: nyawa tetap 4, tidak kembali.
  const lagi = R.muat(R.serialisasi(p));
  assert.equal(lagi.nyawa, 4);
  assert.equal(lagi.berjalan, 1);
});

test('P-01: menang mengembalikan nyawa, gagal tidak', () => {
  const p = R.buatProgres();
  R.mulaiRanked(p, 1, T0);
  R.menangRanked(p, 1, 2);
  assert.equal(p.nyawa, 5);
  assert.equal(p.berjalan, null);

  R.mulaiRanked(p, 1, T0);
  R.gagalRanked(p);
  assert.equal(p.nyawa, 4);
  assert.equal(p.berjalan, null);
});

test('menang tanpa mulai lewat mulaiRanked tidak menambah nyawa melebihi batas', () => {
  const p = R.buatProgres();
  R.menangRanked(p, 1, 1);
  assert.equal(p.nyawa, 5);
});

test('P-01: nyawa habis menolak Ranked, tetapi level tetap dihitung terbuka', () => {
  const p = R.buatProgres();
  for (let i = 0; i < 5; i++) {
    assert.equal(R.mulaiRanked(p, 1, T0), true);
    R.gagalRanked(p);
  }
  assert.equal(p.nyawa, 0);
  assert.equal(R.mulaiRanked(p, 1, T0), false);
  assert.equal(p.nyawa, 0);
});

test('P-01: Ranked pada level terkunci ditolak dan tidak memotong nyawa', () => {
  const p = R.buatProgres();
  assert.equal(R.mulaiRanked(p, 2, T0), false);
  assert.equal(p.nyawa, 5);
});

test('P-01: satu nyawa pulih tiap 20 menit sampai penuh', () => {
  const p = R.buatProgres();
  for (let i = 0; i < 3; i++) { R.mulaiRanked(p, 1, T0); R.gagalRanked(p); }
  assert.equal(p.nyawa, 2);
  R.pulihkanNyawa(p, T0 + 19 * MENIT);
  assert.equal(p.nyawa, 2);
  R.pulihkanNyawa(p, T0 + 20 * MENIT);
  assert.equal(p.nyawa, 3);
  R.pulihkanNyawa(p, T0 + 65 * MENIT);
  assert.equal(p.nyawa, 5);
  assert.equal(p.pulihSejak, null);
  R.pulihkanNyawa(p, T0 + 500 * MENIT);
  assert.equal(p.nyawa, 5);
});

test('pemulihan menyimpan sisa menit, bukan membulatkannya', () => {
  const p = R.buatProgres();
  for (let i = 0; i < 2; i++) { R.mulaiRanked(p, 1, T0); R.gagalRanked(p); }
  R.pulihkanNyawa(p, T0 + 30 * MENIT);
  assert.equal(p.nyawa, 4);
  assert.equal(R.sisaPulihMs(p, T0 + 30 * MENIT), 10 * MENIT);
  R.pulihkanNyawa(p, T0 + 40 * MENIT);
  assert.equal(p.nyawa, 5);
  assert.equal(R.sisaPulihMs(p, T0 + 40 * MENIT), null);
});

test('jam perangkat mundur tidak membuat nyawa pulih lebih cepat', () => {
  const p = R.buatProgres();
  R.mulaiRanked(p, 1, T0);
  R.gagalRanked(p);
  R.pulihkanNyawa(p, T0 - 100 * MENIT);
  assert.equal(p.nyawa, 4);
  R.pulihkanNyawa(p, T0 - 100 * MENIT + 19 * MENIT);
  assert.equal(p.nyawa, 4);
  R.pulihkanNyawa(p, T0 - 100 * MENIT + 20 * MENIT);
  assert.equal(p.nyawa, 5);
});

test('S-09: nilaiStars mengikuti sisa waktu', () => {
  const d = 180000;
  assert.equal(R.nilaiStars(0, d), 0);
  assert.equal(R.nilaiStars(-5, d), 0);
  assert.equal(R.nilaiStars(1, d), 1);
  assert.equal(R.nilaiStars(d * 0.249, d), 1);
  assert.equal(R.nilaiStars(d * 0.25, d), 2);
  assert.equal(R.nilaiStars(d * 0.499, d), 2);
  assert.equal(R.nilaiStars(d * 0.5, d), 3);
  assert.equal(R.nilaiStars(d, d), 3);
});

test('P-05: Hint atau Extra Time membatasi hadiah sampai 2 bintang', () => {
  const d = 180000;
  assert.equal(R.nilaiStars(d, d, { hint: true }), 2);
  assert.equal(R.nilaiStars(d, d, { waktu: true }), 2);
  assert.equal(R.nilaiStars(d * 0.3, d, { waktu: true }), 2);
  assert.equal(R.nilaiStars(d * 0.1, d, { hint: true, waktu: true }), 1);
  // K-5: sisa dibandingkan dengan durasi dasar, jadi sisa lebih dari durasi tetap dibatasi.
  assert.equal(R.nilaiStars(d + 30000, d, { waktu: true }), 2);
});

test('S-09/P-02: Stars dihitung dari rekor, dan Total Stars serta Wallet naik bersama', () => {
  const p = R.buatProgres();
  R.mulaiRanked(p, 1, T0);
  assert.deepEqual(R.menangRanked(p, 1, 1), { tambah: 1, rekorBaru: true });
  assert.equal(p.totalStars, 1);
  assert.equal(p.wallet, 1);

  R.mulaiRanked(p, 1, T0);
  assert.deepEqual(R.menangRanked(p, 1, 3), { tambah: 2, rekorBaru: true });
  assert.equal(p.totalStars, 3);
  assert.equal(p.rekor[1], 3);

  R.mulaiRanked(p, 1, T0);
  assert.deepEqual(R.menangRanked(p, 1, 2), { tambah: 0, rekorBaru: false });
  assert.equal(p.rekor[1], 3);
  assert.equal(p.totalStars, 3);
  assert.equal(p.nyawa, 5);
});

test('P-06: menang Ranked membuka level berikutnya, dan 20 level maksimal 60 bintang', () => {
  const p = R.buatProgres();
  for (let level = 1; level <= 20; level++) {
    assert.equal(R.levelTerbuka(p, level), true, `level ${level} terbuka`);
    assert.equal(R.levelTerbuka(p, level + 1), false);
    assert.equal(R.mulaiRanked(p, level, T0), true);
    R.menangRanked(p, level, 3);
  }
  assert.equal(p.totalStars, 60);
  assert.equal(p.wallet, 60);
  assert.equal(p.nyawa, 5);
});

test('P-03: beli hanya mengurangi Wallet, Total Stars tetap', () => {
  const p = R.buatProgres();
  p.totalStars = 30;
  p.wallet = 20;
  assert.equal(R.beli(p, 'waktu'), true);
  assert.equal(p.wallet, 12);
  assert.equal(p.totalStars, 30);
  assert.equal(p.barang.waktu, 1);
});

test('P-03: saldo kurang, barang tidak dikenal, dan skin yang sudah dimiliki ditolak', () => {
  const p = R.buatProgres();
  p.wallet = 4;
  assert.equal(R.beli(p, 'heart'), false);
  assert.equal(R.beli(p, 'tidak-ada'), false);
  assert.equal(p.wallet, 4);
  assert.equal(p.barang.heart, 0);

  p.wallet = 200;
  assert.equal(R.beli(p, 'skin'), true);
  assert.deepEqual(p.koleksi, ['dasar', 'senja']);
  assert.equal(R.beli(p, 'skin'), false);
  assert.equal(p.wallet, 175);
});

test('P-03: Heart Upgrade menambah kapasitas nyawa', () => {
  const p = R.buatProgres();
  p.wallet = R.HARGA.upgrade;
  assert.equal(R.beli(p, 'upgrade'), true);
  assert.equal(p.nyawaMaks, 6);
  assert.equal(p.wallet, 0);
  // Nyawa penuh lama tidak otomatis bertambah. Pemulihan mengisinya.
  assert.equal(p.nyawa, 5);
  R.mulaiRanked(p, 1, T0);
  R.gagalRanked(p);
  R.pulihkanNyawa(p, T0 + 20 * MENIT);
  assert.equal(p.nyawa, 5);
  R.pulihkanNyawa(p, T0 + 40 * MENIT);
  assert.equal(p.nyawa, 6);
});

test('P-04: pakai barang mengurangi stok, dan Extra Heart ditolak saat nyawa penuh', () => {
  const p = R.buatProgres();
  p.wallet = 100;
  R.beli(p, 'heart');
  R.beli(p, 'hint');
  assert.equal(R.pakai(p, 'heart'), false); // nyawa penuh
  assert.equal(p.barang.heart, 1);

  R.mulaiRanked(p, 1, T0);
  R.gagalRanked(p);
  assert.equal(R.pakai(p, 'heart'), true);
  assert.equal(p.nyawa, 5);
  assert.equal(p.barang.heart, 0);
  assert.equal(R.pakai(p, 'heart'), false);

  assert.equal(R.pakai(p, 'hint'), true);
  assert.equal(R.pakai(p, 'hint'), false);
  assert.equal(R.pakai(p, 'waktu'), false);
});

test('pilihSkin hanya menerima skin yang dimiliki', () => {
  const p = R.buatProgres();
  assert.equal(R.pilihSkin(p, 'senja'), false);
  p.wallet = 25;
  R.beli(p, 'skin');
  assert.equal(R.pilihSkin(p, 'senja'), true);
  assert.equal(p.skinAktif, 'senja');
});

test('P-07: simpan lalu muat mengembalikan data yang sama', () => {
  const p = R.buatProgres();
  p.wallet = 60;
  R.beli(p, 'hint');
  R.mulaiRanked(p, 1, T0);
  R.menangRanked(p, 1, 3);
  R.mulaiRanked(p, 2, T0);
  R.gagalRanked(p);
  assert.deepEqual(R.muat(R.serialisasi(p)), p);
});

test('P-07: data rusak, kosong, atau dari versi lain menghasilkan progres baru', () => {
  const baru = R.buatProgres();
  for (const teks of [null, undefined, '', 'bukan json', '[]', '"x"', '{"versi":99}', '{"nyawa":3}']) {
    assert.deepEqual(R.muat(teks), baru, String(teks));
  }
});

test('P-07: nilai tidak masuk akal dibersihkan, bukan dipercaya', () => {
  const p = R.muat(JSON.stringify({
    versi: 1, nyawa: 99, nyawaMaks: 5, totalStars: -4, wallet: 'banyak',
    rekor: { 1: 3, 2: 7, x: 1, 3: 'tiga' },
    barang: { heart: -2, hint: 3, waktu: 1.5 },
    koleksi: ['senja', 'tidak-ada'], skinAktif: 'tidak-ada',
  }));
  assert.equal(p.nyawa, 5);
  assert.equal(p.totalStars, 0);
  assert.equal(p.wallet, 0);
  assert.deepEqual(p.rekor, { 1: 3 });
  assert.deepEqual(p.barang, { heart: 0, hint: 3, waktu: 0 });
  assert.deepEqual(p.koleksi, ['dasar', 'senja']);
  assert.equal(p.skinAktif, 'dasar');
});

test('data dengan nyawa kurang dan pulihSejak hilang tetap bisa pulih', () => {
  const p = R.muat(JSON.stringify({ versi: 1, nyawa: 2, nyawaMaks: 5, pulihSejak: null }));
  assert.equal(p.nyawa, 2);
  R.pulihkanNyawa(p, T0);
  R.pulihkanNyawa(p, T0 + 20 * MENIT);
  assert.equal(p.nyawa, 3);
});

test('Practice memberi tanda selesai, tanpa membuka level dan tanpa Stars', () => {
  const p = R.buatProgres();
  assert.equal(R.levelSelesai(p, 1), false);
  assert.equal(R.tandaiLatihan(p, 1), true);
  assert.equal(R.tandaiLatihan(p, 1), false);
  assert.equal(R.levelSelesai(p, 1), true);
  assert.equal(R.levelTerbuka(p, 2), false);
  assert.equal(p.totalStars, 0);
  assert.equal(p.wallet, 0);
  assert.equal(p.nyawa, 5);
});

test('menang Ranked juga menandai level selesai', () => {
  const p = R.buatProgres();
  R.mulaiRanked(p, 1, T0);
  R.menangRanked(p, 1, 1);
  assert.equal(R.levelSelesai(p, 1), true);
  assert.deepEqual(p.latihan, []);
});

test('P-07: daftar latihan tersimpan, dan isinya yang tidak masuk akal dibuang', () => {
  const p = R.buatProgres();
  R.tandaiLatihan(p, 3);
  assert.deepEqual(R.muat(R.serialisasi(p)).latihan, [3]);
  const kotor = R.muat(JSON.stringify({ versi: 1, latihan: [2, 2, 0, -1, 1.5, 'x', 4] }));
  assert.deepEqual(kotor.latihan, [2, 4]);
  assert.deepEqual(R.muat(JSON.stringify({ versi: 1, latihan: 'banyak' })).latihan, []);
});

test('syaratStarsMs: sisa waktu yang disarankan benar-benar memberi Stars itu', () => {
  assert.equal(R.syaratStarsMs(2, 180000), 45000);
  assert.equal(R.syaratStarsMs(3, 180000), 90000);
  assert.equal(R.syaratStarsMs(2, 10000), 3000); // 2,5 detik dibulatkan ke atas
  for (const durasi of [10000, 12345, 180000, 300000, 480000]) {
    assert.equal(R.nilaiStars(R.syaratStarsMs(2, durasi), durasi) >= 2, true, `2 Stars, ${durasi}`);
    assert.equal(R.nilaiStars(R.syaratStarsMs(3, durasi), durasi), 3, `3 Stars, ${durasi}`);
  }
});

test('chapter baru butuh Total Stars, walau level sebelumnya sudah menang', () => {
  const p = R.buatProgres();
  for (let n = 1; n <= 50; n++) p.rekor[n] = 1;
  p.totalStars = 74;
  assert.deepEqual(R.syaratLevel(p, 51), { jenis: 'stars', butuh: 75 });
  assert.equal(R.levelTerbuka(p, 51), false);
  assert.equal(R.mulaiRanked(p, 51, T0), false);
  assert.equal(p.nyawa, 5);
  p.totalStars = 75;
  assert.equal(R.levelTerbuka(p, 51), true);
  assert.equal(R.levelTerbuka(p, 52), false);
  assert.deepEqual(R.syaratLevel(p, 52), { jenis: 'rekor', level: 51 });
});

test('ambang chapter tidak tercapai hanya dengan 1 ⭐ di setiap level', () => {
  for (const [level, butuh] of Object.entries(R.AMBANG_CHAPTER)) {
    const selesai = Number(level) - 1;
    assert.ok(butuh > selesai, `Level ${level}`);
    assert.ok(butuh <= selesai * 3, `Level ${level}`);
  }
});

test('belanja tidak bisa mengunci chapter yang sudah terbuka, karena Total Stars tidak berkurang', () => {
  const p = R.buatProgres();
  for (let n = 1; n <= 50; n++) p.rekor[n] = 1;
  p.totalStars = 75;
  p.wallet = 75;
  R.beli(p, 'hint');
  assert.equal(p.totalStars, 75);
  assert.equal(R.levelTerbuka(p, 51), true);
});

test('timer sementara: tiga durasi sesuai PRD', () => {
  assert.deepEqual(R.DURASI_MS, { easy: 180000, medium: 300000, hard: 480000 });
});
