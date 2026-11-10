/*
 * SETDOKU: aturan game tanpa kode tampilan.
 * Dimuat oleh browser (window.Logika) dan Node (require), supaya aturan
 * yang sama bisa dipakai server di mode online.
 */
(function (root, buat) {
  const api = buat();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Logika = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const SIFAT = ['bentuk', 'warna', 'jumlah', 'isian'];
  const UKURAN_MEJA = 12;
  const SKOR_MENANG = 5;
  const DURASI_MS = 8000;

  function buatDek() {
    const dek = [];
    for (let bentuk = 0; bentuk < 3; bentuk++)
      for (let warna = 0; warna < 3; warna++)
        for (let jumlah = 0; jumlah < 3; jumlah++)
          for (let isian = 0; isian < 3; isian++)
            dek.push({ id: dek.length, bentuk, warna, jumlah, isian });
    return dek;
  }

  function acak(daftar, rng = Math.random) {
    for (let i = daftar.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [daftar[i], daftar[j]] = [daftar[j], daftar[i]];
    }
    return daftar;
  }

  // Nilai sifat 0, 1, 2: jumlah ketiganya habis dibagi 3 hanya kalau
  // semuanya sama atau semuanya beda.
  function sifatGagal(a, b, c) {
    return SIFAT.filter((s) => (a[s] + b[s] + c[s]) % 3 !== 0);
  }

  function cekTiga(a, b, c) {
    return sifatGagal(a, b, c).length === 0;
  }

  function cariTiga(meja) {
    for (let i = 0; i < meja.length; i++)
      for (let j = i + 1; j < meja.length; j++)
        for (let k = j + 1; k < meja.length; k++)
          if (cekTiga(meja[i], meja[j], meja[k])) return [i, j, k];
    return null;
  }

  function ambilKartu(s) {
    if (s.dek.length === 0) {
      s.dek = acak(s.buangan, s.rng);
      s.buangan = [];
    }
    return s.dek.pop();
  }

  // Tiga kartu acak di meja ditukar. Kartu lama masuk ke dasar dek, jadi
  // tidak langsung kembali.
  function tukarTiga(s) {
    const posisi = acak(s.meja.map((_, i) => i), s.rng).slice(0, 3);
    for (const i of posisi) {
      s.dek.unshift(s.meja[i]);
      s.meja[i] = ambilKartu(s);
    }
  }

  function pastikanAdaTiga(s) {
    let diganti = false;
    while (!cariTiga(s.meja)) {
      diganti = true;
      tukarTiga(s);
    }
    return diganti;
  }

  function buatPermainan(rng = Math.random) {
    const s = {
      rng,
      dek: acak(buatDek(), rng),
      buangan: [],
      meja: [],
      skor: [0, 0],
      fase: 'rebutan', // rebutan -> memilih -> hasil -> rebutan | selesai
      setuju: [false, false], // pemain yang setuju menukar kartu saat buntu
      penukaran: null, // null | 'otomatis' | 'bersama': kartu ditukar sebelum ronde ini
      aktif: null,
      pilihan: [],
      hasil: null,
      pemenang: null,
    };
    for (let i = 0; i < UKURAN_MEJA; i++) s.meja.push(s.dek.pop());
    pastikanAdaTiga(s);
    return s;
  }

  // Pemain pertama yang menekan mengunci ronde; tekanan berikutnya ditolak.
  function tekanTombol(s, pemain) {
    if (s.fase !== 'rebutan') return false;
    s.fase = 'memilih';
    s.aktif = pemain;
    s.pilihan = [];
    s.setuju = [false, false];
    s.penukaran = null;
    return true;
  }

  // Dipakai saat kedua pemain buntu. Setiap pemain menyatakan setuju (atau
  // membatalkannya dengan menekan lagi). Kartu baru ditukar hanya kalau
  // keduanya setuju, dan skor tidak berubah. Mengembalikan null kalau ditolak.
  function tukarKartu(s, pemain) {
    if (s.fase !== 'rebutan' || (pemain !== 0 && pemain !== 1)) return null;
    s.setuju[pemain] = !s.setuju[pemain];
    s.penukaran = null;
    if (!s.setuju[0] || !s.setuju[1]) return { ditukar: false };
    tukarTiga(s);
    pastikanAdaTiga(s);
    s.setuju = [false, false];
    s.penukaran = 'bersama';
    return { ditukar: true };
  }

  function catatHasil(s, jenis, pencetak, gagal) {
    s.skor[pencetak] += 1;
    if (s.skor[pencetak] >= SKOR_MENANG) s.pemenang = pencetak;
    s.fase = 'hasil';
    s.hasil = { jenis, pencetak, gagal };
    return s.hasil;
  }

  // Mengembalikan null kalau ditolak, { selesai: false } kalau pilihan belum
  // tiga, atau { selesai: true, hasil } setelah kartu ketiga dinilai.
  function pilihKartu(s, pemain, indeks) {
    if (s.fase !== 'memilih' || pemain !== s.aktif) return null;
    if (!Number.isInteger(indeks) || indeks < 0 || indeks >= s.meja.length) return null;

    const ada = s.pilihan.indexOf(indeks);
    if (ada >= 0) {
      s.pilihan.splice(ada, 1);
      return { selesai: false };
    }
    s.pilihan.push(indeks);
    if (s.pilihan.length < 3) return { selesai: false };

    const [a, b, c] = s.pilihan.map((i) => s.meja[i]);
    const gagal = sifatGagal(a, b, c);
    const hasil = gagal.length === 0
      ? catatHasil(s, 'benar', pemain, [])
      : catatHasil(s, 'salah', 1 - pemain, gagal);
    return { selesai: true, hasil };
  }

  function waktuHabis(s) {
    if (s.fase !== 'memilih') return null;
    return catatHasil(s, 'waktu', 1 - s.aktif, []);
  }

  // Dipanggil setelah hasil ronde selesai ditampilkan.
  function lanjutRonde(s) {
    if (s.fase !== 'hasil') return false;
    if (s.pemenang !== null) {
      s.fase = 'selesai';
      return true;
    }
    if (s.hasil.jenis === 'benar') {
      for (const i of s.pilihan) {
        s.buangan.push(s.meja[i]);
        s.meja[i] = ambilKartu(s);
      }
    }
    s.penukaran = pastikanAdaTiga(s) ? 'otomatis' : null;
    s.setuju = [false, false];
    s.fase = 'rebutan';
    s.aktif = null;
    s.pilihan = [];
    s.hasil = null;
    return true;
  }

  return {
    SIFAT, UKURAN_MEJA, SKOR_MENANG, DURASI_MS,
    buatDek, acak, sifatGagal, cekTiga, cariTiga,
    buatPermainan, tekanTombol, tukarKartu, pilihKartu, waktuHabis, lanjutRonde,
  };
});
