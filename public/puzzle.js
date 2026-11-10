/*
 * SETDOKU: papan Solo dan pemeriksa puzzle, tanpa kode tampilan.
 * Aturannya satu: setiap baris dan kolom papan 3 x 3 harus membentuk rasi.
 * Dimuat oleh browser (window.Puzzle) dan Node (require).
 */
(function (root, buat) {
  const diNode = typeof module === 'object' && module.exports;
  const api = buat(diNode ? require('./logika.js') : root.Logika);
  if (diNode) module.exports = api;
  else root.Puzzle = api;
})(typeof self !== 'undefined' ? self : this, function (L) {
  const DEK = L.buatDek();

  const GARIS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
  ];
  const NAMA_GARIS = ['Baris 1', 'Baris 2', 'Baris 3', 'Kolom 1', 'Kolom 2', 'Kolom 3'];
  const GARIS_SLOT = DEK.slice(0, 9).map((_, i) => GARIS.filter((g) => g.includes(i)));

  const BOBOT = { pelengkap: 1, eliminasi: 3, pengandaian: 8, jebakan: 1 };

  function adalahRasi(a, b, c) {
    return L.cekTiga(DEK[a], DEK[b], DEK[c]);
  }

  // Dua kartu berbeda selalu punya tepat satu kartu pelengkap.
  function pelengkap(a, b) {
    const [x, y] = [DEK[a], DEK[b]];
    const nilai = (sifat) => (6 - x[sifat] - y[sifat]) % 3;
    return nilai('bentuk') * 27 + nilai('warna') * 9 + nilai('jumlah') * 3 + nilai('isian');
  }

  // Hanya garis yang sudah terisi penuh yang dinilai.
  function garisGagal(papan) {
    const hasil = [];
    GARIS.forEach((slot, indeks) => {
      if (slot.some((i) => papan[i] === null)) return;
      const sifat = L.sifatGagal(...slot.map((i) => DEK[papan[i]]));
      if (sifat.length) hasil.push({ indeks, nama: NAMA_GARIS[indeks], slot, sifat });
    });
    return hasil;
  }

  function papanBenar(papan) {
    return !papan.includes(null) && new Set(papan).size === 9 && garisGagal(papan).length === 0;
  }

  // Mencari solusi sampai sejumlah batas, karena pemeriksa hanya perlu tahu
  // apakah solusinya tepat satu.
  function cariSolusi(puzzle, batas = 2) {
    const isi = puzzle.papan.slice();
    const sisa = new Set(puzzle.tersedia);
    const kosong = isi.flatMap((k, i) => (k === null ? [i] : []));
    const hasil = [];

    function masihAman(i) {
      return GARIS_SLOT[i].every((g) => {
        if (g.some((x) => isi[x] === null)) return true;
        return adalahRasi(isi[g[0]], isi[g[1]], isi[g[2]]);
      });
    }

    function coba(n) {
      if (hasil.length >= batas) return;
      if (n === kosong.length) {
        hasil.push(isi.slice());
        return;
      }
      const i = kosong[n];
      for (const c of [...sisa]) {
        isi[i] = c;
        sisa.delete(c);
        if (masihAman(i)) coba(n + 1);
        sisa.add(c);
        isi[i] = null;
      }
    }

    if (garisGagal(isi).length === 0) coba(0);
    return hasil;
  }

  function hitungSolusi(puzzle, batas = 2) {
    return cariSolusi(puzzle, batas).length;
  }

  /* Pengukur penalaran: meniru cara orang menyelesaikan puzzle tanpa menebak. */

  function garisMungkin(isi, sisa, garis, i, c) {
    const kenal = garis.filter((x) => x !== i && isi[x] !== null).map((x) => isi[x]);
    if (kenal.length === 2) return adalahRasi(kenal[0], kenal[1], c);
    if (kenal.length === 1) {
      const p = pelengkap(kenal[0], c);
      return p !== c && sisa.has(p);
    }
    for (const x of sisa) {
      if (x === c) continue;
      const p = pelengkap(c, x);
      if (p !== c && p !== x && sisa.has(p)) return true;
    }
    return false;
  }

  function calonSlot(isi, sisa, i) {
    return [...sisa].filter((c) => GARIS_SLOT[i].every((g) => garisMungkin(isi, sisa, g, i, c)));
  }

  function taruhDi(k, i, c) {
    k.isi[i] = c;
    k.sisa.delete(c);
  }

  // Teknik paling dasar: garis dengan dua kartu pasti dilengkapi kartu ketiganya.
  // Mengembalikan true kalau ada langkah, false kalau tidak, null kalau buntu salah.
  function langkahPelengkap(k) {
    for (const g of GARIS) {
      const kosong = g.filter((x) => k.isi[x] === null);
      if (kosong.length !== 1) continue;
      const [a, b] = g.filter((x) => k.isi[x] !== null).map((x) => k.isi[x]);
      const p = pelengkap(a, b);
      if (!k.sisa.has(p)) return null;
      taruhDi(k, kosong[0], p);
      return true;
    }
    return false;
  }

  // Teknik kedua: kartu yang tidak punya pasangan di kartu tersedia dicoret,
  // sampai satu slot hanya punya satu calon. Kalau tidak ada pengecoh, setiap
  // kartu wajib terpakai, jadi kartu dengan satu slot juga pasti.
  // Hasilnya adalah jumlah jebakan: calon palsu yang masih tampak mungkin saat
  // langkah ini diambil. Inilah yang membuat pengecoh terasa sulit.
  function langkahEliminasi(k) {
    const kosong = k.isi.flatMap((c, i) => (c === null ? [i] : []));
    const calon = new Map(kosong.map((i) => [i, calonSlot(k.isi, k.sisa, i)]));
    let jebakan = 0;
    for (const [, daftar] of calon) {
      if (daftar.length === 0) return null;
      jebakan += daftar.length - 1;
    }
    for (const [i, daftar] of calon) {
      if (daftar.length === 1) {
        taruhDi(k, i, daftar[0]);
        return { jebakan };
      }
    }
    if (k.sisa.size !== kosong.length) return false;
    for (const c of k.sisa) {
      const tempat = kosong.filter((i) => calon.get(i).includes(c));
      if (tempat.length === 0) return null;
      if (tempat.length === 1) {
        taruhDi(k, tempat[0], c);
        return { jebakan };
      }
    }
    return false;
  }

  function salin(k) {
    return { isi: k.isi.slice(), sisa: new Set(k.sisa) };
  }

  // Menjalankan dua teknik pertama sampai berhenti. Mengembalikan false kalau
  // keadaan terbukti salah.
  function telusuri(k, langkah) {
    for (;;) {
      if (garisGagal(k.isi).length) return false;
      if (!k.isi.includes(null)) return true;
      const a = langkahPelengkap(k);
      if (a === null) return false;
      if (a) { if (langkah) langkah.pelengkap++; continue; }
      const b = langkahEliminasi(k);
      if (b === null) return false;
      if (b) {
        if (langkah) { langkah.eliminasi++; langkah.jebakan += b.jebakan; }
        continue;
      }
      return true;
    }
  }

  // Teknik ketiga: andaikan satu calon, telusuri akibatnya, dan coret kalau
  // ternyata salah. Hanya berhasil kalau satu calon tersisa di slot itu.
  function langkahPengandaian(k) {
    const kosong = k.isi.flatMap((c, i) => (c === null ? [i] : []));
    const urut = kosong
      .map((i) => ({ i, calon: calonSlot(k.isi, k.sisa, i) }))
      .sort((a, b) => a.calon.length - b.calon.length);
    const jebakan = urut.reduce((n, { calon }) => n + Math.max(0, calon.length - 1), 0);
    for (const { i, calon } of urut) {
      const bertahan = calon.filter((c) => {
        const uji = salin(k);
        taruhDi(uji, i, c);
        return telusuri(uji, null);
      });
      if (bertahan.length === 1) {
        taruhDi(k, i, bertahan[0]);
        return { jebakan };
      }
    }
    return false;
  }

  // tingkat 1: cukup melengkapi garis. 2: perlu mencoret calon.
  // 3: perlu mengandaikan. Puzzle dengan selesai = false butuh tebakan.
  function ukurPenalaran(puzzle) {
    const k = { isi: puzzle.papan.slice(), sisa: new Set(puzzle.tersedia) };
    const langkah = { pelengkap: 0, eliminasi: 0, pengandaian: 0, jebakan: 0 };
    for (;;) {
      if (!telusuri(k, langkah)) break;
      if (!k.isi.includes(null)) break;
      const andai = langkahPengandaian(k);
      if (!andai) break;
      langkah.pengandaian++;
      langkah.jebakan += andai.jebakan;
    }
    const selesai = papanBenar(k.isi);
    const skor = Object.keys(BOBOT).reduce((n, t) => n + langkah[t] * BOBOT[t], 0);
    const tingkat = langkah.pengandaian ? 3 : langkah.eliminasi ? 2 : 1;
    return { ...langkah, skor, tingkat, selesai };
  }

  /*
   * Pemeriksa Kartu Tersembunyi. Pemain tidak tahu isi kartu tertutup, jadi tidak boleh
   * mencoret calon dari kartu tersedia. Puzzle hanya adil kalau seluruh papan bisa
   * disimpulkan dari petunjuk lewat pelengkap, dan pemain tidak pernah buntu.
   */
  function simpulkanPapan(papan) {
    const isi = papan.slice();
    const urutan = [];
    for (let ada = true; ada;) {
      ada = false;
      for (const g of GARIS) {
        const kosong = g.filter((x) => isi[x] === null);
        if (kosong.length !== 1) continue;
        const [a, b] = g.filter((x) => isi[x] !== null).map((x) => isi[x]);
        isi[kosong[0]] = pelengkap(a, b);
        urutan.push(kosong[0]);
        ada = true;
      }
    }
    return { isi, urutan };
  }

  // Dari setiap urutan pemasangan kartu benar, harus selalu ada kartu berikutnya yang terlihat.
  function tanpaBuntu(puzzle, solusi) {
    const kosong = puzzle.papan.flatMap((k, i) => (k === null ? [i] : []));
    const terbukaAwal = puzzle.tersedia.filter((id) => !puzzle.tutup.includes(id));
    const dilihat = new Set();
    const telusur = (papan) => {
      const kunci = papan.join();
      if (dilihat.has(kunci)) return true;
      dilihat.add(kunci);
      const sisa = kosong.filter((i) => papan[i] === null);
      if (!sisa.length) return true;
      const terlihat = new Set([...terbukaAwal, ...puzzle.tutup.slice(0, jumlahRasiDi(papan))]);
      const bisa = sisa.filter((i) => terlihat.has(solusi[i]));
      if (!bisa.length) return false;
      return bisa.every((i) => {
        const lanjut = papan.slice();
        lanjut[i] = solusi[i];
        return telusur(lanjut);
      });
    };
    return telusur(puzzle.papan);
  }

  // Skornya naik kalau pemain harus menghitung kartu yang belum terlihat sebelum bisa memasang.
  function ukurTertutup(puzzle) {
    const { isi: solusi, urutan } = simpulkanPapan(puzzle.papan);
    if (solusi.includes(null) || !papanBenar(solusi)) return { adil: false };
    const dibutuhkan = puzzle.papan.flatMap((k, i) => (k === null ? [solusi[i]] : []));
    if (!dibutuhkan.every((id) => puzzle.tersedia.includes(id))) return { adil: false };
    if (!tanpaBuntu(puzzle, solusi)) return { adil: false };
    const terlihat = new Set(puzzle.tersedia.filter((id) => !puzzle.tutup.includes(id)));
    puzzle.tutup.slice(0, jumlahRasiDi(puzzle.papan)).forEach((id) => terlihat.add(id));
    const pertama = urutan.findIndex((i) => terlihat.has(solusi[i]));
    const lompatan = Math.max(pertama, 0);
    const tertutupPerlu = puzzle.tutup.filter((id) => dibutuhkan.includes(id)).length;
    const pengecoh = puzzle.tersedia.length - dibutuhkan.length;
    return { adil: true, lompatan, tertutupPerlu, skor: dibutuhkan.length + tertutupPerlu * 2 + lompatan * 3 + pengecoh };
  }

  /* Sesi bermain */

  function mulaiSesi(puzzle) {
    return {
      papan: puzzle.papan.slice(),
      tetap: puzzle.papan.map((k) => k !== null),
      tersedia: puzzle.tersedia.slice(),
      terpilih: null,
      gagal: [],
      kunciSalah: 0,
      selesai: false,
      kalah: false,
      tutup: (puzzle.tutup || []).slice(), // urutan kartu tertutup
      terbuka: jumlahRasiDi(puzzle.papan), // berapa kartu tertutup yang sudah terbuka
    };
  }

  function kartuDipakai(s, id) {
    return s.papan.includes(id);
  }

  // Jumlah baris dan kolom yang sudah terisi penuh dan membentuk rasi.
  function jumlahRasiDi(papan) {
    return GARIS.filter((g) => {
      if (g.some((i) => papan[i] === null)) return false;
      return new Set(g.map((i) => papan[i])).size === 3 && adalahRasi(papan[g[0]], papan[g[1]], papan[g[2]]);
    }).length;
  }

  // Setiap rasi yang terbentuk membuka satu kartu tertutup, dan kartu itu tetap terbuka.
  function perbaruiTerbuka(s) {
    s.terbuka = Math.max(s.terbuka, jumlahRasiDi(s.papan));
  }

  function kartuTertutup(s, id) {
    const urutan = s.tutup.indexOf(id);
    return urutan >= s.terbuka && !kartuDipakai(s, id);
  }

  function tekanKartu(s, id) {
    if (s.selesai || !s.tersedia.includes(id) || kartuDipakai(s, id) || kartuTertutup(s, id)) return false;
    s.terpilih = s.terpilih === id ? null : id;
    return true;
  }

  // Dengan kartu terpilih: menaruh atau mengganti. Tanpa kartu terpilih:
  // mengembalikan kartu di slot itu ke kartu tersedia.
  function tekanSlot(s, i) {
    if (s.selesai || s.tetap[i]) return false;
    if (s.terpilih === null && s.papan[i] === null) return false;
    s.papan[i] = s.terpilih;
    s.terpilih = null;
    s.gagal = [];
    perbaruiTerbuka(s);
    return true;
  }

  /* Dipakai saat kartu diseret. Semuanya mengembalikan false kalau ditolak. */

  function slotBisaDiubah(s, i) {
    return !s.selesai && s.papan[i] !== undefined && !s.tetap[i];
  }

  function bersihkanPilihan(s) {
    s.terpilih = null;
    s.gagal = [];
    perbaruiTerbuka(s);
  }

  // Dari kartu tersedia ke slot. Kartu lama di slot itu kembali tersedia.
  function taruhKartu(s, id, i) {
    if (!slotBisaDiubah(s, i) || !s.tersedia.includes(id) || kartuDipakai(s, id) || kartuTertutup(s, id)) return false;
    s.papan[i] = id;
    bersihkanPilihan(s);
    return true;
  }

  // Dari slot ke slot. Kalau tujuannya terisi, kedua kartu bertukar tempat.
  function pindahKartu(s, dari, ke) {
    if (dari === ke || !slotBisaDiubah(s, dari) || !slotBisaDiubah(s, ke) || s.papan[dari] === null) return false;
    [s.papan[dari], s.papan[ke]] = [s.papan[ke], s.papan[dari]];
    bersihkanPilihan(s);
    return true;
  }

  // Dari slot kembali ke kartu tersedia.
  function ambilKartu(s, i) {
    if (!slotBisaDiubah(s, i) || s.papan[i] === null) return false;
    s.papan[i] = null;
    bersihkanPilihan(s);
    return true;
  }

  // Hint: memasang satu kartu yang benar lalu menguncinya seperti petunjuk awal.
  // Slot yang masih kosong didahulukan, lalu slot yang isinya salah. Mengembalikan
  // { slot, id } atau false kalau tidak ada yang bisa dibuka.
  function bukaPetunjuk(s) {
    if (s.selesai) return false;
    const papan = s.papan.map((k, i) => (s.tetap[i] ? k : null));
    // Kartu yang sudah dipasang Hint tidak boleh terpakai dua kali dalam pencarian.
    const awal = { papan, tersedia: s.tersedia.filter((id) => !papan.includes(id)) };
    const solusi = cariSolusi(awal, 1)[0];
    if (!solusi) return false;
    const calon = s.papan.flatMap((k, i) => (!s.tetap[i] && k !== solusi[i] ? [i] : []));
    if (!calon.length) return false;
    const slot = calon.find((i) => s.papan[i] === null) ?? calon[0];
    const id = solusi[slot];
    if (kartuTertutup(s, id)) s.tutup = s.tutup.filter((x) => x !== id);
    const lain = s.papan.indexOf(id);
    if (lain >= 0) s.papan[lain] = null;
    s.papan[slot] = id;
    s.tetap[slot] = true;
    bersihkanPilihan(s);
    return { slot, id };
  }

  function kosongkan(s) {
    if (s.selesai) return false;
    s.papan = s.papan.map((k, i) => (s.tetap[i] ? k : null));
    s.terpilih = null;
    s.gagal = [];
    return true;
  }

  // Ranked gagal: papan terkunci tanpa dianggap menang.
  function akhiriSesi(s) {
    s.selesai = true;
    s.kalah = true;
    bersihkanPilihan(s);
  }

  // Mengembalikan null kalau papan belum penuh.
  function kunci(s) {
    if (s.selesai || s.papan.includes(null)) return null;
    s.gagal = garisGagal(s.papan);
    if (s.gagal.length) {
      s.kunciSalah += 1;
      return { benar: false, gagal: s.gagal };
    }
    s.selesai = true;
    return { benar: true, gagal: [] };
  }

  return {
    DEK, GARIS, NAMA_GARIS,
    adalahRasi, pelengkap, garisGagal, papanBenar,
    cariSolusi, hitungSolusi, ukurPenalaran,
    mulaiSesi, kartuDipakai, tekanKartu, tekanSlot, taruhKartu, pindahKartu, ambilKartu, bukaPetunjuk, kosongkan, kunci, akhiriSesi,
    kartuTertutup, jumlahRasiDi, ukurTertutup,
  };
});
