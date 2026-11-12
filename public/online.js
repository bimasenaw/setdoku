/*
 * SETDOKU: penghubung ke Firebase untuk duel online (tahap 4a).
 * SDK Firebase dimuat dari CDN gstatic, dan hanya saat Duel online dibuka. Solo dan Duel lokal
 * tidak menyentuh file ini, jadi tetap tanpa dependensi dan tetap jalan tanpa internet.
 * Aturan permainannya ada di duel-online.js. File ini hanya membaca dan menulis data room.
 */
(function (root) {
  const D = root.DuelOnline;
  const VERSI_SDK = '13.2.0';
  const CDN = `https://www.gstatic.com/firebasejs/${VERSI_SDK}/`;
  const BATAS_MS = 12000;

  // Hanya untuk pengujian di komputer sendiri: alamat dengan ?emulator memakai Firebase Emulator.
  const pakaiEmulator = new URLSearchParams(root.location.search).has('emulator')
    && ['', 'localhost', '127.0.0.1'].includes(root.location.hostname);

  let janjiSdk = null;
  let janjiMasuk = null;
  let f = null; // fungsi Realtime Database
  let db = null;
  let auth = null;
  let fungsiAuth = null;
  let uid = null;
  let selisihWaktu = 0;
  let tersambung = false;
  const pendengarSambung = new Set();
  let lepasHadir = null;

  // jenis: jaringan, tiada, penuh, sendiri, versi, kedaluwarsa, atau gagal.
  function galat(jenis, asal = null) {
    const e = new Error(jenis);
    e.jenis = jenis;
    e.asal = asal;
    return e;
  }

  const ditolak = (e) => /permission[_ ]denied/i.test(`${e && e.code} ${e && e.message}`);

  // Tulisan ke database tidak pernah gagal saat offline, hanya menunggu. Tanpa batas waktu,
  // pemain akan menatap layar yang diam. saatTelat dipanggil kalau tulisannya baru tiba kemudian.
  function denganBatas(janji, saatTelat = null) {
    return new Promise((selesai, tolak) => {
      let telat = false;
      const id = setTimeout(() => {
        telat = true;
        tolak(galat('jaringan'));
      }, BATAS_MS);
      janji.then((nilai) => {
        clearTimeout(id);
        if (!telat) selesai(nilai);
        else if (saatTelat) saatTelat(nilai);
      }, (e) => {
        clearTimeout(id);
        if (!telat) tolak(e.jenis ? e : galat(ditolak(e) ? 'ditolak' : 'gagal', e));
      });
    });
  }

  function muatSdk() {
    if (!janjiSdk) {
      janjiSdk = Promise.all([
        import(`${CDN}firebase-app.js`),
        import(`${CDN}firebase-auth.js`),
        import(`${CDN}firebase-database.js`),
      ]).then(([app, modulAuth, modulDb]) => {
        const config = pakaiEmulator
          ? { ...root.FirebaseConfig, projectId: 'demo-setdoku', databaseURL: 'https://demo-setdoku-default-rtdb.firebaseio.com' }
          : root.FirebaseConfig;
        const aplikasi = app.initializeApp(config);
        auth = modulAuth.getAuth(aplikasi);
        db = modulDb.getDatabase(aplikasi);
        if (pakaiEmulator) {
          modulAuth.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
          modulDb.connectDatabaseEmulator(db, '127.0.0.1', 9000);
        }
        fungsiAuth = modulAuth;
        f = modulDb;
        f.onValue(f.ref(db, '.info/serverTimeOffset'), (s) => { selisihWaktu = s.val() || 0; });
        f.onValue(f.ref(db, '.info/connected'), (s) => {
          tersambung = s.val() === true;
          pendengarSambung.forEach((fn) => fn(tersambung));
        });
      }).catch((e) => {
        janjiSdk = null; // boleh dicoba lagi, misalnya setelah internet kembali
        throw galat('jaringan', e);
      });
    }
    return janjiSdk;
  }

  // Login Anonim: pemain tidak mendaftar, tetapi setiap perangkat punya ID untuk aturan keamanan.
  function masuk() {
    if (!janjiMasuk) {
      janjiMasuk = denganBatas(muatSdk().then(() => fungsiAuth.signInAnonymously(auth)).then((kred) => {
        uid = kred.user.uid;
        return uid;
      })).catch((e) => {
        janjiMasuk = null;
        // Login yang ditolak server bukan masalah internet, jadi pesannya dibedakan.
        throw e.jenis === 'gagal' && /network/i.test(String(e.asal && e.asal.code)) ? galat('jaringan', e.asal) : e;
      });
    }
    return janjiMasuk;
  }

  const refRoom = (kode, ...anak) => f.ref(db, ['rooms', kode, ...anak].join('/'));
  const waktuServer = () => Date.now() + selisihWaktu;

  // Menunggu sambungan sebentar, supaya tulisan tidak mengantre diam-diam saat offline.
  function tungguSambung() {
    if (tersambung) return Promise.resolve();
    return denganBatas(new Promise((selesai) => {
      const fn = (ya) => {
        if (!ya) return;
        pendengarSambung.delete(fn);
        selesai();
      };
      pendengarSambung.add(fn);
    }));
  }

  async function buatRoom({ nama, kesulitan }) {
    await masuk();
    await tungguSambung();
    for (let coba = 0; coba < 5; coba++) {
      const kode = D.buatKode();
      const puzzle = D.pilihPuzzle(root.DataLevel, kesulitan);
      if (!puzzle) throw galat('gagal');
      const tulis = f.set(refRoom(kode), {
        v: D.VERSI,
        dibuat: f.serverTimestamp(),
        tuan: uid,
        kesulitan,
        level: puzzle.level,
        jenis: puzzle.jenis,
        sidik: puzzle.sidik,
        pemain: { [uid]: { nama, tersambung: true } },
      });
      try {
        // Room yang baru jadi setelah pemain menyerah menunggu langsung dibuang.
        await denganBatas(tulis, () => f.remove(refRoom(kode)).catch(() => {}));
        return kode;
      } catch (e) {
        // Ditolak berarti kodenya sedang dipakai room lain, jadi dicoba dengan kode baru.
        if (e.jenis !== 'ditolak') throw e;
      }
    }
    throw galat('gagal');
  }

  async function gabungRoom(kode, nama) {
    await masuk();
    await tungguSambung();
    let room;
    try {
      room = (await denganBatas(f.get(refRoom(kode)))).val();
    } catch (e) {
      // Room yang sudah berisi dua pemain tidak bisa dibaca orang ketiga.
      throw e.jenis === 'ditolak' ? galat('penuh') : e;
    }
    if (!room) throw galat('tiada');
    // Pemain yang memuat ulang halaman di tengah duel boleh masuk lagi lewat kodenya.
    if (room.tamu && (room.tuan === uid || room.tamu === uid)) return;
    // Dua tab di browser yang sama memakai ID yang sama, jadi tidak bisa saling melawan.
    if (room.tuan === uid) throw galat('sendiri');
    if (room.tamu) throw galat('penuh');
    if (room.v !== D.VERSI || !D.ambilPuzzle(root.DataLevel, room)) throw galat('versi');
    if (D.kedaluwarsa(room, waktuServer())) throw galat('kedaluwarsa');
    const tulis = f.update(refRoom(kode), {
      tamu: uid,
      [`pemain/${uid}`]: { nama, tersambung: true },
    });
    try {
      // Kalau baru berhasil setelah pemain menyerah menunggu, duelnya dibatalkan.
      await denganBatas(tulis, () => menyerah(kode).catch(() => {}));
    } catch (e) {
      throw e.jenis === 'ditolak' ? galat('penuh') : e;
    }
  }

  // saatBerubah(room | null) dipanggil setiap data room berubah. Mengembalikan fungsi berhenti.
  function pantau(kode, saatBerubah, saatGalat) {
    return f.onValue(refRoom(kode), (s) => saatBerubah(s.val()), (e) => saatGalat(galat(ditolak(e) ? 'ditolak' : 'gagal', e)));
  }

  // O-5: server menandai pemain yang putus, lengkap dengan waktunya.
  function hadir(kode) {
    berhentiHadir();
    const saya = refRoom(kode, 'pemain', uid);
    const saatPutus = f.onDisconnect(saya);
    const saatSambung = (ya) => {
      if (!ya) return;
      saatPutus.update({ tersambung: false, putusPada: f.serverTimestamp() }).catch(() => {});
      f.update(saya, { tersambung: true, putusPada: null }).catch(() => {});
    };
    pendengarSambung.add(saatSambung);
    if (tersambung) saatSambung(true);
    lepasHadir = () => {
      pendengarSambung.delete(saatSambung);
      saatPutus.cancel().catch(() => {});
    };
  }

  function berhentiHadir() {
    if (lepasHadir) lepasHadir();
    lepasHadir = null;
  }

  const mulai = (kode) => f.set(refRoom(kode, 'mulaiPada'), f.serverTimestamp());
  const kirimJawaban = (kode, kawat) => f.set(refRoom(kode, 'jawaban', uid), { papan: kawat, pada: f.serverTimestamp() });
  const menyerah = (kode) => f.set(refRoom(kode, 'pemain', uid, 'menyerah'), f.serverTimestamp());
  const klaimPutus = (kode) => f.set(refRoom(kode, 'akhir'), { pemenang: uid, alasan: 'putus', pada: f.serverTimestamp() });
  const hapusRoom = (kode) => f.remove(refRoom(kode));
  const ajak = (kode, kodeBaru) => f.set(refRoom(kode, 'lanjut'), kodeBaru);
  const bacaAjakan = (kode) => denganBatas(f.get(refRoom(kode, 'lanjut'))).then((s) => s.val());

  function saatSambungBerubah(fn) {
    pendengarSambung.add(fn);
    return () => pendengarSambung.delete(fn);
  }

  root.Online = {
    masuk, buatRoom, gabungRoom, pantau, hadir, berhentiHadir,
    mulai, kirimJawaban, menyerah, klaimPutus, hapusRoom, ajak, bacaAjakan,
    waktuServer, saatSambungBerubah,
    uid: () => uid,
    tersambung: () => tersambung,
  };
})(typeof self !== 'undefined' ? self : this);
