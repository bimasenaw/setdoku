/*
 * SETDOKU: aturan duel online beronde (tahap 4a), tanpa jaringan dan tanpa kode tampilan.
 * Rancangannya ada di PRD_DUEL_RONDE.md. Satu pertandingan berisi beberapa ronde, dan setiap
 * ronde bernilai satu poin. Ada dua sistem:
 *   rebutan: puzzle sama, yang lebih dulu mengunci benar dapat poin, lalu keduanya pindah ronde.
 *   balapan: tiap pemain maju sendiri, dan setiap puzzle yang selesai memberi dia satu poin.
 * Skor dan pemenang tidak ditulis ke database, tetapi dihitung setiap HP dari data room yang
 * sama, jadi kemenangan palsu dari HP yang diubah tidak diakui lawan.
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
  const VERSI = 2;

  // Tanpa 0, O, 1, dan I, supaya kode mudah dibacakan ke teman.
  const ALFABET_KODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const PANJANG_KODE = 5;
  const POLA_KODE = /^[A-HJ-NP-Z2-9]{5}$/;

  const NAMA_MIN = 3;
  const NAMA_MAKS = 16;

  const MASA_TUNGGU_MS = 10 * 60 * 1000; // room tanpa lawan kedaluwarsa
  const HITUNG_MUNDUR_MS = 4000; // jeda dari "mulai" sampai papan ronde pertama tampil
  const JEDA_RONDE_MS = 5000; // rebutan: jeda dari akhir satu ronde ke awal ronde berikutnya
  const BATAS_PUTUS_MS = 30 * 1000; // pemain yang putus boleh kembali selama ini
  const JEDA_AMAN_MS = 2000; // menunggu jawaban yang masih di perjalanan saat waktu habis
  const BEKU_KUNCI_MS = 7 * 1000; // penalti kunci salah

  const KESULITAN = ['easy', 'medium', 'hard'];
  const TARGET = [3, 5, 7, 10]; // poin untuk menang
  const SISTEM = ['rebutan', 'balapan'];
  const ATUR_AWAL = Object.freeze({ kesulitan: 'medium', target: 3, sistem: 'rebutan' });
  const JENIS = ['practice', 'ranked'];
  const CHAPTER_MAKS = 2; // Kartu Tersembunyi (Chapter 3) menyusul
  const KOSONG_MIN = 4; // puzzle dengan 2 atau 3 slot kosong terlalu singkat untuk diadu

  const angka = (n) => typeof n === 'number' && Number.isFinite(n);

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

  /* Pengaturan pertandingan */

  function aturSah(atur) {
    return !!atur && KESULITAN.includes(atur.kesulitan) && TARGET.includes(atur.target) && SISTEM.includes(atur.sistem);
  }

  // Rebutan: seperti "best of", jadi 3 poin berarti paling banyak 5 ronde.
  // Balapan: setiap pemain cukup menyelesaikan puzzle sebanyak poin targetnya.
  function jumlahRonde(atur) {
    return atur.sistem === 'rebutan' ? atur.target * 2 - 1 : atur.target;
  }

  /* Puzzle */

  const hash = (teks, awal = 5381) => {
    let h = awal;
    for (let i = 0; i < teks.length; i++) h = ((h * 33) ^ teks.charCodeAt(i)) >>> 0;
    return h;
  };

  // Sidik jari isi puzzle. Dua HP dengan versi game berbeda akan punya sidik berbeda.
  function sidikPuzzle(puzzle) {
    return hash(`${puzzle.papan.map((k) => (k === null ? 'x' : k)).join(',')}|${puzzle.tersedia.join(',')}`);
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

  const simpananSidik = new WeakMap();

  // Sidik jari seluruh kumpulan puzzle duel. Disimpan di room saat dibuat, supaya HP dengan
  // versi game lain tahu sejak bergabung, bukan baru saat puzzle pertamanya tampil.
  function sidikKumpulan(LEVEL) {
    if (!simpananSidik.has(LEVEL)) {
      let h = 5381;
      for (const kesulitan of KESULITAN) {
        for (const { level, jenis } of daftarPuzzle(LEVEL, kesulitan)) {
          h = hash(`${level}${jenis}${sidikPuzzle(LEVEL[level - 1][jenis])}`, h);
        }
      }
      simpananSidik.set(LEVEL, h);
    }
    return simpananSidik.get(LEVEL);
  }

  // Daftar puzzle untuk seluruh pertandingan: [{ level, jenis, sidik }], semuanya berbeda.
  function pilihDaftarPuzzle(LEVEL, atur, rng = Math.random) {
    if (!aturSah(atur)) return null;
    const kumpulan = daftarPuzzle(LEVEL, atur.kesulitan);
    const butuh = jumlahRonde(atur);
    if (kumpulan.length < butuh) return null;
    for (let i = kumpulan.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [kumpulan[i], kumpulan[j]] = [kumpulan[j], kumpulan[i]];
    }
    return kumpulan.slice(0, butuh).map((p) => ({ ...p, sidik: sidikPuzzle(LEVEL[p.level - 1][p.jenis]) }));
  }

  function ambilPuzzle(LEVEL, kesulitan, pilihan) {
    if (!pilihan || !Number.isInteger(pilihan.level)) return null;
    const level = LEVEL[pilihan.level - 1];
    if (!level || level.kesulitan !== kesulitan || !bolehDiadu(level, pilihan.jenis)) return null;
    const puzzle = level[pilihan.jenis];
    return sidikPuzzle(puzzle) === pilihan.sidik ? puzzle : null;
  }

  const simpananDaftar = new WeakMap();

  // Puzzle semua ronde milik room, atau null kalau datanya tidak cocok dengan game di HP ini.
  function ambilDaftarPuzzle(LEVEL, room) {
    if (!room || !aturSah(room.atur) || !room.puzzle || typeof room.puzzle !== 'object') return null;
    if (simpananDaftar.has(room.puzzle)) return simpananDaftar.get(room.puzzle);
    const butuh = jumlahRonde(room.atur);
    let daftar = Object.keys(room.puzzle).length === butuh ? [] : null;
    for (let r = 0; daftar && r < butuh; r++) {
      const puzzle = ambilPuzzle(LEVEL, room.atur.kesulitan, room.puzzle[r]);
      if (!puzzle || daftar.includes(puzzle)) daftar = null;
      else daftar.push(puzzle);
    }
    simpananDaftar.set(room.puzzle, daftar);
    return daftar;
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

  // Hanya papan yang penuh dan benar yang dikirim, dan HP lawan memeriksanya sekali lagi di sini.
  function jawabanBenar(puzzle, kawat) {
    const nilai = nilaiJawaban(puzzle, kawat);
    return nilai.sah && nilai.penuh;
  }

  /* Waktu dan keadaan room */

  function sudahMulai(room) {
    return !!room && typeof room.tuan === 'string' && typeof room.tamu === 'string' && angka(room.mulaiPada) && aturSah(room.atur);
  }

  // Papan ronde pertama tampil setelah hitung mundur, dihitung dari waktu server saat mulai.
  function mulaiMain(room) {
    return room.mulaiPada + HITUNG_MUNDUR_MS;
  }

  const durasiRonde = (room) => R.DURASI_MS[room.atur.kesulitan];

  // Rebutan: timer per ronde. Balapan: satu batas waktu untuk seluruh pertandingan.
  function durasiTimer(atur) {
    return atur.sistem === 'rebutan' ? R.DURASI_MS[atur.kesulitan] : R.DURASI_MS[atur.kesulitan] * atur.target;
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

  // Siap berlaku untuk satu versi pengaturan. Kalau pengaturan diubah, nomor versinya naik,
  // jadi tanda siap yang lama otomatis tidak berlaku lagi.
  function sudahSiap(room, uid) {
    const p = dataPemain(room, uid);
    return !!p && !!room.atur && angka(room.atur.rev) && p.siap === room.atur.rev;
  }

  // Pertandingan dimulai oleh HP pembuat room, begitu kedua pemain siap dan tersambung.
  function bisaMulai(room, uid) {
    if (!room || room.tuan !== uid || !room.tamu || angka(room.mulaiPada) || batal(room) || !aturSah(room.atur)) return false;
    return [room.tuan, room.tamu].every((p) => sudahSiap(room, p) && dataPemain(room, p).tersambung === true);
  }

  const jawabanDari = (room, r, uid) => (room.ronde && room.ronde[r] && room.ronde[r][uid]) || null;

  /*
   * Jalannya rebutan sampai `sekarang`. Jawaban dengan waktu di atas `batasJawaban` diabaikan.
   * Awal setiap ronde dihitung dari akhir ronde sebelumnya, jadi kedua HP selalu sepakat tanpa
   * perlu menulis apa pun selain jawaban.
   */
  function jalanRebutan(room, daftar, sekarang, batasJawaban) {
    const pemain = [room.tuan, room.tamu];
    const durasi = durasiRonde(room);
    const jumlah = daftar.length;
    const skor = { [pemain[0]]: 0, [pemain[1]]: 0 };
    const riwayat = [];
    let mulai = mulaiMain(room);
    for (let r = 0; r < jumlah; r++) {
      const tenggat = mulai + durasi;
      let juara = null;
      for (const uid of pemain) {
        const j = jawabanDari(room, r, uid);
        if (!j || !angka(j.pada) || j.pada < mulai || j.pada > tenggat || j.pada > batasJawaban) continue;
        if (!jawabanBenar(daftar[r], j.papan)) continue;
        if (!juara || j.pada < juara.pada || (j.pada === juara.pada && uid < juara.uid)) juara = { uid, pada: j.pada };
      }
      let akhir;
      if (juara) {
        skor[juara.uid] += 1;
        akhir = juara.pada;
      } else if (sekarang >= tenggat + JEDA_AMAN_MS) {
        akhir = tenggat; // K-2: waktu ronde habis, tidak ada yang mendapat poin
      } else {
        const fase = sekarang < mulai ? (r === 0 ? 'hitung' : 'jeda') : sekarang < tenggat ? 'main' : 'tunggu';
        return { selesai: false, fase, ronde: r, mulai, tenggat, skor, riwayat };
      }
      riwayat.push({ pemenang: juara ? juara.uid : null, pada: akhir });
      if ((juara && skor[juara.uid] >= room.atur.target) || r === jumlah - 1) {
        const [x, y] = pemain;
        const pemenang = skor[x] === skor[y] ? null : skor[x] > skor[y] ? x : y;
        return { selesai: true, pemenang, alasan: 'poin', pada: akhir, ronde: r, skor, riwayat };
      }
      mulai = akhir + JEDA_RONDE_MS;
    }
    return null; // tidak terjangkau: daftar puzzle tidak pernah kosong
  }

  // Jalannya balapan. Jawaban harus berurutan: ronde 2 baru dihitung kalau ronde 1 sudah benar.
  function jalanBalapan(room, daftar, sekarang, batasJawaban) {
    const pemain = [room.tuan, room.tamu];
    const { target } = room.atur;
    const mulai = mulaiMain(room);
    const tenggat = mulai + durasiTimer(room.atur);
    const skor = {};
    const capai = {};
    for (const uid of pemain) {
      let sebelum = mulai;
      let n = 0;
      while (n < target) {
        const j = jawabanDari(room, n, uid);
        if (!j || !angka(j.pada) || j.pada < sebelum || j.pada > tenggat || j.pada > batasJawaban) break;
        if (!jawabanBenar(daftar[n], j.papan)) break;
        sebelum = j.pada;
        n += 1;
      }
      skor[uid] = n;
      capai[uid] = n >= target ? sebelum : null;
    }
    const sampai = pemain.filter((uid) => capai[uid] !== null).sort((x, y) => capai[x] - capai[y] || (x < y ? -1 : 1));
    if (sampai.length) return { selesai: true, pemenang: sampai[0], alasan: 'poin', pada: capai[sampai[0]], skor };
    if (sekarang >= tenggat + JEDA_AMAN_MS) {
      const [x, y] = pemain;
      const pemenang = skor[x] === skor[y] ? null : skor[x] > skor[y] ? x : y;
      return { selesai: true, pemenang, alasan: 'waktu', pada: tenggat, skor };
    }
    const fase = sekarang < mulai ? 'hitung' : sekarang < tenggat ? 'main' : 'tunggu';
    return { selesai: false, fase, mulai, tenggat, skor };
  }

  /*
   * Jalannya pertandingan, atau null kalau belum mulai, batal, atau datanya rusak.
   * Keluar dan klaim putus mengakhiri seluruh pertandingan, kecuali pertandingannya memang
   * sudah diputuskan lewat poin sebelum kejadian itu.
   */
  function jalannya(room, LEVEL, sekarang) {
    if (!sudahMulai(room) || batal(room)) return null;
    const daftar = ambilDaftarPuzzle(LEVEL, room);
    if (!daftar) return null;
    const pemain = [room.tuan, room.tamu];
    const jalan = room.atur.sistem === 'rebutan' ? jalanRebutan : jalanBalapan;

    const kejadian = [];
    pemain.forEach((uid, n) => {
      const p = dataPemain(room, uid);
      if (p && angka(p.menyerah)) kejadian.push({ pada: p.menyerah, pemenang: pemain[1 - n], alasan: 'menyerah', urut: 0 });
    });
    const a = room.akhir;
    if (a && a.alasan === 'putus' && pemain.includes(a.pemenang) && angka(a.pada)) {
      kejadian.push({ pada: a.pada, pemenang: a.pemenang, alasan: 'putus', urut: 1 });
    }
    if (!kejadian.length) return { ...jalan(room, daftar, sekarang, Infinity), daftar };

    kejadian.sort((x, y) => x.pada - y.pada || x.urut - y.urut || (x.pemenang < y.pemenang ? -1 : 1));
    const k = kejadian[0];
    const sampaiKejadian = jalan(room, daftar, k.pada, k.pada);
    if (sampaiKejadian.selesai) return { ...sampaiKejadian, daftar };
    return { selesai: true, pemenang: k.pemenang, alasan: k.alasan, pada: k.pada, skor: sampaiKejadian.skor, riwayat: sampaiKejadian.riwayat, daftar };
  }

  /*
   * Hasil pertandingan, atau null kalau belum selesai.
   * { pemenang: uid | null (seri), alasan, skor: { uid: poin } }
   * alasan: poin (target tercapai atau jatah ronde habis), waktu (balapan kehabisan waktu),
   * menyerah, putus, atau rusak (puzzle room tidak cocok dengan game ini).
   */
  function hasil(room, LEVEL, sekarang) {
    if (!sudahMulai(room) || batal(room)) return null;
    const j = jalannya(room, LEVEL, sekarang);
    if (!j) return { pemenang: null, alasan: 'rusak', skor: { [room.tuan]: 0, [room.tamu]: 0 } };
    return j.selesai ? { pemenang: j.pemenang, alasan: j.alasan, skor: j.skor } : null;
  }

  // Progres lawan ditulis sebagai satu angka: nomor ronde dikali 10, ditambah jumlah slot terisi.
  const kodeMaju = (ronde, isi) => ronde * 10 + Math.max(0, Math.min(9, isi));
  const jumlahKosong = (puzzle) => puzzle.papan.filter((k) => k === null).length;

  /*
   * Keadaan room dari sudut pandang satu pemain.
   * fase: tiada, kedaluwarsa, menunggu (belum ada lawan), siap (lawan ada, belum dimulai), batal,
   * hitung (hitung mundur awal), main, jeda (rebutan: di antara dua ronde),
   * tunggu (waktu habis, menunggu jawaban yang masih di perjalanan), selesai.
   * Saat bermain: ronde adalah nomor ronde pemain ini (dari 0), dan puzzle adalah puzzle-nya.
   */
  function keadaan(room, LEVEL, uid, sekarang) {
    if (!room) return { fase: 'tiada' };
    const lawan = lawanDari(room, uid);
    const dasar = {
      lawan,
      namaLawan: (dataPemain(room, lawan) || {}).nama || null,
      atur: aturSah(room.atur) ? room.atur : null,
      siapSaya: sudahSiap(room, uid),
      siapLawan: !!lawan && sudahSiap(room, lawan),
    };
    if (batal(room)) return { ...dasar, fase: 'batal' };
    if (!room.tamu) return { ...dasar, fase: kedaluwarsa(room, sekarang) ? 'kedaluwarsa' : 'menunggu' };
    if (!sudahMulai(room)) return { ...dasar, fase: 'siap' };

    const j = jalannya(room, LEVEL, sekarang);
    if (!j) return { ...dasar, fase: 'selesai', skor: { [uid]: 0, [lawan]: 0 }, hasil: hasil(room, LEVEL, sekarang) };
    const umum = { ...dasar, skor: j.skor, jumlahRonde: j.daftar.length, riwayat: j.riwayat || [] };
    if (j.selesai) return { ...umum, fase: 'selesai', hasil: { pemenang: j.pemenang, alasan: j.alasan, skor: j.skor } };

    const rebutan = room.atur.sistem === 'rebutan';
    const ronde = rebutan ? j.ronde : j.skor[uid];
    const rondeLawan = rebutan ? j.ronde : j.skor[lawan];
    const maju = (dataPemain(room, lawan) || {}).maju;
    const kosongLawan = jumlahKosong(j.daftar[rondeLawan]);
    const isiLawan = angka(maju) && Math.floor(maju / 10) === rondeLawan ? Math.min(kosongLawan, maju % 10) : 0;
    return {
      ...umum,
      fase: j.fase,
      ronde,
      rondeLawan,
      puzzle: j.daftar[ronde],
      mulai: j.mulai,
      tenggat: j.tenggat,
      isiLawan,
      kosongLawan,
    };
  }

  // Sisa waktu lawan untuk kembali, atau null kalau lawan tersambung.
  function sisaPutusMs(room, uid, sekarang) {
    const p = dataPemain(room, lawanDari(room, uid));
    if (!p || p.tersambung !== false || !angka(p.putusPada)) return null;
    // Jam HP bisa sedikit tertinggal dari server, jadi sisanya tidak boleh melebihi batasnya.
    return Math.min(BATAS_PUTUS_MS, Math.max(0, p.putusPada + BATAS_PUTUS_MS - sekarang));
  }

  function bisaKlaimPutus(room, LEVEL, uid, sekarang) {
    if (!sudahMulai(room) || batal(room) || room.akhir || sekarang < mulaiMain(room)) return false;
    if (hasil(room, LEVEL, sekarang)) return false;
    return sisaPutusMs(room, uid, sekarang) === 0;
  }

  return {
    VERSI, ALFABET_KODE, PANJANG_KODE, NAMA_MIN, NAMA_MAKS, KESULITAN, TARGET, SISTEM, ATUR_AWAL,
    MASA_TUNGGU_MS, HITUNG_MUNDUR_MS, JEDA_RONDE_MS, BATAS_PUTUS_MS, JEDA_AMAN_MS, BEKU_KUNCI_MS,
    rapikanNama, rapikanKode, kodeSah, buatKode,
    aturSah, jumlahRonde, durasiTimer,
    sidikPuzzle, sidikKumpulan, daftarPuzzle, pilihDaftarPuzzle, ambilDaftarPuzzle, solusi,
    keKawat, nilaiJawaban, jawabanBenar, kodeMaju, jumlahKosong,
    sudahMulai, mulaiMain, lawanDari, kedaluwarsa, batal, sudahSiap, bisaMulai,
    jalannya, hasil, keadaan, sisaPutusMs, bisaKlaimPutus,
  };
});
