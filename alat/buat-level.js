/*
 * Membuat public/level.js. Jalankan: npm run level
 * Hasilnya selalu sama selama BENIH dan SPEK tidak berubah, jadi level bisa
 * ditinjau sebelum rilis. Setiap puzzle wajib punya tepat satu solusi dan
 * bisa diselesaikan tanpa menebak.
 *
 * Setiap chapter punya 50 level. Level 1-10 adalah tutorial dengan spesifikasi tetap.
 * Sisanya dipilih dari puzzle acak sehingga skornya naik merata dan tidak pernah turun.
 */
const fs = require('fs');
const path = require('path');
const L = require('../public/logika.js');
const P = require('../public/puzzle.js');

const BENIH = 20261108;
const CALON_PER_LEVEL = 60;
const LEVEL_PER_CHAPTER = 50;
const CALON_TANJAKAN = 40000;
const BATAS_PERCOBAAN = 400000;

// pola 'setdoku': baris sewarna, kolom sebentuk. pola 'rasi': bebas asal rasi.
// tingkat 1: cukup melengkapi garis. 2: perlu mencoret. 3: perlu mengandaikan.
const SPEK = [
  { pola: 'setdoku', petunjuk: 7, pengecoh: 0, tingkat: 1, kesulitan: 'easy', pesan: 'Setiap baris dan kolom harus jadi rasi. Garis yang sudah punya dua kartu tinggal dilengkapi.' },
  { pola: 'setdoku', petunjuk: 6, pengecoh: 0, tingkat: 1, kesulitan: 'easy', pesan: 'Dua kartu dalam satu garis selalu punya tepat satu kartu ketiga.' },
  { pola: 'setdoku', petunjuk: 6, pengecoh: 1, tingkat: 1, kesulitan: 'easy', pesan: 'Ada kartu pengecoh. Tidak semua kartu tersedia harus dipakai.' },
  { pola: 'setdoku', petunjuk: 5, pengecoh: 0, tingkat: 1, kesulitan: 'easy', pesan: 'Satu kartu terpasang membuat garis lain punya dua kartu. Lanjutkan dari sana.' },
  { pola: 'setdoku', petunjuk: 5, pengecoh: 2, tingkat: 1, kesulitan: 'easy', pesan: 'Tentukan dulu kartu ketiganya, baru cari di kartu tersedia.' },
  { pola: 'setdoku', petunjuk: 4, pengecoh: 0, tingkat: 1, kesulitan: 'easy', pesan: 'Petunjuk makin sedikit. Mulai dari garis yang sudah punya dua kartu.' },
  { pola: 'setdoku', petunjuk: 4, pengecoh: 2, tingkat: 1, kesulitan: 'easy', pesan: 'Kartu yang terpasang membuka garis berikutnya.' },
  { pola: 'setdoku', petunjuk: 4, pengecoh: 0, tingkat: 2, kesulitan: 'medium', pesan: 'Buntu? Coba satu kartu di slot kosong. Kartu pelengkapnya harus ada di kartu tersedia.' },
  { pola: 'setdoku', petunjuk: 4, pengecoh: 2, tingkat: 2, kesulitan: 'medium', pesan: 'Coret kartu yang pelengkapnya tidak tersedia. Yang tersisa pasti benar.' },
  { pola: 'setdoku', petunjuk: 3, pengecoh: 0, tingkat: 2, kesulitan: 'medium', pesan: 'Tiga petunjuk saja. Cari slot yang hanya bisa diisi satu kartu.' },
];

// Pesan pembuka aturan baru, menurut urutan level di dalam chapter.
const PESAN = {
  1: {
    11: 'Mulai sekarang, satu baris boleh berisi tiga warna berbeda, asalkan tetap rasi.',
  },
  2: {
    1: 'Mulai sekarang, jumlah simbol juga dihitung: harus semua sama atau semua beda.',
    2: 'Pengecoh makin meyakinkan: kartu ini melengkapi garis, tetapi di tempat yang salah.',
  },
  3: {
    1: 'Kartu bertanda tanya masih tertutup. Setiap rasi yang kamu bentuk membuka satu kartu.',
    2: 'Isi kartu tertutup bisa kamu hitung: dua kartu dalam satu garis selalu punya tepat satu kartu ketiga.',
    4: 'Kalau kartu yang dibutuhkan masih tertutup, cari garis lain dulu untuk membentuk rasi.',
    8: 'Hitung kartu yang tertutup di kepalamu, lalu pakai hasilnya untuk garis berikutnya.',
  },
};

// Timer Tantangan mengikuti posisi level di dalam chapter.
function kesulitanDari(urutan) {
  return urutan <= 15 ? 'easy' : urutan <= 35 ? 'medium' : 'hard';
}

const KARTU_27 = P.DEK.filter((k) => k.jumlah === 0).map((k) => k.id);
const KARTU_81 = P.DEK.map((k) => k.id);

function rngBenih(benih) {
  let a = benih >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function adalahPola(papan) {
  const seragam = (slot, sifat) => new Set(slot.map((i) => P.DEK[papan[i]][sifat])).size === 1;
  return P.GARIS.slice(0, 3).every((g) => seragam(g, 'warna'))
    && P.GARIS.slice(3).every((g) => seragam(g, 'bentuk'));
}

function papanPola(rng) {
  const warna = L.acak([0, 1, 2], rng);
  const bentuk = L.acak([0, 1, 2], rng);
  const isian = L.acak([0, 1, 2], rng);
  const geser = rng() < 0.5 ? 1 : 2;
  const papan = [];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      papan.push(bentuk[j] * 27 + warna[i] * 9 + isian[(j + geser * i) % 3]);
  return papan;
}

// Empat kartu di sudut kiri atas menentukan seluruh papan.
function papanRasi(rng, kartu) {
  for (;;) {
    const [a, b, c, d] = L.acak(kartu.slice(), rng);
    const r1 = P.pelengkap(a, b);
    const r2 = P.pelengkap(c, d);
    const k1 = P.pelengkap(a, c);
    const k2 = P.pelengkap(b, d);
    const papan = [a, b, r1, c, d, r2, k1, k2, P.pelengkap(r1, r2)];
    if (P.papanBenar(papan) && !adalahPola(papan)) return papan;
  }
}

function buatCalon(rng, spek) {
  const solusi = spek.pola === 'setdoku' ? papanPola(rng) : papanRasi(rng, KARTU_27);
  const petunjuk = L.acak([0, 1, 2, 3, 4, 5, 6, 7, 8], rng).slice(0, spek.petunjuk);
  const papan = solusi.map((k, i) => (petunjuk.includes(i) ? k : null));
  const kurang = solusi.filter((_, i) => !petunjuk.includes(i));
  const luar = L.acak(KARTU_27.filter((k) => !solusi.includes(k)), rng).slice(0, spek.pengecoh);
  return { papan, tersedia: L.acak([...kurang, ...luar], rng), solusi };
}

// Kartu di luar papan yang melengkapi dua kartu papan, jadi tampak masuk akal.
function pengecohLicin(rng, solusi, jumlah) {
  const calon = new Set();
  for (const a of solusi) {
    for (const b of solusi) {
      if (a !== b && !solusi.includes(P.pelengkap(a, b))) calon.add(P.pelengkap(a, b));
    }
  }
  return L.acak([...calon], rng).slice(0, jumlah);
}

// Chapter baru harus terasa baru: jumlah simbol di papan tidak boleh seragam.
function papanBeragam(rng) {
  for (;;) {
    const papan = papanRasi(rng, KARTU_81);
    if (new Set(papan.map((k) => P.DEK[k].jumlah)).size > 1) return papan;
  }
}

function calonChapter2(rng, spek) {
  const solusi = papanBeragam(rng);
  const petunjuk = L.acak([0, 1, 2, 3, 4, 5, 6, 7, 8], rng).slice(0, spek.petunjuk);
  const kurang = solusi.filter((_, i) => !petunjuk.includes(i));
  const luar = pengecohLicin(rng, solusi, spek.pengecoh);
  return { papan: solusi.map((k, i) => (petunjuk.includes(i) ? k : null)), tersedia: L.acak([...kurang, ...luar], rng), solusi };
}

function calonChapter3(rng, spek) {
  const calon = calonChapter2(rng, spek);
  const kurang = calon.solusi.filter((k) => !calon.papan.includes(k));
  return { ...calon, tutup: L.acak(kurang, rng).slice(0, spek.tutup) };
}

// Spesifikasi acak, selalu muat dalam dua baris kartu tersedia (maksimal 12).
function spekAcak(rng) {
  const petunjuk = 3 + Math.floor(rng() * 4);
  const pengecoh = Math.floor(rng() * (Math.min(6, 12 - (9 - petunjuk)) + 1));
  const tutup = 1 + Math.floor(rng() * Math.min(5, 8 - petunjuk));
  return { pola: 'rasi', petunjuk, pengecoh, tutup };
}

// Mengumpulkan puzzle yang lolos: satu solusi, bisa diselesaikan tanpa menebak,
// jumlah pengecoh sesuai spesifikasi, dan solusinya belum dipakai level lain.
function kumpulkanCalon(rng, buatCalonBaru, periksa, terpakai) {
  const lolos = [];
  const dilihat = new Set(terpakai);
  for (let n = 0; n < BATAS_PERCOBAAN * 4 && lolos.length < CALON_TANJAKAN; n++) {
    const spek = spekAcak(rng);
    const calon = buatCalonBaru(rng, spek);
    // Sebagian papan tertutup rapat: semua pasangan kartunya saling melengkapi, jadi
    // tidak punya pengecoh licin. Papan seperti itu ditolak.
    if (calon.tersedia.length !== 9 - spek.petunjuk + spek.pengecoh) continue;
    const kunci = kunciPapan(calon.solusi);
    if (dilihat.has(kunci)) continue;
    if (P.hitungSolusi(calon) !== 1) continue;
    const ukur = P.ukurPenalaran(calon);
    if (!ukur.selesai) continue;
    const hasil = periksa(calon, ukur);
    if (!hasil) continue;
    dilihat.add(kunci);
    lolos.push({ ...calon, ukur, ...hasil });
  }
  return lolos;
}

// Memilih pasangan Practice dan Tantangan untuk setiap level. Skor sasaran naik lurus
// dari skorAwal sampai puncak, dan skor yang dipakai tidak pernah turun. Kedua puzzle
// dalam satu pasangan punya skor, tingkat, dan skor penalaran yang sama.
function tanjakan(lolos, jumlah, skorAwal, skorDari) {
  const kelompok = new Map();
  for (const c of lolos) {
    const kunci = `${skorDari(c)}|${c.ukur.tingkat}|${c.ukur.skor}`;
    if (!kelompok.has(kunci)) kelompok.set(kunci, { skor: skorDari(c), isi: [] });
    kelompok.get(kunci).isi.push(c);
  }
  const daftar = [...kelompok.values()];
  // Puncak: skor tertinggi yang masih punya cukup pasangan untuk beberapa level terakhir.
  const skorAda = [...new Set(daftar.map((k) => k.skor))].sort((a, b) => b - a);
  const puncak = skorAda.find((s) => daftar
    .filter((k) => k.skor >= s)
    .reduce((n, k) => n + Math.floor(k.isi.length / 2), 0) >= 4);
  const hasil = [];
  let sebelum = skorAwal;
  for (let i = 0; i < jumlah; i++) {
    const sasaran = Math.max(sebelum, Math.round(skorAwal + ((puncak - skorAwal) * i) / (jumlah - 1)));
    const pilihan = daftar
      .filter((k) => k.skor >= sasaran && k.isi.length >= 2)
      .sort((a, b) => a.skor - b.skor || b.isi.length - a.isi.length)[0];
    if (!pilihan) throw new Error(`Level ke-${i + 1} gagal dibuat: sasaran skor ${sasaran}, puncak ${puncak}`);
    hasil.push({ practice: pilihan.isi.shift(), ranked: pilihan.isi.shift() });
    sebelum = pilihan.skor;
  }
  return hasil;
}

function kunciPapan(solusi) {
  return solusi.join();
}

// Mengumpulkan puzzle yang lolos, lalu memilih dua terberat dengan solusi
// berbeda supaya Practice dan Solo Ranked sepadan tetapi tidak bisa dihafal.
function buatLevel(rng, spek, terpakai) {
  const lolos = [];
  for (let n = 0; n < BATAS_PERCOBAAN && lolos.length < CALON_PER_LEVEL; n++) {
    const calon = buatCalon(rng, spek);
    if (terpakai.has(kunciPapan(calon.solusi))) continue;
    if (P.hitungSolusi(calon) !== 1) continue;
    const ukur = P.ukurPenalaran(calon);
    if (!ukur.selesai || ukur.tingkat !== spek.tingkat) continue;
    lolos.push({ ...calon, ukur });
  }
  lolos.sort((a, b) => b.ukur.skor - a.ukur.skor);
  const [practice] = lolos;
  const ranked = lolos.find((c) => kunciPapan(c.solusi) !== kunciPapan(practice?.solusi));
  if (!practice || !ranked) throw new Error(`Level gagal dibuat: ${JSON.stringify(spek)}`);
  terpakai.add(kunciPapan(practice.solusi));
  terpakai.add(kunciPapan(ranked.solusi));
  return { practice, ranked };
}

function bersihkan({ papan, tersedia, ukur, tutup, tertutup }) {
  const hasil = { papan, tersedia, skor: ukur.skor, tingkat: ukur.tingkat };
  return tutup ? { ...hasil, tutup, skorTutup: tertutup.skor } : hasil;
}

function buatSemuaLevel() {
  const rng = rngBenih(BENIH);
  const terpakai = new Set();
  const levels = SPEK.map((spek, i) => {
    const { practice, ranked } = buatLevel(rng, spek, terpakai);
    return {
      level: i + 1,
      chapter: 1,
      pola: spek.pola,
      kesulitan: spek.kesulitan,
      pesan: spek.pesan,
      practice: bersihkan(practice),
      ranked: bersihkan(ranked),
    };
  });

  const skorBiasa = (c) => c.ukur.skor;
  const rencana = [
    { chapter: 1, mulai: SPEK.length + 1, buat: buatCalon, periksa: () => ({}), skorDari: skorBiasa },
    { chapter: 2, mulai: 1, buat: calonChapter2, periksa: () => ({}), skorDari: skorBiasa },
    {
      chapter: 3,
      mulai: 1,
      buat: calonChapter3,
      periksa: (c) => {
        // Petunjuk tidak boleh sudah membentuk rasi, karena kartunya akan langsung terbuka.
        if (P.jumlahRasiDi(c.papan) > 0) return null;
        const tertutup = P.ukurTertutup(c);
        return tertutup.adil ? { tertutup } : null;
      },
      skorDari: (c) => c.tertutup.skor,
    },
  ];
  for (const r of rencana) {
    const lolos = kumpulkanCalon(rng, r.buat, r.periksa, terpakai);
    // Chapter 1 melanjutkan skor tutorial. Chapter lain mulai dari puzzle termudahnya.
    const skorAwal = r.chapter === 1 ? levels[SPEK.length - 1].practice.skor : Math.min(...lolos.map(r.skorDari));
    tanjakan(lolos, LEVEL_PER_CHAPTER - r.mulai + 1, skorAwal, r.skorDari).forEach((pasangan, i) => {
      terpakai.add(kunciPapan(pasangan.practice.solusi));
      terpakai.add(kunciPapan(pasangan.ranked.solusi));
      const urutan = r.mulai + i;
      levels.push({
        level: levels.length + 1,
        chapter: r.chapter,
        pola: 'rasi',
        kesulitan: kesulitanDari(urutan),
        pesan: PESAN[r.chapter][urutan] || null,
        practice: bersihkan(pasangan.practice),
        ranked: bersihkan(pasangan.ranked),
      });
    });
  }
  return levels;
}

function tulisFile(levels) {
  const baris = levels.map((l) => `  ${JSON.stringify(l)},`).join('\n');
  const isi = `/*
 * SETDOKU: data level. Jangan diubah manual.
 * Dibuat oleh alat/buat-level.js. Jalankan: npm run level
 */
(function (root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.DataLevel = data;
})(typeof self !== 'undefined' ? self : this, [
${baris}
]);
`;
  fs.writeFileSync(path.join(__dirname, '..', 'public', 'level.js'), isi);
}

if (require.main === module) {
  const levels = buatSemuaLevel();
  tulisFile(levels);
  for (const l of levels) {
    const tutup = l.practice.tutup ? ` tutup ${l.practice.tutup.length} skorTutup ${l.practice.skorTutup}/${l.ranked.skorTutup}` : '';
    console.log(`Level ${String(l.level).padStart(3)} ch${l.chapter} ${l.kesulitan.padEnd(6)} ${l.pola.padEnd(7)} `
      + `tingkat ${l.practice.tingkat}/${l.ranked.tingkat} skor ${l.practice.skor}/${l.ranked.skor}${tutup}`);
  }
}

module.exports = { SPEK, LEVEL_PER_CHAPTER, buatSemuaLevel, adalahPola };
