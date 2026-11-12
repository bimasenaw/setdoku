/*
 * SETDOKU: aturan duel online (tahap 4a), tanpa jaringan dan tanpa kode tampilan.
 * Kedua pemain menerima puzzle yang sama. Hasil tidak ditulis ke database, tetapi dihitung
 * setiap HP dari data room yang sama, jadi kemenangan palsu dari HP yang diubah tidak diakui lawan.
 * Waktu selalu dikirim lewat parameter `sekarang` (ms, waktu server), jadi semuanya bisa dites.
 * Dimuat oleh browser (window.DuelOnline) dan Node (require).
 */
(function (root, buat) {
  const diNode = typeof module === 'object' && module.exports;
  const api = buat(
    diNode ? require('./puzzle.js') : root.Puzzle,
    diNode ? require('./progres.js') : root.Progres,
  );
  if (diNode) module.exports = api;
  else root.DuelOnline = api;
})(typeof self !== 'undefined' ? self : this, function (P, R) {
  const VERSI = 1;

  // Tanpa 0, O, 1, dan I, supaya kode mudah dibacakan ke teman.
  const ALFABET_KODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const PANJANG_KODE = 5;
  const POLA_KODE = /^[A-HJ-NP-Z2-9]{5}$/;

  const NAMA_MIN = 3;
  const NAMA_MAKS = 16;

  const MASA_TUNGGU_MS = 10 * 60 * 1000; // room tanpa lawan kedaluwarsa
  const HITUNG_MUNDUR_MS = 4000; // jeda dari "mulai" sampai papan tampil
  const BATAS_PUTUS_MS = 30 * 1000; // pemain yang putus boleh kembali selama ini
  const TENGGANG_KIRIM_MS = 5000; // papan terakhir boleh tiba sedikit setelah waktu habis
  const JEDA_AMAN_MS = 2000; // menunggu papan lawan yang masih di perjalanan
  const BEKU_KUNCI_MS = 5 * 1000; // penalti kunci salah

  const KESULITAN = ['easy', 'medium', 'hard'];
  const JENIS = ['practice', 'ranked'];
  const CHAPTER_MAKS = 2; // Kartu Tersembunyi (Chapter 3) menyusul
  const KOSONG_MIN = 4; // puzzle dengan 2 atau 3 slot kosong terlalu singkat untuk diadu

  /* Username dan kode room */

  // Mengembalikan nama yang rapi, atau null kalau panjangnya tidak 3 sampai 16 karakter.
  function rapikanNama(teks) {
    if (typeof teks !== 'string') return null;
    const nama = teks.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    const panjang = [...nama].length;
    return panjang >= NAMA_MIN && panjang <= NAMA_MAKS ? nama : null;
  }

  // Huruf kecil, spasi, dan tanda hubung dimaafkan, karena kode sering diketik dari chat.
  function rapikanKode(teks) {
    return String(teks == null ? '' : teks).toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function kodeSah(kode) {
    return typeof kode === 'string' && POLA_KODE.test(kode);
  }

  function buatKode(rng = Math.random) {
    let kode = '';
    for (let i = 0; i < PANJANG_KODE; i++) kode += ALFABET_KODE[Math.floor(rng() * ALFABET_KODE.length)];
    return kode;
  }

  /* Puzzle */

  // Sidik jari isi puzzle. Dua HP dengan versi game berbeda akan punya sidik berbeda.
  function sidikPuzzle(puzzle) {
    const teks = `${puzzle.papan.map((k) => (k === null ? 'x' : k)).join(',')}|${puzzle.tersedia.join(',')}`;
    let h = 5381;
    for (let i = 0; i < teks.length; i++) h = ((h * 33) ^ teks.charCodeAt(i)) >>> 0;
    return h;
  }

  function bolehDiadu(level, jenis) {
    if (!level || level.chapter > CHAPTER_MAKS || !JENIS.includes(jenis)) return false;
    const puzzle = level[jenis];
    if (!puzzle || (puzzle.tutup && puzzle.tutup.length)) return false;
    return puzzle.papan.filter((k) => k === null).length >= KOSONG_MIN;
  }

  function daftarPuzzle(LEVEL, kesulitan) {
    const hasil = [];
    for (const level of LEVEL) {
      if (level.kesulitan !== kesulitan) continue;
      for (const jenis of JENIS) {
        if (bolehDiadu(level, jenis)) hasil.push({ level: level.level, jenis });
      }
    }
    return hasil;
  }

  // Mengembalikan { level, jenis, sidik } untuk disimpan di room, atau null kalau tidak ada.
  function pilihPuzzle(LEVEL, kesulitan, rng = Math.random) {
    const daftar = daftarPuzzle(LEVEL, kesulitan);
    if (!daftar.length) return null;
    const pilihan = daftar[Math.floor(rng() * daftar.length)];
    return { ...pilihan, sidik: sidikPuzzle(LEVEL[pilihan.level - 1][pilihan.jenis]) };
  }

  // Puzzle milik room, atau null kalau datanya tidak cocok dengan game di HP ini.
  function ambilPuzzle(LEVEL, room) {
    if (!room || !KESULITAN.includes(room.kesulitan) || !Number.isInteger(room.level)) return null;
    const level = LEVEL[room.level - 1];
    if (!level || level.kesulitan !== room.kesulitan || !bolehDiadu(level, room.jenis)) return null;
    const puzzle = level[room.jenis];
    return sidikPuzzle(puzzle) === room.sidik ? puzzle : null;
  }

  const simpananSolusi = new WeakMap();

  function solusi(puzzle) {
    if (!simpananSolusi.has(puzzle)) simpananSolusi.set(puzzle, P.cariSolusi(puzzle, 1)[0] || null);
    return simpananSolusi.get(puzzle);
  }

  /* Papan yang dikirim. Slot kosong ditulis -1, karena database tidak menyimpan null di dalam larik. */

  function keKawat(papan) {
    return papan.map((k) => (k === null ? -1 : k));
  }

  // { sah, benar, penuh }: benar adalah jumlah slot isian yang cocok dengan solusi.
  function nilaiJawaban(puzzle, kawat) {
    const gagal = { sah: false, benar: 0, penuh: false };
    if (!Array.isArray(kawat) || kawat.length !== 9) return gagal;
    const dipakai = new Set();
    for (let i = 0; i < 9; i++) {
      const k = kawat[i];
      if (!Number.isInteger(k)) return gagal;
      if (puzzle.papan[i] !== null) {
        if (k !== puzzle.papan[i]) return gagal;
        continue;
      }
      if (k === -1) continue;
      if (!puzzle.tersedia.includes(k) || dipakai.has(k)) return gagal;
      dipakai.add(k);
    }
    const kunci = solusi(puzzle);
    if (!kunci) return gagal;
    let benar = 0;
    for (let i = 0; i < 9; i++) {
      if (puzzle.papan[i] === null && kawat[i] === kunci[i]) benar += 1;
    }
    const penuh = P.papanBenar(kawat.map((k) => (k === -1 ? null : k)));
    return { sah: true, benar, penuh };
  }

  /* Waktu dan keadaan room */

  const angka = (n) => typeof n === 'number' && Number.isFinite(n);

  function sudahMulai(room) {
    return !!room && typeof room.tuan === 'string' && typeof room.tamu === 'string' && angka(room.mulaiPada);
  }

  // Papan tampil setelah hitung mundur, dihitung dari waktu server saat duel dimulai.
  function mulaiMain(room) {
    return room.mulaiPada + HITUNG_MUNDUR_MS;
  }

  function tenggat(room) {
    return mulaiMain(room) + R.DURASI_MS[room.kesulitan];
  }

  function lawanDari(room, uid) {
    if (!room) return null;
    if (room.tuan === uid) return room.tamu || null;
    if (room.tamu === uid) return room.tuan || null;
    return null;
  }

  function dataPemain(room, uid) {
    return (room && room.pemain && uid && room.pemain[uid]) || null;
  }

  function kedaluwarsa(room, sekarang) {
    return !!room && !room.tamu && angka(room.dibuat) && sekarang >= room.dibuat + MASA_TUNGGU_MS;
  }

  // Ada pemain yang keluar sebelum papan tampil. Duel dianggap tidak pernah terjadi.
  function batal(room) {
    if (!room || !room.pemain) return false;
    const batasnya = sudahMulai(room) ? mulaiMain(room) : Infinity;
    return [room.tuan, room.tamu].some((uid) => {
      const p = dataPemain(room, uid);
      return !!p && angka(p.menyerah) && p.menyerah < batasnya;
    });
  }

  /*
   * Hasil duel, atau null kalau belum selesai.
   * { pemenang: uid | null (seri), alasan, benar: { uid: jumlah } }
   * alasan: benar (mengunci jawaban benar lebih dulu), waktu (waktu habis, dihitung dari
   * posisi benar), menyerah, putus, atau rusak (puzzle room tidak cocok dengan game ini).
   */
  function hasil(room, LEVEL, sekarang) {
    if (!sudahMulai(room) || batal(room)) return null;
    const pemain = [room.tuan, room.tamu];
    const puzzle = ambilPuzzle(LEVEL, room);
    if (!puzzle) return { pemenang: null, alasan: 'rusak', benar: {} };

    const awal = mulaiMain(room);
    const batas = tenggat(room);
    const nilai = {};
    const benar = {};
    for (const uid of pemain) {
      const j = room.jawaban && room.jawaban[uid];
      const tepat = j && angka(j.pada) && j.pada >= awal && j.pada <= batas + TENGGANG_KIRIM_MS;
      nilai[uid] = tepat ? { ...nilaiJawaban(puzzle, j.papan), pada: j.pada } : null;
      benar[uid] = nilai[uid] && nilai[uid].sah ? nilai[uid].benar : 0;
    }

    // Kejadian yang mengakhiri duel sebelum waktu habis. Yang paling awal yang berlaku.
    const kejadian = [];
    pemain.forEach((uid, n) => {
      const lawan = pemain[1 - n];
      const v = nilai[uid];
      if (v && v.sah && v.penuh && v.pada <= batas) kejadian.push({ pada: v.pada, pemenang: uid, alasan: 'benar', urut: 0 });
      const p = dataPemain(room, uid);
      if (p && angka(p.menyerah) && p.menyerah < batas) kejadian.push({ pada: p.menyerah, pemenang: lawan, alasan: 'menyerah', urut: 1 });
    });
    const a = room.akhir;
    if (a && a.alasan === 'putus' && pemain.includes(a.pemenang) && angka(a.pada) && a.pada < batas) {
      kejadian.push({ pada: a.pada, pemenang: a.pemenang, alasan: 'putus', urut: 2 });
    }
    if (kejadian.length) {
      kejadian.sort((x, y) => x.pada - y.pada || x.urut - y.urut || (x.pemenang < y.pemenang ? -1 : 1));
      const { pemenang, alasan } = kejadian[0];
      return { pemenang, alasan, benar };
    }

    if (sekarang < batas) return null;
    const lengkap = pemain.every((uid) => room.jawaban && room.jawaban[uid]);
    if (!lengkap && sekarang < batas + TENGGANG_KIRIM_MS + JEDA_AMAN_MS) return null;
    const [x, y] = pemain;
    const pemenang = benar[x] === benar[y] ? null : benar[x] > benar[y] ? x : y;
    return { pemenang, alasan: 'waktu', benar };
  }

  /*
   * Keadaan room dari sudut pandang satu pemain.
   * fase: tiada, kedaluwarsa, menunggu (belum ada lawan), siap (lawan ada, belum dimulai),
   * batal, hitung (hitung mundur), main, hitung-hasil (waktu habis, menunggu papan lawan), selesai.
   */
  function keadaan(room, LEVEL, uid, sekarang) {
    if (!room) return { fase: 'tiada' };
    const lawan = lawanDari(room, uid);
    const dasar = { lawan, namaLawan: (dataPemain(room, lawan) || {}).nama || null };
    if (batal(room)) return { ...dasar, fase: 'batal' };
    if (!room.tamu) return { ...dasar, fase: kedaluwarsa(room, sekarang) ? 'kedaluwarsa' : 'menunggu' };
    if (!sudahMulai(room)) return { ...dasar, fase: 'siap' };
    const waktu = { ...dasar, mulaiMain: mulaiMain(room), tenggat: tenggat(room) };
    const h = hasil(room, LEVEL, sekarang);
    if (h) return { ...waktu, fase: 'selesai', hasil: h };
    if (sekarang < waktu.mulaiMain) return { ...waktu, fase: 'hitung' };
    if (sekarang < waktu.tenggat) return { ...waktu, fase: 'main' };
    return { ...waktu, fase: 'hitung-hasil' };
  }

  // Pembuat room memulai duel begitu lawan sudah bergabung dan tersambung.
  function bisaMulai(room, uid) {
    if (!room || room.tuan !== uid || !room.tamu || angka(room.mulaiPada) || batal(room)) return false;
    const tamu = dataPemain(room, room.tamu);
    return !!tamu && tamu.tersambung === true;
  }

  // Sisa waktu lawan untuk kembali, atau null kalau lawan tersambung.
  function sisaPutusMs(room, uid, sekarang) {
    const p = dataPemain(room, lawanDari(room, uid));
    if (!p || p.tersambung !== false || !angka(p.putusPada)) return null;
    // Jam HP bisa sedikit tertinggal dari server, jadi sisanya tidak boleh melebihi batasnya.
    return Math.min(BATAS_PUTUS_MS, Math.max(0, p.putusPada + BATAS_PUTUS_MS - sekarang));
  }

  function bisaKlaimPutus(room, LEVEL, uid, sekarang) {
    if (!sudahMulai(room) || room.akhir || hasil(room, LEVEL, sekarang)) return false;
    if (sekarang >= tenggat(room)) return false;
    return sisaPutusMs(room, uid, sekarang) === 0;
  }

  return {
    VERSI, ALFABET_KODE, PANJANG_KODE, NAMA_MIN, NAMA_MAKS, KESULITAN,
    MASA_TUNGGU_MS, HITUNG_MUNDUR_MS, BATAS_PUTUS_MS, TENGGANG_KIRIM_MS, JEDA_AMAN_MS, BEKU_KUNCI_MS,
    rapikanNama, rapikanKode, kodeSah, buatKode,
    sidikPuzzle, daftarPuzzle, pilihPuzzle, ambilPuzzle, solusi,
    keKawat, nilaiJawaban,
    sudahMulai, mulaiMain, tenggat, lawanDari, kedaluwarsa, batal,
    hasil, keadaan, bisaMulai, sisaPutusMs, bisaKlaimPutus,
  };
});
