/*
 * SETDOKU: progres pemain (nyawa, Stars, rekor, toko), tanpa kode tampilan.
 * Waktu selalu dikirim lewat parameter `sekarang` (ms), jadi pemulihan nyawa bisa dites.
 * Dimuat oleh browser (window.Progres) dan Node (require).
 */
(function (root, buat) {
  const api = buat();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Progres = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const VERSI = 1;
  const NYAWA_AWAL = 5;
  const PULIH_MS = 20 * 60 * 1000;
  const PENALTI_MS = 15 * 1000;
  const TAMBAHAN_WAKTU_MS = 30 * 1000;
  const MAKS_NYAWA_UPGRADE = 99;

  // Sementara: menunggu data uji main (G-12). Cukup ganti angkanya di sini.
  const DURASI_MS = { easy: 3 * 60000, medium: 5 * 60000, hard: 8 * 60000 };

  const AMBANG_STARS = { 2: 0.25, 3: 0.5 };

  // Total Stars minimal untuk membuka level pertama setiap chapter. Sementara, menunggu uji main.
  // Menamatkan semua level saja memberi 1 ⭐ per level, jadi ambangnya harus di atas itu.
  const AMBANG_CHAPTER = { 51: 75, 101: 150 };

  const HARGA = { heart: 5, hint: 6, waktu: 8, skin: 25, upgrade: 30 };
  const BARANG = ['heart', 'hint', 'waktu'];
  const SKIN = ['dasar', 'senja'];

  function buatProgres() {
    return {
      versi: VERSI,
      nyawa: NYAWA_AWAL,
      nyawaMaks: NYAWA_AWAL,
      pulihSejak: null, // kapan nyawa mulai pulih, null kalau nyawa penuh
      berjalan: null, // level Ranked yang sedang dimainkan, nyawanya sudah dipotong
      totalStars: 0,
      wallet: 0,
      rekor: {}, // { nomorLevel: 1 | 2 | 3 }
      latihan: [], // nomor level yang sudah selesai di Practice
      barang: { heart: 0, hint: 0, waktu: 0 },
      koleksi: ['dasar'],
      skinAktif: 'dasar',
    };
  }

  const bulatTak = (n, min, maks, cadangan) => (Number.isInteger(n) && n >= min && n <= maks ? n : cadangan);

  // Data rusak, bukan JSON, atau dari versi yang tidak dikenal tidak boleh menghentikan game.
  function muat(teks) {
    const p = buatProgres();
    let d;
    try { d = JSON.parse(teks); } catch (e) { return p; }
    if (!d || typeof d !== 'object' || d.versi !== VERSI) return p;
    p.nyawaMaks = bulatTak(d.nyawaMaks, NYAWA_AWAL, MAKS_NYAWA_UPGRADE, p.nyawaMaks);
    p.nyawa = bulatTak(d.nyawa, 0, p.nyawaMaks, p.nyawaMaks);
    p.pulihSejak = Number.isFinite(d.pulihSejak) ? d.pulihSejak : null;
    p.berjalan = Number.isInteger(d.berjalan) ? d.berjalan : null;
    p.totalStars = bulatTak(d.totalStars, 0, 1e6, 0);
    p.wallet = bulatTak(d.wallet, 0, 1e6, 0);
    if (d.rekor && typeof d.rekor === 'object') {
      for (const [level, stars] of Object.entries(d.rekor)) {
        if (/^\d+$/.test(level) && [1, 2, 3].includes(stars)) p.rekor[level] = stars;
      }
    }
    if (Array.isArray(d.latihan)) {
      p.latihan = [...new Set(d.latihan.filter((n) => Number.isInteger(n) && n >= 1))];
    }
    if (d.barang && typeof d.barang === 'object') {
      for (const nama of BARANG) p.barang[nama] = bulatTak(d.barang[nama], 0, 9999, 0);
    }
    if (Array.isArray(d.koleksi)) p.koleksi = ['dasar', ...d.koleksi.filter((x) => SKIN.includes(x) && x !== 'dasar')];
    p.skinAktif = p.koleksi.includes(d.skinAktif) ? d.skinAktif : 'dasar';
    // pulihSejak yang hilang diisi pulihkanNyawa dengan waktu sekarang, bukan 0.
    if (p.nyawa >= p.nyawaMaks) p.pulihSejak = null;
    return p;
  }

  function serialisasi(p) {
    return JSON.stringify(p);
  }

  // Satu nyawa pulih setiap 20 menit sampai penuh. Kalau jam perangkat mundur,
  // hitungannya dimulai lagi dari sekarang.
  function pulihkanNyawa(p, sekarang) {
    if (p.nyawa >= p.nyawaMaks) {
      p.nyawa = p.nyawaMaks;
      p.pulihSejak = null;
      return p;
    }
    if (p.pulihSejak === null || sekarang < p.pulihSejak) p.pulihSejak = sekarang;
    const n = Math.floor((sekarang - p.pulihSejak) / PULIH_MS);
    if (n > 0) {
      p.nyawa = Math.min(p.nyawaMaks, p.nyawa + n);
      p.pulihSejak = p.nyawa >= p.nyawaMaks ? null : p.pulihSejak + n * PULIH_MS;
    }
    return p;
  }

  // Sisa waktu sampai nyawa berikutnya pulih, atau null kalau nyawa penuh.
  function sisaPulihMs(p, sekarang) {
    pulihkanNyawa(p, sekarang);
    return p.pulihSejak === null ? null : Math.max(0, p.pulihSejak + PULIH_MS - sekarang);
  }

  // Mengembalikan syarat yang belum terpenuhi, atau null kalau level terbuka.
  function syaratLevel(p, level) {
    if (level === 1) return null;
    if (!((p.rekor[level - 1] || 0) >= 1)) return { jenis: 'rekor', level: level - 1 };
    const butuh = AMBANG_CHAPTER[level];
    if (butuh && p.totalStars < butuh) return { jenis: 'stars', butuh };
    return null;
  }

  function levelTerbuka(p, level) {
    return syaratLevel(p, level) === null;
  }

  // Practice hanya memberi tanda selesai: tidak membuka level dan tidak memberi Stars.
  // Mengembalikan true kalau level ini baru pertama kali selesai.
  function tandaiLatihan(p, level) {
    if (p.latihan.includes(level)) return false;
    p.latihan.push(level);
    return true;
  }

  function levelSelesai(p, level) {
    return p.latihan.includes(level) || (p.rekor[level] || 0) >= 1;
  }

  // G-10: nyawa dipotong saat mulai. Memuat ulang atau keluar tidak bisa menghindarinya.
  function mulaiRanked(p, level, sekarang) {
    pulihkanNyawa(p, sekarang);
    if (!levelTerbuka(p, level) || p.nyawa <= 0) return false;
    if (p.nyawa === p.nyawaMaks) p.pulihSejak = sekarang;
    p.nyawa -= 1;
    p.berjalan = level;
    return true;
  }

  function kembalikanNyawa(p) {
    p.nyawa = Math.min(p.nyawaMaks, p.nyawa + 1);
    if (p.nyawa >= p.nyawaMaks) p.pulihSejak = null;
  }

  // Waktu habis atau pemain menyerah: nyawa yang sudah dipotong tidak kembali.
  function gagalRanked(p) {
    p.berjalan = null;
    return p;
  }

  // Sisa waktu minimal untuk meraih sejumlah Stars, dibulatkan ke atas ke detik penuh.
  function syaratStarsMs(stars, durasiMs) {
    return Math.ceil((durasiMs * AMBANG_STARS[stars]) / 1000) * 1000;
  }

  // 1 ⭐ selesai sebelum waktu habis, 2 ⭐ sisa 25%, 3 ⭐ sisa 50% tanpa bantuan.
  // Sisa waktu dibandingkan dengan durasi dasar level, walau memakai Extra Time (K-5).
  function nilaiStars(sisaMs, durasiMs, { hint = false, waktu = false } = {}) {
    if (sisaMs <= 0) return 0;
    const rasio = sisaMs / durasiMs;
    let stars = rasio >= AMBANG_STARS[3] ? 3 : rasio >= AMBANG_STARS[2] ? 2 : 1;
    if (hint || waktu) stars = Math.min(stars, 2);
    return stars;
  }

  // Stars dihitung dari rekor tertinggi: yang masuk hanya selisihnya.
  function menangRanked(p, level, stars) {
    if (p.berjalan === level) kembalikanNyawa(p);
    p.berjalan = null;
    const lama = p.rekor[level] || 0;
    const tambah = Math.max(0, stars - lama);
    if (tambah > 0) p.rekor[level] = stars;
    p.totalStars += tambah;
    p.wallet += tambah;
    return { tambah, rekorBaru: tambah > 0 };
  }

  // Hanya mengurangi Wallet. Total Stars tidak pernah berkurang.
  function beli(p, item) {
    const harga = HARGA[item];
    if (harga === undefined || p.wallet < harga) return false;
    if (BARANG.includes(item)) {
      p.barang[item] += 1;
    } else if (item === 'skin') {
      const baru = SKIN.find((s) => !p.koleksi.includes(s));
      if (!baru) return false;
      p.koleksi.push(baru);
    } else if (item === 'upgrade') {
      if (p.nyawaMaks >= MAKS_NYAWA_UPGRADE) return false;
      p.nyawaMaks += 1;
    }
    p.wallet -= harga;
    return true;
  }

  // Extra Heart memulihkan satu nyawa dan ditolak kalau nyawa sudah penuh.
  function pakai(p, item) {
    if (!BARANG.includes(item) || p.barang[item] <= 0) return false;
    if (item === 'heart') {
      if (p.nyawa >= p.nyawaMaks) return false;
      kembalikanNyawa(p);
    }
    p.barang[item] -= 1;
    return true;
  }

  function pilihSkin(p, id) {
    if (!p.koleksi.includes(id)) return false;
    p.skinAktif = id;
    return true;
  }

  return {
    AMBANG_CHAPTER, syaratLevel,
    VERSI, NYAWA_AWAL, PULIH_MS, PENALTI_MS, TAMBAHAN_WAKTU_MS, DURASI_MS, HARGA, SKIN,
    buatProgres, muat, serialisasi, pulihkanNyawa, sisaPulihMs, levelTerbuka,
    tandaiLatihan, levelSelesai,
    mulaiRanked, gagalRanked, nilaiStars, syaratStarsMs, menangRanked, beli, pakai, pilihSkin,
  };
});
