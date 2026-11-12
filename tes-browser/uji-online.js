// Uji browser duel online beronde (tahap 4a). Lawan dan server ditirukan di dalam halaman, jadi
// yang diuji adalah alur layarnya: lobi, ruang tunggu, Siap, ronde demi ronde, dan hasil.
// Sambungan Firebase sungguhan dan aturan keamanannya diuji terpisah di uji-emulator.js.
const path = require('path');

// Penghubung tiruan dengan antarmuka yang sama seperti public/online.js.
// window.__palsu dipakai uji untuk berperan sebagai lawan dan menggeser waktu server.
function pasangPalsu() {
  const D = window.DuelOnline;
  const S = {
    uid: 'uid-saya',
    selisih: 0,
    tersambung: true,
    rooms: {},
    pendengar: {},
    sambung: new Set(),
    gagal: null, // jenis galat untuk operasi berikutnya
    tolakJawab: 0, // jumlah kiriman jawaban berikutnya yang ditolak server
    kodeBerikut: [], // kode untuk room yang dibuat berikutnya
    majuHitung: 3700, // memangkas hitung mundur awal, supaya uji tidak menunggu 4 detik
    catatan: [],
  };
  const salin = (x) => (x === undefined ? null : JSON.parse(JSON.stringify(x)));
  const galat = (jenis) => Object.assign(new Error(jenis), { jenis });
  const kabari = (kode) => (S.pendengar[kode] || []).slice().forEach((fn) => fn(salin(S.rooms[kode])));
  const nanti = (fn) => new Promise((selesai, tolak) => setTimeout(() => {
    try { selesai(fn()); } catch (e) { tolak(e); }
  }, 0));
  const sekarang = () => Date.now() + S.selisih;
  const coba = () => {
    if (!S.gagal) return;
    const jenis = S.gagal;
    S.gagal = null;
    throw galat(jenis);
  };
  const ATUR = { kesulitan: 'medium', target: 3, sistem: 'rebutan', rev: 0 };
  S.kabari = kabari;
  S.sekarang = sekarang;
  // Mengubah room seolah-olah dari HP lawan.
  S.ubah = (kode, fn) => {
    fn(S.rooms[kode], sekarang());
    kabari(kode);
  };
  // Waktu server dimajukan, misalnya untuk melewati jeda antarronde atau menghabiskan timer.
  S.maju = (ms) => {
    S.selisih += ms;
    Object.keys(S.rooms).forEach(kabari);
  };
  S.aturSambung = (ya) => {
    S.tersambung = ya;
    [...S.sambung].forEach((fn) => fn(ya));
  };
  // Room buatan lawan, siap dimasuki pemain ini.
  S.roomLawan = (kode, atur, nama) => {
    S.rooms[kode] = {
      v: D.VERSI, dibuat: sekarang(), tuan: 'uid-lawan', sidik: D.sidikKumpulan(window.DataLevel),
      atur: { ...ATUR, ...atur },
      pemain: { 'uid-lawan': { nama, tersambung: true } },
    };
  };
  S.lawanGabung = (kode, nama) => S.ubah(kode, (room) => {
    room.tamu = 'uid-lawan';
    room.pemain['uid-lawan'] = { nama, tersambung: true };
  });
  S.lawanSiap = (kode) => S.ubah(kode, (room) => { room.pemain['uid-lawan'].siap = room.atur.rev; });
  // Lawan (sebagai pembuat room) memulai pertandingan.
  S.lawanMulai = (kode) => S.ubah(kode, (room, t) => {
    room.mulaiPada = t - S.majuHitung;
    room.puzzle = D.pilihDaftarPuzzle(window.DataLevel, room.atur);
  });
  S.puzzle = (kode, r) => D.ambilDaftarPuzzle(window.DataLevel, S.rooms[kode])[r];
  // Lawan mengunci jawaban benar untuk ronde r.
  S.lawanJawab = (kode, r) => S.ubah(kode, (room, t) => {
    room.ronde = room.ronde || {};
    room.ronde[r] = room.ronde[r] || {};
    room.ronde[r]['uid-lawan'] = { papan: D.solusi(S.puzzle(kode, r)).slice(), pada: t };
  });
  window.__palsu = S;
  window.Online = {
    masuk: () => nanti(() => { coba(); return S.uid; }),
    buatRoom: ({ nama, atur }) => nanti(() => {
      coba();
      const kode = S.kodeBerikut.shift() || D.buatKode();
      S.rooms[kode] = {
        v: D.VERSI, dibuat: sekarang(), tuan: S.uid, sidik: D.sidikKumpulan(window.DataLevel),
        atur: { ...atur, rev: 0 },
        pemain: { [S.uid]: { nama, tersambung: true } },
      };
      S.catatan.push(['buat', kode, salin(atur), nama]);
      return kode;
    }),
    gabungRoom: (kode, nama) => nanti(() => {
      coba();
      const room = S.rooms[kode];
      if (!room) throw galat('tiada');
      if (room.tamu && (room.tuan === S.uid || room.tamu === S.uid)) return;
      if (room.tuan === S.uid) throw galat('sendiri');
      if (room.tamu) throw galat('penuh');
      if (room.v !== D.VERSI || room.sidik !== D.sidikKumpulan(window.DataLevel)) throw galat('versi');
      if (D.kedaluwarsa(room, sekarang())) throw galat('kedaluwarsa');
      room.tamu = S.uid;
      room.pemain[S.uid] = { nama, tersambung: true };
      S.catatan.push(['gabung', kode, nama]);
      kabari(kode);
    }),
    pantau: (kode, fn) => {
      (S.pendengar[kode] = S.pendengar[kode] || []).push(fn);
      setTimeout(() => { if ((S.pendengar[kode] || []).includes(fn)) fn(salin(S.rooms[kode])); }, 0);
      return () => { S.pendengar[kode] = (S.pendengar[kode] || []).filter((x) => x !== fn); };
    },
    hadir: (kode) => { S.catatan.push(['hadir', kode]); },
    berhentiHadir: () => {},
    ubahAtur: (kode, atur) => nanti(() => {
      const room = S.rooms[kode];
      if (room.tuan !== S.uid || room.mulaiPada || atur.rev <= room.atur.rev) throw galat('ditolak');
      room.atur = salin(atur);
      S.catatan.push(['atur', kode, salin(atur)]);
      kabari(kode);
    }),
    aturSiap: (kode, nilai) => nanti(() => {
      S.rooms[kode].pemain[S.uid].siap = nilai;
      S.catatan.push(['siap', kode, nilai]);
      kabari(kode);
    }),
    mulai: (kode, daftar) => nanti(() => {
      const room = S.rooms[kode];
      if (room.mulaiPada) throw galat('ditolak');
      room.mulaiPada = sekarang() - S.majuHitung;
      room.puzzle = salin(daftar);
      S.catatan.push(['mulai', kode, daftar.length]);
      kabari(kode);
    }),
    kirimJawaban: (kode, ronde, kawat) => nanti(() => {
      if (S.tolakJawab > 0) {
        S.tolakJawab -= 1;
        S.catatan.push(['jawab-ditolak', kode, ronde]);
        throw galat('ditolak');
      }
      const room = S.rooms[kode];
      room.ronde = room.ronde || {};
      room.ronde[ronde] = room.ronde[ronde] || {};
      room.ronde[ronde][S.uid] = { papan: kawat, pada: sekarang() };
      S.catatan.push(['jawab', kode, ronde, kawat]);
      kabari(kode);
    }),
    kirimMaju: (kode, nilai) => nanti(() => {
      S.rooms[kode].pemain[S.uid].maju = nilai;
      S.catatan.push(['maju', kode, nilai]);
      kabari(kode);
    }),
    menyerah: (kode) => nanti(() => {
      const room = S.rooms[kode];
      if (!room || !room.pemain[S.uid]) throw galat('ditolak');
      room.pemain[S.uid].menyerah = sekarang();
      S.catatan.push(['menyerah', kode]);
      kabari(kode);
    }),
    klaimPutus: (kode) => nanti(() => {
      S.rooms[kode].akhir = { pemenang: S.uid, alasan: 'putus', pada: sekarang() };
      S.catatan.push(['klaim', kode]);
      kabari(kode);
    }),
    hapusRoom: (kode) => nanti(() => {
      const room = S.rooms[kode];
      if (room && room.tamu) throw galat('ditolak');
      delete S.rooms[kode];
      S.catatan.push(['hapus', kode]);
      kabari(kode);
    }),
    ajak: (kode, baru) => nanti(() => {
      const room = S.rooms[kode];
      if (room.lanjut) throw galat('ditolak');
      room.lanjut = baru;
      S.catatan.push(['ajak', kode, baru]);
      kabari(kode);
    }),
    bacaAjakan: (kode) => nanti(() => (S.rooms[kode] || {}).lanjut || null),
    waktuServer: sekarang,
    saatSambungBerubah: (fn) => {
      S.sambung.add(fn);
      return () => S.sambung.delete(fn);
    },
    uid: () => S.uid,
    tersambung: () => S.tersambung,
  };
}

module.exports = async function ujiOnline(browser, galat, { cek, tidur, bukaHalaman, klik, teksDi, FOTO }) {
  console.log('\n== Duel online beronde (lawan dan server ditirukan) ==');

  const JEDA_RONDE = 5000;
  const buka = async (viewport = { width: 390, height: 844 }) => {
    const page = await bukaHalaman(browser, viewport, galat);
    await page.evaluate(pasangPalsu);
    return page;
  };
  const palsu = (page, fn, ...arg) => page.evaluate(fn, ...arg);
  const catatan = (page, jenis) => page.evaluate((j) => window.__palsu.catatan.filter((c) => c[0] === j), jenis);
  const terlihat = (page, id) => page.evaluate((i) => {
    const el = document.getElementById(i);
    return !!el && !el.hidden && !el.closest('[hidden]') && !el.classList.contains('pergi') && el.getBoundingClientRect().width > 0;
  }, id);
  const tunggu = (page, fn, ms = 6000, ...arg) => page.waitForFunction(fn, { timeout: ms, polling: 50 }, ...arg).then(() => true, () => false);
  const isiNama = (page, nama) => page.evaluate((n) => { document.getElementById('input-nama').value = n; }, nama);
  const isiKode = (page, kode) => page.evaluate((k) => { document.getElementById('input-kode').value = k; }, kode);
  const galatTampil = (page) => page.evaluate(() => {
    const el = document.getElementById('galat-online');
    return el.hidden ? null : el.textContent;
  });
  const toast = (page) => page.evaluate(() => {
    const el = document.querySelector('.toast:not(.keluar)');
    return el ? { teks: el.querySelector('.toast-teks').textContent, sub: (el.querySelector('.toast-sub') || {}).textContent || null } : null;
  });
  const semuaToast = (page) => page.evaluate(() => [...document.querySelectorAll('.toast .toast-teks')].map((e) => e.textContent));
  const keLobi = async (page, nama = 'Bima') => {
    await klik(page, 'tombol-online');
    await tidur(500);
    if (nama !== null) await isiNama(page, nama);
  };
  const pilihAtur = (page, bagian, nilai) => page.evaluate((b, v) => document.querySelector(`#atur-tunggu [data-atur="${b}"][data-nilai="${v}"]`).click(), bagian, String(nilai));
  const aturTampil = (page) => page.evaluate(() => Object.fromEntries(['kesulitan', 'target', 'sistem'].map((b) => {
    const aktif = document.querySelector(`#atur-tunggu [data-atur="${b}"][aria-checked="true"]`);
    return [b, aktif ? aktif.dataset.nilai : null];
  })));
  const ruang = (page) => page.evaluate(() => {
    const tampil = (id) => !document.getElementById(id).hidden;
    return {
      judul: document.getElementById('judul-tunggu').textContent,
      status: document.getElementById('status-tunggu').textContent,
      catatan: document.getElementById('catatan-tunggu').textContent,
      kode: tampil('kode-room') ? document.getElementById('kode-room').textContent : null,
      bagi: tampil('tombol-bagi-kode'),
      pemain: tampil('pemain-tunggu'),
      atur: tampil('atur-tunggu'),
      siap: tampil('tombol-siap') ? document.getElementById('tombol-siap').textContent : null,
      keluar: tampil('tombol-batal-room'),
      saya: `${document.getElementById('nama-saya-tunggu').textContent}|${document.getElementById('siap-saya').textContent}`,
      lawan: `${document.getElementById('nama-lawan-tunggu').textContent}|${document.getElementById('siap-lawan').textContent}`,
      info: document.getElementById('info-atur').textContent,
      terkunci: [...document.querySelectorAll('#atur-tunggu [data-atur]')].every((b) => b.getAttribute('aria-disabled') === 'true'),
    };
  });
  const papanTampil = (page, ms = 6000) => tunggu(page, () => !document.getElementById('layar-solo').hidden && !document.getElementById('layar-solo').classList.contains('pergi') && document.querySelectorAll('.slot').length === 9 && /^Duel · /.test(document.getElementById('judul-level').textContent) && !document.querySelector('.slot').disabled, ms);
  // Pemain ini membuat room, lawan bergabung, keduanya siap, lalu pertandingan dimulai.
  const mulaiSebagaiTuan = async (page, { atur = {}, kode = 'ABCDE', lawan = 'Budi' } = {}) => {
    await page.evaluate((a, k) => {
      localStorage.setItem('setdoku-atur-duel', JSON.stringify({ kesulitan: 'medium', target: 3, sistem: 'rebutan', ...a }));
      window.__palsu.kodeBerikut.push(k);
    }, atur, kode);
    await keLobi(page);
    await klik(page, 'tombol-buat-room');
    await tunggu(page, () => /Menunggu lawan/.test(document.getElementById('status-tunggu').textContent));
    await palsu(page, (k, nama) => { window.__palsu.lawanGabung(k, nama); window.__palsu.lawanSiap(k); }, kode, lawan);
    await tunggu(page, () => !document.getElementById('tombol-siap').hidden);
    await klik(page, 'tombol-siap');
    await papanTampil(page);
    await tidur(700);
    return kode;
  };
  // Lawan membuat room, pemain ini bergabung, keduanya siap, lalu lawan memulai.
  const mulaiSebagaiTamu = async (page, { atur = {}, kode = 'FGHJK', lawan = 'Budi' } = {}) => {
    await palsu(page, (k, a, nama) => window.__palsu.roomLawan(k, a, nama), kode, atur, lawan);
    await keLobi(page);
    await isiKode(page, kode);
    await klik(page, 'tombol-gabung');
    await tunggu(page, () => !document.getElementById('tombol-siap').hidden);
    await klik(page, 'tombol-siap');
    await tunggu(page, () => /Menunggu .* siap/.test(document.getElementById('status-tunggu').textContent));
    await palsu(page, (k) => { window.__palsu.lawanSiap(k); window.__palsu.lawanMulai(k); }, kode);
    await papanTampil(page);
    await tidur(700);
    return kode;
  };
  const dataPuzzle = (page, kode, r) => page.evaluate((k, n) => {
    const puzzle = window.__palsu.puzzle(k, n);
    return { papan: puzzle.papan, tersedia: puzzle.tersedia, solusi: DuelOnline.solusi(puzzle) };
  }, kode, r);
  // Memasang kartu lewat ketuk: ketuk kartu tersedia, lalu ketuk slot.
  const pasang = async (page, puzzle, slot, id) => {
    await page.evaluate((n, i) => {
      document.querySelectorAll('.sedia')[n].click();
      document.querySelectorAll('.slot')[i].click();
    }, puzzle.tersedia.indexOf(id), slot);
    await tidur(60);
  };
  const kosongDari = (puzzle) => puzzle.papan.flatMap((k, i) => (k === null ? [i] : []));
  const isiSemua = async (page, puzzle, { tukar = false } = {}) => {
    const kosong = kosongDari(puzzle);
    const isi = Object.fromEntries(kosong.map((i) => [i, puzzle.solusi[i]]));
    if (tukar) [isi[kosong[0]], isi[kosong[1]]] = [isi[kosong[1]], isi[kosong[0]]];
    for (const i of kosong) await pasang(page, puzzle, i, isi[i]);
    await page.waitForFunction(() => !document.querySelector('#lapisan-seret .hantu') && !document.querySelector('.menunggu'), { timeout: 5000 }).catch(() => {});
  };
  // Menyelesaikan ronde r dengan benar, lalu mengunci.
  const selesaikan = async (page, kode, r) => {
    const puzzle = await dataPuzzle(page, kode, r);
    await isiSemua(page, puzzle);
    await klik(page, 'tombol-kunci');
    return puzzle;
  };
  const bilah = (page) => page.evaluate(() => ({
    tampil: !document.getElementById('bilah-duel').hidden,
    saya: document.getElementById('skor-saya').textContent,
    lawan: document.getElementById('skor-lawan').textContent,
    info: document.getElementById('info-duel').textContent,
    nama: document.getElementById('nama-lawan-duel').textContent,
    titik: document.querySelectorAll('#titik-lawan i').length,
    isi: document.querySelectorAll('#titik-lawan i.isi').length,
    label: document.getElementById('titik-lawan').getAttribute('aria-label'),
  }));
  const lapis = (page) => page.evaluate(() => (document.getElementById('lapis-ronde').hidden ? null : {
    judul: document.getElementById('judul-ronde').textContent,
    skor: document.getElementById('skor-ronde').textContent,
    mundur: document.getElementById('mundur-ronde').textContent,
    kelas: document.getElementById('lapis-ronde').className,
  }));
  const adaLapis = (page, pola, ms = 4000) => tunggu(page, (p) => !document.getElementById('lapis-ronde').hidden && new RegExp(p).test(document.getElementById('judul-ronde').textContent), ms, pola);
  const rondeTampil = (page, teks, ms = 4000) => tunggu(page, (t) => document.getElementById('lapis-ronde').hidden && document.getElementById('info-duel').textContent === t && !document.querySelector('.slot').disabled, ms, teks);
  const majuWaktu = (page, ms) => palsu(page, (n) => window.__palsu.maju(n), ms);
  // Memajukan waktu server sampai tepat lewat tenggat timer yang sedang berjalan.
  const keTenggat = (page, kode) => palsu(page, (k) => {
    const S = window.__palsu;
    const keadaan = DuelOnline.keadaan(S.rooms[k], DataLevel, S.uid, S.sekarang());
    S.maju(keadaan.tenggat - S.sekarang() + 100);
  }, kode);
  const idPapan = (page) => page.evaluate(() => [...document.querySelectorAll('.slot')].map((s) => s.getAttribute('aria-label')).join('|'));
  const hasilTampil = (page) => page.evaluate(() => ({
    judul: document.getElementById('judul-hasil').textContent,
    kelas: document.getElementById('judul-hasil').className,
    detail: document.getElementById('detail-hasil').textContent,
    lanjut: document.getElementById('tombol-level-lanjut').hidden ? null : document.getElementById('tombol-level-lanjut').textContent,
    ulang: !document.getElementById('tombol-level-ulang').hidden,
    practice: !document.getElementById('tombol-level-practice').hidden,
    tutup: document.getElementById('tombol-level-peta').textContent,
    stars: !document.getElementById('stars-hasil').hidden,
    nyawa: !document.getElementById('nyawa-hasil').hidden,
  }));
  const adaHasil = (page, ms = 6000) => page.waitForSelector('#layar-hasil:not([hidden])', { timeout: ms }).then(() => tidur(450), () => {});

  /* Lobi */
  {
    const page = await buka();
    await keLobi(page, null);
    cek('menu: Duel online membuka lobi', await terlihat(page, 'online-lobi') && !(await terlihat(page, 'online-tunggu')));
    cek('lobi: pengaturan pertandingan tidak lagi dipilih di lobi', await page.evaluate(() => !document.querySelector('#online-lobi .segmen') && /ruang tunggu/.test(document.getElementById('online-lobi').textContent)));
    await page.screenshot({ path: path.join(FOTO, 'online-lobi.png') });

    await klik(page, 'tombol-buat-room');
    await tidur(200);
    cek('lobi: username kosong ditolak', /Username harus 3 sampai 16 karakter/.test(await galatTampil(page) || ''), String(await galatTampil(page)));
    await isiNama(page, 'ab');
    await klik(page, 'tombol-gabung');
    await tidur(200);
    cek('lobi: username 2 karakter ditolak', /Username/.test(await galatTampil(page) || ''));
    cek('lobi: tanpa username yang sah, server tidak dihubungi', (await catatan(page, 'buat')).length === 0 && (await catatan(page, 'gabung')).length === 0);

    await isiNama(page, '  Bima   Sena ');
    await isiKode(page, 'AB1');
    await klik(page, 'tombol-gabung');
    await tidur(200);
    cek('lobi: kode yang salah bentuk ditolak', /Kode room berisi 5 huruf dan angka/.test(await galatTampil(page) || ''), String(await galatTampil(page)));
    cek('lobi: username dirapikan dan disimpan', await page.evaluate(() => document.getElementById('input-nama').value === 'Bima Sena' && localStorage.getItem('setdoku-nama') === 'Bima Sena'));

    await isiKode(page, 'zzzzz');
    await klik(page, 'tombol-gabung');
    await tunggu(page, () => !document.getElementById('galat-online').hidden);
    cek('lobi: kode yang tidak ada dijelaskan', /Room tidak ditemukan/.test(await galatTampil(page) || ''), String(await galatTampil(page)));

    await palsu(page, () => { window.__palsu.gagal = 'jaringan'; });
    await klik(page, 'tombol-buat-room');
    await tunggu(page, () => !document.getElementById('galat-online').hidden);
    const sibuk = await page.evaluate(() => document.getElementById('layar-online').classList.contains('sibuk'));
    cek('lobi: gagal tersambung dijelaskan, dan tombol bisa ditekan lagi', /Tidak bisa tersambung/.test(await galatTampil(page) || '') && !sibuk && (await teksDi(page, 'tombol-buat-room')) === 'Buat room', String(await galatTampil(page)));

    // Room penuh, room versi lain, dan kode kedaluwarsa.
    await palsu(page, () => {
      const S = window.__palsu;
      S.roomLawan('PENHH', {}, 'Budi');
      S.rooms.PENHH.tamu = 'uid-orang-lain';
      S.roomLawan('VERSH', {}, 'Budi');
      S.rooms.VERSH.sidik += 1;
      S.roomLawan('VERS2', {}, 'Budi');
      S.rooms.VERS2.v = 1;
      S.roomLawan('LAMAA', {}, 'Budi');
      S.rooms.LAMAA.dibuat -= 11 * 60 * 1000;
    });
    for (const [kode, pola, nama] of [['PENHH', /sudah berisi dua pemain/, 'room penuh'], ['VERSH', /Versi game kamu berbeda/, 'isi puzzle berbeda'], ['VERS2', /Versi game kamu berbeda/, 'room dari versi game lama'], ['LAMAA', /kedaluwarsa/, 'kode kedaluwarsa']]) {
      await isiKode(page, kode);
      await klik(page, 'tombol-gabung');
      await tunggu(page, (p) => new RegExp(p).test(document.getElementById('galat-online').textContent), 3000, pola.source);
      cek(`lobi: ${nama} dijelaskan`, pola.test(await galatTampil(page) || ''), String(await galatTampil(page)));
    }

    // Room buatan sendiri: dua tab di browser yang sama tidak bisa saling melawan.
    await palsu(page, () => {
      const S = window.__palsu;
      S.roomLawan('SENDR', {}, 'Bima');
      S.rooms.SENDR.tuan = S.uid;
      S.rooms.SENDR.pemain = { [S.uid]: { nama: 'Bima', tersambung: true } };
    });
    await isiKode(page, 'SENDR');
    await klik(page, 'tombol-gabung');
    await tunggu(page, () => /room buatanmu sendiri/.test(document.getElementById('galat-online').textContent), 3000);
    cek('lobi: bergabung ke room buatan sendiri dijelaskan', /browser lain/.test(await galatTampil(page) || ''), String(await galatTampil(page)));

    await klik(page, 'tombol-online-keluar');
    const diMenu = await tunggu(page, () => !document.getElementById('layar-menu').hidden && document.getElementById('layar-online').hidden, 3000);
    cek('lobi: tombol keluar kembali ke menu', diMenu);
    await klik(page, 'tombol-online');
    await tidur(500);
    cek('lobi: username diingat saat dibuka lagi', await page.evaluate(() => document.getElementById('input-nama').value === 'Bima Sena'));
    await page.close();
  }

  /* Ruang tunggu: pembuat room mengatur pertandingan, lalu keduanya menekan Siap */
  {
    const page = await buka();
    await palsu(page, () => { window.__palsu.kodeBerikut.push('ABCDE'); });
    await keLobi(page);
    await klik(page, 'tombol-buat-room');
    await tunggu(page, () => /Menunggu lawan/.test(document.getElementById('status-tunggu').textContent));
    let r = await ruang(page);
    cek('T-1: ruang tunggu menampilkan kode, tombol bagikan, pemain, dan pengaturan', r.kode === 'ABCDE' && r.bagi && r.pemain && r.atur && r.keluar && r.judul === 'Bagikan kode ini ke temanmu', JSON.stringify(r));
    cek('T-1: sebelum ada lawan, kartunya kosong dan tombol Siap belum ada', r.saya === 'Bima|Kamu' && r.lawan === 'Belum ada lawan|Menunggu…' && r.siap === null, JSON.stringify(r));
    cek('pengaturan awal: Sedang, 3 poin, Rebutan', JSON.stringify(await aturTampil(page)) === JSON.stringify({ kesulitan: 'medium', target: '3', sistem: 'rebutan' }) && /Paling banyak 5 ronde, 5:00 per ronde/.test(r.info) && !r.terkunci, r.info);
    await page.screenshot({ path: path.join(FOTO, 'online-tunggu.png') });

    const jatah = [];
    for (const target of [5, 7, 10, 3]) {
      await pilihAtur(page, 'target', target);
      await tunggu(page, (t) => document.querySelector(`#atur-tunggu [data-atur="target"][data-nilai="${t}"]`).getAttribute('aria-checked') === 'true', 2000, target);
      jatah.push((await teksDi(page, 'info-atur')).match(/Paling banyak (\d+) ronde/)[1]);
    }
    cek('T-2: jatah ronde mengikuti poin target (9, 13, 19, 5)', jatah.join() === '9,13,19,5', jatah.join());
    await pilihAtur(page, 'kesulitan', 'easy');
    await pilihAtur(page, 'target', 5);
    await pilihAtur(page, 'sistem', 'balapan');
    await tunggu(page, () => /Balapan/.test(document.getElementById('info-atur').textContent), 2000);
    const ubahan = await catatan(page, 'atur');
    const terakhir = ubahan[ubahan.length - 1][2];
    cek('T-2: pembuat room mengubah pengaturan, dan nomor versinya naik setiap kali', ubahan.length === 7 && ubahan.every((u, i) => u[2].rev === i + 1) && terakhir.kesulitan === 'easy' && terakhir.target === 5 && terakhir.sistem === 'balapan', JSON.stringify(terakhir));
    cek('T-2: Balapan menjelaskan batas waktu seluruh pertandingan (5 x 3 menit)', /menyelesaikan 5 puzzle menang\. Batas waktu 15:00/.test(await teksDi(page, 'info-atur')), await teksDi(page, 'info-atur'));
    cek('pengaturan terakhir diingat untuk room berikutnya', await page.evaluate(() => localStorage.getItem('setdoku-atur-duel') === JSON.stringify({ kesulitan: 'easy', target: 5, sistem: 'balapan' })));
    await pilihAtur(page, 'sistem', 'balapan');
    await tidur(200);
    cek('T-2: memilih pengaturan yang sama tidak menulis apa pun', (await catatan(page, 'atur')).length === 7);

    await palsu(page, () => window.__palsu.lawanGabung('ABCDE', 'Budi'));
    await tunggu(page, () => !document.getElementById('tombol-siap').hidden);
    r = await ruang(page);
    cek('T-3: setelah lawan bergabung, tombol Siap muncul dan kode disembunyikan', r.siap === 'Siap' && r.kode === null && !r.bagi && r.judul === 'Room ABCDE' && r.status === 'Tekan Siap kalau sudah siap.' && r.lawan === 'Budi|Belum siap', JSON.stringify(r));
    cek('T-5: belum ada yang siap, pertandingan belum dimulai', (await catatan(page, 'mulai')).length === 0);

    await klik(page, 'tombol-siap');
    await tunggu(page, () => document.getElementById('tombol-siap').textContent === 'Batal siap');
    r = await ruang(page);
    cek('T-3: menekan Siap menandai diri siap untuk versi pengaturan ini', (await catatan(page, 'siap')).pop()[2] === 7 && r.saya === 'Bima|Siap' && r.status === 'Menunggu Budi siap…' && await page.evaluate(() => document.getElementById('kartu-saya').classList.contains('siap')), JSON.stringify(r));
    await klik(page, 'tombol-siap');
    await tunggu(page, () => document.getElementById('tombol-siap').textContent === 'Siap');
    cek('T-3: Siap bisa dibatalkan', (await catatan(page, 'siap')).pop()[2] === -1 && (await ruang(page)).saya === 'Bima|Belum siap');

    await palsu(page, () => window.__palsu.lawanSiap('ABCDE'));
    await tunggu(page, () => /Budi sudah siap/.test(document.getElementById('status-tunggu').textContent));
    cek('T-3: lawan yang siap terlihat', (await ruang(page)).lawan === 'Budi|Siap' && (await catatan(page, 'mulai')).length === 0);
    await pilihAtur(page, 'target', 3);
    await tunggu(page, () => document.getElementById('siap-lawan').textContent === 'Belum siap');
    r = await ruang(page);
    cek('T-4: mengubah pengaturan membatalkan tanda siap lawan', r.lawan === 'Budi|Belum siap' && r.status === 'Tekan Siap kalau sudah siap.', JSON.stringify(r));
    await klik(page, 'tombol-siap');
    await tunggu(page, () => /Menunggu Budi siap/.test(document.getElementById('status-tunggu').textContent));
    await tidur(600);
    cek('T-5: baru satu pemain yang siap, pertandingan belum dimulai', (await catatan(page, 'mulai')).length === 0);
    await page.screenshot({ path: path.join(FOTO, 'online-tunggu-siap.png') });

    await palsu(page, () => { window.__palsu.majuHitung = 800; window.__palsu.lawanSiap('ABCDE'); });
    const mundur = await tunggu(page, () => !document.getElementById('angka-mundur').hidden && /^[123]$/.test(document.getElementById('angka-mundur').textContent), 3000);
    const saatHitung = await ruang(page);
    const mulai = await catatan(page, 'mulai');
    cek('T-5: begitu keduanya siap, pertandingan dimulai sekali dengan daftar puzzle-nya', mulai.length === 1 && mulai[0][2] === 3, JSON.stringify(mulai));
    cek('hitung mundur 3-2-1 tampil, dan pengaturan sudah tidak bisa disentuh', mundur && !saatHitung.atur && !saatHitung.pemain && saatHitung.siap === null && !saatHitung.keluar, JSON.stringify(saatHitung));
    await page.screenshot({ path: path.join(FOTO, 'online-mundur.png') });
    cek('setelah hitung mundur, papan ronde pertama tampil', await papanTampil(page, 8000));
    await tidur(600);
    const b = await bilah(page);
    cek('balapan: bilah skor menampilkan poin target dan puzzle lawan', b.tampil && b.saya === '0' && b.lawan === '0' && b.info === 'Sampai 3 poin' && b.nama === 'Budi · puzzle 1', JSON.stringify(b));
    cek('balapan: timer memakai batas waktu seluruh pertandingan (3 x 3 menit)', /^Duel · (9:00|8:5\d)$/.test(await teksDi(page, 'judul-level')), await teksDi(page, 'judul-level'));
    await page.close();
  }

  /* Ruang tunggu: tamu hanya melihat pengaturan */
  {
    const page = await buka();
    await palsu(page, () => window.__palsu.roomLawan('FGHJK', { kesulitan: 'hard', target: 7 }, 'Budi'));
    await keLobi(page);
    await isiKode(page, ' fgh-jk ');
    await klik(page, 'tombol-gabung');
    await tunggu(page, () => !document.getElementById('tombol-siap').hidden);
    let r = await ruang(page);
    cek('tamu: kode dari chat dirapikan, lalu masuk ke ruang tunggu', (await catatan(page, 'gabung')).some((c) => c[1] === 'FGHJK') && r.judul === 'Room FGHJK' && r.kode === null && r.lawan === 'Budi|Belum siap', JSON.stringify(r));
    cek('T-2: tamu melihat pengaturan, tetapi tidak bisa mengubahnya', r.terkunci && r.catatan === 'Pengaturan dipilih Budi.' && JSON.stringify(await aturTampil(page)) === JSON.stringify({ kesulitan: 'hard', target: '7', sistem: 'rebutan' }) && /13 ronde, 8:00 per ronde/.test(r.info), JSON.stringify(r));
    await pilihAtur(page, 'target', 3);
    await page.focus('#segmen-target [aria-checked="true"]').catch(() => {});
    await page.keyboard.press('ArrowRight');
    await tidur(300);
    cek('T-2: ketukan dan keyboard tamu di pengaturan tidak menulis apa pun', (await catatan(page, 'atur')).length === 0 && (await aturTampil(page)).target === '7');
    await page.screenshot({ path: path.join(FOTO, 'online-tunggu-tamu.png') });

    await klik(page, 'tombol-siap');
    await tunggu(page, () => /Menunggu Budi siap/.test(document.getElementById('status-tunggu').textContent));
    await palsu(page, () => window.__palsu.ubah('FGHJK', (room) => { room.atur = { ...room.atur, sistem: 'balapan', rev: 1 }; }));
    await tunggu(page, () => document.getElementById('siap-saya').textContent === 'Belum siap');
    r = await ruang(page);
    const kabar = await semuaToast(page);
    cek('T-4: pengaturan yang diubah pembuat room membatalkan siap tamu, dan tamu diberi tahu', r.saya === 'Bima|Belum siap' && r.siap === 'Siap' && kabar.includes('Pengaturan diubah') && (await aturTampil(page)).sistem === 'balapan', JSON.stringify(kabar));
    await klik(page, 'tombol-siap');
    await tunggu(page, () => /Menunggu Budi siap/.test(document.getElementById('status-tunggu').textContent));
    cek('T-3: tamu siap untuk versi pengaturan yang baru', (await catatan(page, 'siap')).pop()[2] === 1);
    await palsu(page, () => window.__palsu.lawanSiap('FGHJK'));
    await tunggu(page, () => /Keduanya siap/.test(document.getElementById('status-tunggu').textContent));
    await tidur(600);
    cek('T-5: tamu tidak menulis waktu mulai', (await catatan(page, 'mulai')).length === 0);
    await palsu(page, () => window.__palsu.lawanMulai('FGHJK'));
    cek('tamu: papan tampil setelah pembuat room memulai', await papanTampil(page));
    await tidur(500);
    cek('balapan Sulit 7 poin: timer 56 menit', /^Duel · (56:00|55:5\d)$/.test(await teksDi(page, 'judul-level')), await teksDi(page, 'judul-level'));
    await page.close();
  }

  /* Rebutan: lima ronde sampai ada pemenang */
  {
    const page = await buka();
    const kode = await mulaiSebagaiTuan(page);
    const awal = await page.evaluate(() => ({
      judul: document.getElementById('judul-level').textContent,
      pesan: document.getElementById('pesan-solo').textContent,
      hint: document.getElementById('tombol-hint').hidden,
      waktu: document.getElementById('tombol-waktu').hidden,
      kelas: document.getElementById('layar-solo').className,
    }));
    const puzzle0 = await dataPuzzle(page, kode, 0);
    let b = await bilah(page);
    cek('rebutan: papan ronde 1 dengan timer satu ronde (Sedang, 5 menit)', /^Duel · (5:00|4:5\d)$/.test(awal.judul) && /duel/.test(awal.kelas), JSON.stringify(awal));
    cek('P-1: bilah skor menampilkan 0-0, nomor ronde, dan nama lawan', b.tampil && b.saya === '0' && b.lawan === '0' && b.info === 'Ronde 1/5' && b.nama === 'Budi', JSON.stringify(b));
    cek('P-2: titik progres lawan sebanyak slot kosong, semuanya masih padam', b.titik === kosongDari(puzzle0).length && b.isi === 0 && b.label === `Budi sudah mengisi 0 dari ${b.titik} slot`, JSON.stringify(b));
    cek('O-6: tanpa Hint dan Extra Time', awal.hint && awal.waktu && awal.pesan === 'Kunci jawaban benar lebih dulu dari Budi.', JSON.stringify(awal));
    cek('daftar puzzle pertandingan: 5 ronde, semuanya berbeda', await page.evaluate((k) => {
      const d = DuelOnline.ambilDaftarPuzzle(DataLevel, window.__palsu.rooms[k]);
      return !!d && d.length === 5 && new Set(d).size === 5;
    }, kode));

    // Progres: yang dikirim hanya jumlah slot terisi.
    const kosong0 = kosongDari(puzzle0);
    await pasang(page, puzzle0, kosong0[0], puzzle0.solusi[kosong0[0]]);
    await pasang(page, puzzle0, kosong0[1], puzzle0.solusi[kosong0[1]]);
    await tidur(500);
    const maju = await catatan(page, 'maju');
    cek('P-2: jumlah slot terisi dilaporkan ke lawan, tanpa kartunya', maju.length >= 2 && maju[0][2] === 0 && maju[maju.length - 1][2] === 2 && maju.every((m) => typeof m[2] === 'number'), JSON.stringify(maju));
    await palsu(page, (k) => window.__palsu.ubah(k, (room) => { room.pemain['uid-lawan'].maju = 3; }), kode);
    await tunggu(page, () => document.querySelectorAll('#titik-lawan i.isi').length === 3, 2000);
    b = await bilah(page);
    cek('P-2: progres lawan menyala di bilah skor', b.isi === 3 && b.label === `Budi sudah mengisi 3 dari ${b.titik} slot`, JSON.stringify(b));
    await page.screenshot({ path: path.join(FOTO, 'online-papan.png') });

    // Kunci salah: tombol beku 7 detik, dan tidak ada yang dikirim.
    await page.evaluate((x, y) => {
      const slot = document.querySelectorAll('.slot');
      slot[x].click();
      slot[y].click();
    }, kosong0[0], kosong0[1]);
    await tidur(400);
    await isiSemua(page, puzzle0, { tukar: true });
    await klik(page, 'tombol-kunci');
    await tidur(300);
    const salah = await page.evaluate(() => ({
      kunci: document.getElementById('tombol-kunci').textContent,
      mati: document.getElementById('tombol-kunci').getAttribute('aria-disabled'),
      garis: document.querySelectorAll('.garis-sorot, .slot.gagal').length,
      pesan: document.getElementById('pesan-solo').textContent,
    }));
    const toastSalah = await toast(page);
    cek('K-5: kunci salah membekukan tombol kunci 7 detik', /^Tunggu [67] detik$/.test(salah.kunci) && salah.mati === 'true', JSON.stringify(salah));
    cek('kunci salah: letak kesalahan tidak ditunjukkan', salah.garis === 0 && salah.pesan === 'Jawaban belum benar.', JSON.stringify(salah));
    cek('kunci salah: pesan melayang menjelaskan penaltinya', !!toastSalah && toastSalah.teks === 'Jawaban belum benar' && /dibekukan 7 detik/.test(toastSalah.sub || ''), JSON.stringify(toastSalah));
    cek('K-4: kunci salah tidak dikirim dan tidak diumumkan ke lawan', (await catatan(page, 'jawab')).length === 0 && await page.evaluate((k) => Object.keys(window.__palsu.rooms[k].pemain['uid-saya']).sort().join() === 'maju,nama,siap,tersambung', kode));
    await page.screenshot({ path: path.join(FOTO, 'online-beku.png') });
    // Jam halaman dimundurkan, supaya pembekuan tidak habis selagi uji memasang kartu.
    await page.evaluate(() => {
      window.__jamAsli = performance.now.bind(performance);
      performance.now = () => window.__jamAsli() - 30000;
    });
    await page.evaluate((x, y) => {
      const slot = document.querySelectorAll('.slot');
      slot[x].click();
      slot[y].click();
    }, kosong0[0], kosong0[1]);
    await tidur(400);
    await pasang(page, puzzle0, kosong0[0], puzzle0.solusi[kosong0[0]]);
    await pasang(page, puzzle0, kosong0[1], puzzle0.solusi[kosong0[1]]);
    await tidur(500);
    await klik(page, 'tombol-kunci');
    await tidur(250);
    const ditolak = await toast(page);
    cek('selama beku, kunci ditolak walau papan sudah benar', (await catatan(page, 'jawab')).length === 0 && !!ditolak && /^Tunggu \d+ detik lagi$/.test(ditolak.teks), JSON.stringify(ditolak));
    await page.evaluate(() => { performance.now = () => window.__jamAsli() + 7500; });
    await tunggu(page, () => document.getElementById('tombol-kunci').textContent === 'Kunci jawaban', 3000);
    cek('K-5: setelah 7 detik tombol kunci menyala lagi', await page.evaluate(() => document.getElementById('tombol-kunci').getAttribute('aria-disabled') === 'false'));

    // Ronde 1: pemain ini mengunci benar lebih dulu.
    const progresSebelum = await page.evaluate(() => localStorage.getItem('setdoku-progres'));
    await klik(page, 'tombol-kunci');
    const menang1 = await adaLapis(page, '^Kamu menang ronde 1$');
    let l = await lapis(page);
    const kiriman = await catatan(page, 'jawab');
    cek('S1-1: jawaban benar dikirim untuk ronde 1, dan pemain ini dapat 1 poin', menang1 && kiriman.length === 1 && kiriman[0][2] === 0 && kiriman[0][3].join() === puzzle0.solusi.join() && l.skor === '1 – 0', JSON.stringify(l));
    cek('S1-2: lapisan antarronde menghitung mundur ke ronde 2', /^Ronde 2 mulai dalam [1-5]$/.test(l.mundur) && /menang/.test(l.kelas) && (await bilah(page)).saya === '1', JSON.stringify(l));
    cek('S1-2: papan terkunci selama jeda', await page.evaluate(() => [...document.querySelectorAll('.slot')].every((s) => s.disabled)));
    await page.screenshot({ path: path.join(FOTO, 'online-jeda-ronde.png') });
    await tidur(700);
    cek('S1-2: ronde 2 belum mulai sebelum jedanya habis', (await lapis(page)) !== null && (await bilah(page)).info === 'Ronde 2/5');
    await majuWaktu(page, JEDA_RONDE);
    const ronde2 = await rondeTampil(page, 'Ronde 2/5');
    const puzzle1 = await dataPuzzle(page, kode, 1);
    cek('S1-2: ronde 2 tampil dengan puzzle baru, papan kosong, dan timer penuh', ronde2 && puzzle1.papan.join() !== puzzle0.papan.join() && await page.evaluate(() => document.querySelectorAll('.slot.terisi').length === 0) && /^Duel · (5:00|4:5\d)$/.test(await teksDi(page, 'judul-level')), await teksDi(page, 'judul-level'));
    cek('P-2: titik progres lawan direset di ronde baru', (await bilah(page)).isi === 0 && (await bilah(page)).titik === kosongDari(puzzle1).length);
    cek('K-5: pembekuan tidak terbawa ke ronde berikutnya', (await teksDi(page, 'tombol-kunci')) === 'Kunci jawaban');

    // Ronde 2: lawan lebih dulu.
    await pasang(page, puzzle1, kosongDari(puzzle1)[0], puzzle1.solusi[kosongDari(puzzle1)[0]]);
    await palsu(page, (k) => window.__palsu.lawanJawab(k, 1), kode);
    const kalah2 = await adaLapis(page, '^Budi menang ronde 2$');
    l = await lapis(page);
    cek('S1-1: lawan yang lebih dulu dapat poin ronde itu', kalah2 && l.skor === '1 – 1' && /kalah/.test(l.kelas) && (await bilah(page)).lawan === '1', JSON.stringify(l));
    cek('S1-1: papan pemain yang kalah cepat ditinggalkan, tanpa mengirim apa pun', (await catatan(page, 'jawab')).length === 1 && await page.evaluate(() => [...document.querySelectorAll('.slot')].every((s) => s.disabled)));

    // Ronde 3: waktu ronde habis, tidak ada poin.
    await majuWaktu(page, JEDA_RONDE);
    await rondeTampil(page, 'Ronde 3/5');
    await keTenggat(page, kode);
    await tunggu(page, () => /Waktu ronde habis/.test(document.getElementById('pesan-solo').textContent), 3000);
    cek('K-2: waktu ronde habis, papan terkunci dan tidak ada yang dikirim', (await teksDi(page, 'pesan-solo')) === 'Waktu ronde habis.' && (await catatan(page, 'jawab')).length === 1 && (await semuaToast(page)).includes('Waktu habis!'));
    await majuWaktu(page, 2000);
    const kosong3 = await adaLapis(page, '^Ronde 3: tidak ada poin$');
    l = await lapis(page);
    cek('K-2: ronde tanpa jawaban benar tidak memberi poin kepada siapa pun', kosong3 && l.skor === '1 – 1' && !/menang|kalah/.test(l.kelas), JSON.stringify(l));

    // Ronde 4 dan 5: pemain ini menang dua kali, dan mencapai 3 poin.
    await majuWaktu(page, JEDA_RONDE - 2000);
    await rondeTampil(page, 'Ronde 4/5');
    await selesaikan(page, kode, 3);
    await adaLapis(page, '^Kamu menang ronde 4$');
    cek('rebutan: skor 2-1 setelah ronde 4', (await lapis(page)).skor === '2 – 1');
    await majuWaktu(page, JEDA_RONDE);
    await rondeTampil(page, 'Ronde 5/5');
    await selesaikan(page, kode, 4);
    await adaHasil(page);
    const menang = await hasilTampil(page);
    cek('S1-5: yang pertama mencapai 3 poin menang pertandingan', menang.judul === 'Kamu menang!' && menang.detail === 'Skor akhir 3–1.', JSON.stringify(menang));
    cek('hasil: tombolnya Main lagi dan Keluar, tanpa lapisan antarronde', menang.lanjut === 'Main lagi' && menang.tutup === 'Keluar' && !menang.ulang && !menang.practice && (await lapis(page)) === null, JSON.stringify(menang));
    cek('O-7: duel online tidak memberi Stars dan tidak memotong nyawa', !menang.stars && !menang.nyawa && (await page.evaluate(() => localStorage.getItem('setdoku-progres'))) === progresSebelum);
    cek('hasil tidak ditulis siapa pun ke database', await page.evaluate((k) => {
      const room = window.__palsu.rooms[k];
      return !room.akhir && !('pemenang' in room) && !('skor' in room) && Object.keys(room.ronde).join() === '0,1,3,4';
    }, kode));
    await page.screenshot({ path: path.join(FOTO, 'online-menang.png') });

    await klik(page, 'tombol-level-peta');
    const diLobi = await tunggu(page, () => document.getElementById('layar-hasil').hidden && document.getElementById('layar-solo').hidden && !document.getElementById('online-lobi').hidden, 3000);
    cek('hasil: Keluar kembali ke lobi', diLobi && await terlihat(page, 'online-lobi'));

    // Solo sesudah duel tidak boleh terbawa aturan duel.
    await klik(page, 'tombol-online-keluar');
    await tidur(500);
    await klik(page, 'tombol-solo');
    await tidur(500);
    await page.evaluate(() => { document.querySelectorAll('.tombol-level')[0].click(); document.getElementById('tombol-mode-practice').click(); });
    await tidur(800);
    const solo = await page.evaluate(() => ({
      judul: document.getElementById('judul-level').textContent,
      hint: !document.getElementById('tombol-hint').hidden,
      timer: document.getElementById('timer-solo').hidden,
      kunci: document.getElementById('tombol-kunci').textContent,
      pesan: document.getElementById('pesan-solo').textContent,
      bilah: document.getElementById('bilah-duel').hidden,
      kelas: document.getElementById('layar-solo').className,
      lapis: document.getElementById('lapis-ronde').hidden,
    }));
    cek('Practice sesudah duel kembali normal, tanpa bilah skor', solo.judul === 'Level 1' && solo.hint && solo.timer && solo.kunci === 'Kunci jawaban' && !/Budi/.test(solo.pesan) && solo.bilah && solo.lapis && !/duel/.test(solo.kelas), JSON.stringify(solo));
    await page.close();
  }

  /* Rebutan: kalah, dan jatah ronde habis */
  {
    let page = await buka();
    let kode = await mulaiSebagaiTamu(page, { atur: { kesulitan: 'easy' } });
    cek('tamu rebutan Mudah: timer 3 menit per ronde', /^Duel · (3:00|2:5\d)$/.test(await teksDi(page, 'judul-level')), await teksDi(page, 'judul-level'));
    for (let r = 0; r < 3; r++) {
      await palsu(page, (k, n) => window.__palsu.lawanJawab(k, n), kode, r);
      if (r < 2) {
        await adaLapis(page, `^Budi menang ronde ${r + 1}$`);
        await majuWaktu(page, JEDA_RONDE);
        await rondeTampil(page, `Ronde ${r + 2}/5`);
      }
    }
    await adaHasil(page);
    let h = await hasilTampil(page);
    cek('rebutan: lawan yang mencapai 3 poin lebih dulu menang', h.judul === 'Kamu kalah' && /gagal/.test(h.kelas) && h.detail === 'Skor akhir 0–3.', JSON.stringify(h));
    await page.screenshot({ path: path.join(FOTO, 'online-kalah.png') });
    await page.close();

    // Lima ronde tanpa ada yang mencapai 3 poin: 1 poin lawan, 4 ronde tanpa jawaban.
    page = await buka();
    kode = await mulaiSebagaiTuan(page, { atur: { kesulitan: 'easy' } });
    await palsu(page, (k) => window.__palsu.lawanJawab(k, 0), kode);
    await adaLapis(page, '^Budi menang ronde 1$');
    for (let r = 1; r < 5; r++) {
      await majuWaktu(page, JEDA_RONDE);
      await rondeTampil(page, `Ronde ${r + 1}/5`);
      await majuWaktu(page, 3 * 60 * 1000 + 2000);
      if (r < 4) {
        await adaLapis(page, `^Ronde ${r + 1}: tidak ada poin$`);
        await majuWaktu(page, -2000);
      }
    }
    await adaHasil(page);
    h = await hasilTampil(page);
    cek('S1-5: jatah ronde habis, poin terbanyak menang', h.judul === 'Kamu kalah' && h.detail === 'Skor akhir 0–1.', JSON.stringify(h));
    await page.close();

    // Seri: tidak ada yang pernah mengunci benar.
    page = await buka();
    kode = await mulaiSebagaiTuan(page, { atur: { kesulitan: 'easy' } });
    await majuWaktu(page, 5 * (3 * 60 * 1000 + JEDA_RONDE));
    await adaHasil(page);
    h = await hasilTampil(page);
    cek('S1-5: poin sama di akhir jatah ronde berarti seri', h.judul === 'Seri' && /netral/.test(h.kelas) && !/gagal/.test(h.kelas) && h.detail === 'Skor akhir 0–0.', JSON.stringify(h));
    await page.screenshot({ path: path.join(FOTO, 'online-seri.png') });
    await page.close();
  }

  /* Balapan */
  {
    let page = await buka();
    let kode = await mulaiSebagaiTamu(page, { atur: { kesulitan: 'easy', sistem: 'balapan' } });
    let b = await bilah(page);
    const papan0 = await idPapan(page);
    cek('balapan: pesan dan bilah menjelaskan tujuannya', b.info === 'Sampai 3 poin' && b.nama === 'Budi · puzzle 1' && (await teksDi(page, 'pesan-solo')) === 'Selesaikan 3 puzzle lebih dulu dari Budi.', JSON.stringify(b));

    // Pemain ini menyelesaikan puzzle 1, dan langsung lanjut tanpa menunggu lawan.
    await selesaikan(page, kode, 0);
    const lanjut = await tunggu(page, (lama) => document.getElementById('skor-saya').textContent === '1' && [...document.querySelectorAll('.slot')].map((s) => s.getAttribute('aria-label')).join('|') !== lama && !document.querySelector('.slot').disabled, 4000, papan0);
    await tidur(300);
    cek('S2-2: setelah benar, puzzle berikutnya langsung tampil tanpa jeda antarronde', lanjut && (await lapis(page)) === null && (await semuaToast(page)).includes('Puzzle 2 dari 3'), JSON.stringify(await semuaToast(page)));
    b = await bilah(page);
    cek('K-1: puzzle yang selesai memberi 1 poin untuk pemain itu sendiri', b.saya === '1' && b.lawan === '0' && b.nama === 'Budi · puzzle 1', JSON.stringify(b));
    cek('balapan: timer tidak diulang di puzzle berikutnya', /^Duel · 8:[45]\d$/.test(await teksDi(page, 'judul-level')), await teksDi(page, 'judul-level'));
    const majuBalapan = await catatan(page, 'maju');
    cek('P-2: progres dilaporkan dengan nomor rondenya', majuBalapan.some((m) => m[2] === 10), JSON.stringify(majuBalapan.map((m) => m[2])));

    // Lawan menyusul: poinnya naik sendiri, dan pemain ini tetap di puzzle 2.
    await palsu(page, (k) => { window.__palsu.lawanJawab(k, 0); window.__palsu.ubah(k, (room) => { room.pemain['uid-lawan'].maju = 12; }); }, kode);
    await tunggu(page, () => document.getElementById('skor-lawan').textContent === '1', 3000);
    await tidur(300);
    b = await bilah(page);
    cek('P-3: nomor puzzle lawan dan progresnya terlihat', b.lawan === '1' && b.nama === 'Budi · puzzle 2' && b.isi === 2 && (await semuaToast(page)).includes('Budi menyelesaikan puzzle 1'), JSON.stringify(b));
    cek('S2-1: lawan yang menyusul tidak memindahkan papan pemain ini', (await bilah(page)).saya === '1' && await page.evaluate(() => !document.querySelector('.slot').disabled));
    await page.screenshot({ path: path.join(FOTO, 'online-balapan.png') });

    // Lawan menyalip dan mencapai 3 poin lebih dulu.
    await palsu(page, (k) => { window.__palsu.lawanJawab(k, 1); window.__palsu.lawanJawab(k, 2); }, kode);
    await adaHasil(page);
    let h = await hasilTampil(page);
    cek('K-1: yang pertama mencapai poin target menang, walau sempat tertinggal', h.judul === 'Kamu kalah' && h.detail === 'Skor akhir 1–3.', JSON.stringify(h));
    await page.close();

    // Menang balapan.
    page = await buka();
    kode = await mulaiSebagaiTuan(page, { atur: { kesulitan: 'easy', sistem: 'balapan' } });
    for (let r = 0; r < 3; r++) {
      const lama = await idPapan(page);
      await selesaikan(page, kode, r);
      if (r < 2) await tunggu(page, (id) => [...document.querySelectorAll('.slot')].map((s) => s.getAttribute('aria-label')).join('|') !== id && !document.querySelector('.slot').disabled, 4000, lama);
    }
    await adaHasil(page);
    h = await hasilTampil(page);
    const kiriman = await catatan(page, 'jawab');
    cek('balapan: menyelesaikan 3 puzzle lebih dulu berarti menang', h.judul === 'Kamu menang!' && h.detail === 'Skor akhir 3–0.' && kiriman.map((c) => c[2]).join() === '0,1,2', JSON.stringify(h));
    await page.close();

    // Batas waktu habis.
    page = await buka();
    kode = await mulaiSebagaiTuan(page, { atur: { kesulitan: 'easy', sistem: 'balapan' } });
    const lama = await idPapan(page);
    await selesaikan(page, kode, 0);
    await tunggu(page, (id) => [...document.querySelectorAll('.slot')].map((s) => s.getAttribute('aria-label')).join('|') !== id && !document.querySelector('.slot').disabled, 4000, lama);
    await keTenggat(page, kode);
    await tunggu(page, () => /Waktu habis/.test(document.getElementById('pesan-solo').textContent), 3000);
    cek('S2-3: batas waktu balapan habis, papan terkunci', (await teksDi(page, 'pesan-solo')) === 'Waktu habis. Menghitung hasil…' && (await catatan(page, 'jawab')).length === 1, (await teksDi(page, 'pesan-solo')) + ' | ' + (await teksDi(page, 'judul-level')) + ' | ' + JSON.stringify(await catatan(page, 'jawab')).length + ' | ' + JSON.stringify(await bilah(page)));
    await majuWaktu(page, 2000);
    await adaHasil(page);
    h = await hasilTampil(page);
    cek('S2-4: waktu habis, poin terbanyak menang', h.judul === 'Kamu menang!' && h.detail === 'Waktu habis. Skor akhir 1–0.', JSON.stringify(h));
    await page.close();

    page = await buka();
    kode = await mulaiSebagaiTamu(page, { atur: { kesulitan: 'easy', sistem: 'balapan' } });
    await majuWaktu(page, 9 * 60 * 1000 + 2500);
    await adaHasil(page);
    h = await hasilTampil(page);
    cek('S2-4: waktu habis dengan poin sama berarti seri', h.judul === 'Seri' && h.detail === 'Waktu habis. Skor akhir 0–0.', JSON.stringify(h));
    await page.close();
  }

  /* Jawaban yang ditolak server, dan jawaban lawan yang ternyata lebih dulu */
  {
    let page = await buka();
    let kode = await mulaiSebagaiTuan(page);
    await palsu(page, () => { window.__palsu.tolakJawab = 1; });
    const puzzle = await selesaikan(page, kode, 0);
    const pulih = await tunggu(page, () => document.querySelectorAll('.slot.terisi').length === 0 && !document.querySelector('.slot').disabled, 4000);
    cek('jawaban yang ditolak server: papan dipasang ulang, dan pemain diberi tahu', pulih && (await semuaToast(page)).includes('Jawaban gagal terkirim') && (await bilah(page)).saya === '0' && (await lapis(page)) === null, JSON.stringify(await semuaToast(page)));
    await isiSemua(page, puzzle);
    await klik(page, 'tombol-kunci');
    cek('jawaban yang ditolak server: ronde yang sama bisa dikunci lagi', await adaLapis(page, '^Kamu menang ronde 1$') && (await catatan(page, 'jawab')).length === 1);
    await page.close();

    // Jam server menempatkan jawaban lawan lebih dulu, walau pemain ini juga benar.
    page = await buka();
    kode = await mulaiSebagaiTuan(page);
    await palsu(page, (k) => {
      const asli = window.Online.kirimJawaban;
      window.Online.kirimJawaban = (kd, r, kawat) => asli(kd, r, kawat).then(() => window.__palsu.ubah(k, (room) => {
        room.ronde[r]['uid-lawan'] = { papan: kawat.slice(), pada: room.ronde[r]['uid-saya'].pada - 5 };
      }));
    }, kode);
    await selesaikan(page, kode, 0);
    const kalah = await adaLapis(page, '^Budi menang ronde 1$');
    cek('dua jawaban benar di ronde yang sama: jam server yang menentukan', kalah && (await lapis(page)).skor === '0 – 1', JSON.stringify(await lapis(page)));
    await page.close();
  }

  /* Koneksi putus */
  {
    const page = await buka();
    const kode = await mulaiSebagaiTuan(page);
    await palsu(page, (k) => window.__palsu.ubah(k, (room, t) => {
      room.pemain['uid-lawan'].tersambung = false;
      room.pemain['uid-lawan'].putusPada = t;
    }), kode);
    await tidur(600);
    const putus = { pesan: await teksDi(page, 'pesan-solo'), toast: await toast(page) };
    cek('O-5: lawan terputus diberitahukan dengan hitung mundur', /^Budi terputus\. Kalau tidak kembali dalam (30|29) detik, kamu menang\.$/.test(putus.pesan) && !!putus.toast && putus.toast.teks === 'Budi terputus', JSON.stringify(putus));
    cek('O-5: belum 30 detik, belum ada klaim', (await catatan(page, 'klaim')).length === 0);
    await page.screenshot({ path: path.join(FOTO, 'online-putus.png') });

    await palsu(page, (k) => window.__palsu.ubah(k, (room) => {
      room.pemain['uid-lawan'].tersambung = true;
      delete room.pemain['uid-lawan'].putusPada;
    }), kode);
    await tidur(600);
    const kembali = { pesan: await teksDi(page, 'pesan-solo'), toast: await toast(page) };
    cek('O-5: lawan yang kembali diberitahukan, dan pertandingan lanjut', /Kunci jawaban benar lebih dulu dari Budi/.test(kembali.pesan) && !!kembali.toast && kembali.toast.teks === 'Budi tersambung lagi', JSON.stringify(kembali));

    // Lawan putus di tengah jeda antarronde, dengan skor 1-0.
    await selesaikan(page, kode, 0);
    await adaLapis(page, '^Kamu menang ronde 1$');
    await palsu(page, (k) => window.__palsu.ubah(k, (room, t) => {
      room.pemain['uid-lawan'].tersambung = false;
      room.pemain['uid-lawan'].putusPada = t - 30500;
    }), kode);
    await adaHasil(page);
    const h = await hasilTampil(page);
    cek('O-5: lawan putus lebih dari 30 detik, pemain ini menang seluruh pertandingan', (await catatan(page, 'klaim')).length === 1 && h.judul === 'Kamu menang!' && h.detail === 'Budi terputus lebih dari 30 detik.', JSON.stringify(h));
    await page.close();

    // Pemain ini sendiri yang putus.
    const sendiri = await buka();
    const kode2 = await mulaiSebagaiTamu(sendiri);
    await palsu(sendiri, () => window.__palsu.aturSambung(false));
    await tidur(300);
    const lepas = await toast(sendiri);
    await palsu(sendiri, () => window.__palsu.aturSambung(true));
    await tidur(300);
    const sambung = await toast(sendiri);
    cek('O-5: koneksi sendiri putus dan kembali diberitahukan', !!lepas && lepas.teks === 'Koneksi terputus' && !!sambung && sambung.teks === 'Tersambung lagi', JSON.stringify([lepas, sambung]));
    await palsu(sendiri, (k) => window.__palsu.ubah(k, (room, t) => {
      room.akhir = { pemenang: 'uid-lawan', alasan: 'putus', pada: t };
    }), kode2);
    await adaHasil(sendiri);
    const kalah = await hasilTampil(sendiri);
    cek('O-5: yang putus terlalu lama melihat alasannya', kalah.judul === 'Kamu kalah' && kalah.detail === 'Koneksimu terputus lebih dari 30 detik.', JSON.stringify(kalah));
    await sendiri.close();

    // Lawan terputus di ruang tunggu: tidak ada klaim, hanya menunggu.
    const tunggu2 = await buka();
    await palsu(tunggu2, () => { window.__palsu.kodeBerikut.push('PQRST'); });
    await keLobi(tunggu2);
    await klik(tunggu2, 'tombol-buat-room');
    await tunggu(tunggu2, () => /Menunggu lawan/.test(document.getElementById('status-tunggu').textContent));
    await palsu(tunggu2, () => {
      const S = window.__palsu;
      S.lawanGabung('PQRST', 'Budi');
      S.lawanSiap('PQRST');
      S.ubah('PQRST', (room, t) => { room.pemain['uid-lawan'].tersambung = false; room.pemain['uid-lawan'].putusPada = t - 60000; });
    });
    await tunggu(tunggu2, () => !document.getElementById('tombol-siap').hidden);
    await klik(tunggu2, 'tombol-siap');
    await tunggu(tunggu2, () => /tersambung lagi/.test(document.getElementById('status-tunggu').textContent));
    await tidur(600);
    cek('T-5: pertandingan tidak dimulai selagi lawan terputus di ruang tunggu', (await teksDi(tunggu2, 'status-tunggu')) === 'Menunggu Budi tersambung lagi…' && (await catatan(tunggu2, 'mulai')).length === 0 && (await catatan(tunggu2, 'klaim')).length === 0);
    await tunggu2.close();
  }

  /* Keluar dan batal */
  {
    // Pembuat room keluar sebelum ada lawan.
    let page = await buka();
    await palsu(page, () => { window.__palsu.kodeBerikut.push('ABCDE'); });
    await keLobi(page);
    await klik(page, 'tombol-buat-room');
    await tunggu(page, () => /Menunggu lawan/.test(document.getElementById('status-tunggu').textContent));
    await klik(page, 'tombol-batal-room');
    await tidur(400);
    cek('keluar: room tanpa lawan dihapus, lalu kembali ke lobi', (await catatan(page, 'hapus')).length === 1 && await terlihat(page, 'online-lobi') && await page.evaluate(() => !window.__palsu.rooms.ABCDE));

    // Kode kedaluwarsa saat menunggu.
    await palsu(page, () => { window.__palsu.kodeBerikut.push('BCDEF'); });
    await klik(page, 'tombol-buat-room');
    await tunggu(page, () => /Menunggu lawan/.test(document.getElementById('status-tunggu').textContent));
    await palsu(page, () => { window.__palsu.selisih += DuelOnline.MASA_TUNGGU_MS + 1000; });
    await tunggu(page, () => !document.getElementById('online-lobi').hidden, 3000);
    cek('T-7: room tanpa lawan kedaluwarsa setelah 10 menit', /kedaluwarsa/.test(await galatTampil(page) || '') && await page.evaluate(() => !window.__palsu.rooms.BCDEF), String(await galatTampil(page)));
    await page.close();

    // Lawan keluar dari ruang tunggu.
    page = await buka();
    await palsu(page, () => window.__palsu.roomLawan('FGHJK', {}, 'Budi'));
    await keLobi(page);
    await isiKode(page, 'FGHJK');
    await klik(page, 'tombol-gabung');
    await tunggu(page, () => !document.getElementById('tombol-siap').hidden);
    await palsu(page, () => window.__palsu.ubah('FGHJK', (room, t) => { room.pemain['uid-lawan'].menyerah = t; }));
    await tunggu(page, () => !document.getElementById('online-lobi').hidden, 3000);
    cek('T-6: lawan keluar dari ruang tunggu, pemain kembali ke lobi dengan penjelasan', /Budi keluar sebelum duel dimulai/.test(await galatTampil(page) || ''), String(await galatTampil(page)));

    // Tamu keluar dari ruang tunggu.
    await palsu(page, () => window.__palsu.roomLawan('GHJKL', {}, 'Budi'));
    await isiKode(page, 'GHJKL');
    await klik(page, 'tombol-gabung');
    await tunggu(page, () => !document.getElementById('tombol-siap').hidden);
    await klik(page, 'tombol-batal-room');
    await tidur(400);
    cek('T-6: tamu yang keluar dari ruang tunggu memberi tahu pembuat room', (await catatan(page, 'menyerah')).some((c) => c[1] === 'GHJKL') && await terlihat(page, 'online-lobi'));
    await page.close();

    // Keluar di tengah ronde.
    page = await buka();
    const kode = await mulaiSebagaiTuan(page);
    await klik(page, 'tombol-solo-keluar');
    await tidur(500);
    const dialog = await page.evaluate(() => ({
      buka: !document.getElementById('dialog-keluar').hidden,
      judul: document.getElementById('judul-keluar').textContent,
      teks: document.getElementById('teks-keluar').textContent,
    }));
    cek('keluar di tengah pertandingan: diminta yakin dulu', dialog.buka && dialog.judul === 'Keluar dari duel?' && /dihitung kalah di seluruh pertandingan/.test(dialog.teks), JSON.stringify(dialog));
    await klik(page, 'tombol-lanjut-main');
    await tidur(500);
    cek('keluar di tengah pertandingan: Lanjut main tidak mengubah apa pun', (await catatan(page, 'menyerah')).length === 0 && await page.evaluate(() => !document.getElementById('layar-solo').hidden));

    // Keluar saat jeda antarronde juga dihitung kalah, jadi tetap diminta yakin.
    await selesaikan(page, kode, 0);
    await adaLapis(page, '^Kamu menang ronde 1$');
    await klik(page, 'tombol-solo-keluar');
    await tidur(500);
    cek('keluar saat jeda antarronde: tetap diminta yakin', await page.evaluate(() => !document.getElementById('dialog-keluar').hidden && !document.getElementById('dialog-keluar').classList.contains('pergi')) && (await catatan(page, 'menyerah')).length === 0);
    await klik(page, 'tombol-yakin-keluar');
    await tidur(700);
    cek('keluar di tengah pertandingan: dicatat menyerah, lalu kembali ke lobi', (await catatan(page, 'menyerah')).some((c) => c[1] === kode) && await terlihat(page, 'online-lobi') && await page.evaluate(() => document.getElementById('dialog-keluar').hidden || document.getElementById('dialog-keluar').classList.contains('pergi')));
    await page.close();

    // Lawan keluar di tengah pertandingan.
    page = await buka();
    const kode3 = await mulaiSebagaiTuan(page, { atur: { target: 5, sistem: 'balapan', kesulitan: 'hard' } });
    await palsu(page, (k) => window.__palsu.ubah(k, (room, t) => { room.pemain['uid-lawan'].menyerah = t; }), kode3);
    await adaHasil(page);
    const h = await hasilTampil(page);
    cek('lawan keluar di tengah pertandingan: pemain ini menang', h.judul === 'Kamu menang!' && h.detail === 'Budi keluar dari duel.', JSON.stringify(h));

    // Main lagi atas ajakan sendiri: room baru dengan pengaturan yang sama, lewat ruang tunggu lagi.
    await palsu(page, () => { window.__palsu.kodeBerikut.push('RSTUV'); });
    await klik(page, 'tombol-level-lanjut');
    await tunggu(page, () => !document.getElementById('online-tunggu').hidden && /Menunggu lawan/.test(document.getElementById('status-tunggu').textContent));
    const lagi = await page.evaluate((k) => ({
      kode: document.getElementById('kode-room').textContent,
      ajakan: window.__palsu.rooms[k].lanjut,
      atur: window.__palsu.rooms.RSTUV.atur,
      toast: [...document.querySelectorAll('.toast .toast-teks')].map((e) => e.textContent),
    }), kode3);
    cek('main lagi: room baru dengan pengaturan yang sama, dan lawan dikabari', lagi.kode === 'RSTUV' && lagi.ajakan === 'RSTUV' && JSON.stringify(lagi.atur) === JSON.stringify({ kesulitan: 'hard', target: 5, sistem: 'balapan', rev: 0 }), JSON.stringify(lagi));
    cek('main lagi: ajakan sendiri tidak disangka ajakan lawan', !lagi.toast.includes('Budi mengajak main lagi'), JSON.stringify(lagi.toast));
    cek('main lagi: kembali ke ruang tunggu, jadi keduanya harus menekan Siap lagi', (await ruang(page)).atur && (await catatan(page, 'mulai')).length === 1);
    await page.close();

    // Lawan lebih dulu mengajak: tombolnya berubah, lalu pemain ini ikut room lawan.
    page = await buka();
    const kode4 = await mulaiSebagaiTuan(page);
    await palsu(page, (k) => window.__palsu.ubah(k, (room, t) => { room.pemain['uid-lawan'].menyerah = t; }), kode4);
    await adaHasil(page);
    await palsu(page, (k) => {
      window.__palsu.roomLawan('WXYZ2', { target: 7 }, 'Budi');
      window.__palsu.ubah(k, (room) => { room.lanjut = 'WXYZ2'; });
    }, kode4);
    await tunggu(page, () => document.getElementById('tombol-level-lanjut').textContent === 'Gabung pertandingan baru', 3000);
    cek('main lagi: ajakan lawan mengubah tombol dan diberitahukan', (await teksDi(page, 'tombol-level-lanjut')) === 'Gabung pertandingan baru' && (await semuaToast(page)).includes('Budi mengajak main lagi'));
    await klik(page, 'tombol-level-lanjut');
    await tunggu(page, () => !document.getElementById('online-tunggu').hidden && !document.getElementById('tombol-siap').hidden);
    const ikut = await ruang(page);
    cek('main lagi: ikut room lawan, dan masuk ruang tunggunya', ikut.judul === 'Room WXYZ2' && ikut.terkunci && (await aturTampil(page)).target === '7' && (await catatan(page, 'buat')).length === 1, JSON.stringify(ikut));
    await page.close();
  }

  /* Memuat ulang halaman di tengah pertandingan, lalu masuk lagi lewat kode */
  {
    let page = await buka();
    await palsu(page, () => {
      const S = window.__palsu;
      S.roomLawan('FGHJK', {}, 'Budi');
      S.ubah('FGHJK', (room, t) => {
        room.tamu = S.uid;
        room.pemain[S.uid] = { nama: 'Bima', tersambung: false, putusPada: t - 5000, siap: 0, maju: 3 };
        room.pemain['uid-lawan'].siap = 0;
        room.mulaiPada = t - 60000;
        room.puzzle = DuelOnline.pilihDaftarPuzzle(DataLevel, room.atur);
        // Lawan menang ronde 1 pada detik ke-24, jadi ronde 2 berjalan sejak detik ke-29.
        room.ronde = { 0: { 'uid-lawan': { papan: DuelOnline.solusi(DuelOnline.ambilDaftarPuzzle(DataLevel, room)[0]).slice(), pada: room.mulaiPada + 4000 + 20000 } } };
      });
    });
    await keLobi(page);
    await isiKode(page, 'FGHJK');
    await klik(page, 'tombol-gabung');
    const lanjut = await papanTampil(page);
    await tidur(600);
    const judul = await teksDi(page, 'judul-level');
    const b = await bilah(page);
    cek('masuk lagi: papan ronde yang sedang berjalan tampil dengan sisa waktunya', lanjut && /^Duel · 4:[23]\d$/.test(judul) && b.info === 'Ronde 2/5', `${judul}, ${JSON.stringify(b)}`);
    cek('masuk lagi: skor tidak hilang, dan papannya mulai kosong', b.saya === '0' && b.lawan === '1' && await page.evaluate(() => document.querySelectorAll('.slot.terisi').length === 0), JSON.stringify(b));
    cek('masuk lagi: kehadiran dipasang lagi', (await catatan(page, 'hadir')).some((c) => c[1] === 'FGHJK'));
    await page.close();

    // Masuk lagi ke pertandingan yang sudah selesai: hasilnya tetap tampil, tanpa papan.
    page = await buka();
    await palsu(page, () => {
      const S = window.__palsu;
      S.roomLawan('GHJKL', { kesulitan: 'easy', sistem: 'balapan' }, 'Budi');
      S.ubah('GHJKL', (room, t) => {
        room.tamu = S.uid;
        room.pemain[S.uid] = { nama: 'Bima', tersambung: true, siap: 0 };
        room.mulaiPada = t - 120000;
        room.puzzle = DuelOnline.pilihDaftarPuzzle(DataLevel, room.atur);
        const daftar = DuelOnline.ambilDaftarPuzzle(DataLevel, room);
        room.ronde = {};
        [20000, 40000, 60000].forEach((ms, r) => { room.ronde[r] = { 'uid-lawan': { papan: DuelOnline.solusi(daftar[r]).slice(), pada: room.mulaiPada + 4000 + ms } }; });
      });
    });
    await keLobi(page);
    await isiKode(page, 'GHJKL');
    await klik(page, 'tombol-gabung');
    await adaHasil(page);
    const h = await hasilTampil(page);
    cek('hasil tetap tampil walau papan belum sempat dibuka', h.judul === 'Kamu kalah' && h.detail === 'Skor akhir 0–3.', JSON.stringify(h));
    await klik(page, 'tombol-level-peta');
    cek('keluar dari hasil tanpa papan kembali ke lobi', await tunggu(page, () => document.getElementById('layar-hasil').hidden && !document.getElementById('online-lobi').hidden, 3000) && await terlihat(page, 'online-lobi'));
    await page.close();

    // Daftar puzzle yang tidak cocok dengan game ini.
    page = await buka();
    await palsu(page, () => window.__palsu.roomLawan('HJKLM', {}, 'Budi'));
    await keLobi(page);
    await isiKode(page, 'HJKLM');
    await klik(page, 'tombol-gabung');
    await tunggu(page, () => !document.getElementById('tombol-siap').hidden);
    await palsu(page, () => window.__palsu.ubah('HJKLM', (room, t) => {
      room.mulaiPada = t - 10000;
      room.puzzle = DuelOnline.pilihDaftarPuzzle(DataLevel, room.atur).map((p, i) => (i === 3 ? { ...p, sidik: p.sidik + 1 } : p));
    }));
    await adaHasil(page);
    const rusak = await hasilTampil(page);
    cek('daftar puzzle yang tidak cocok: duel dibatalkan dengan penjelasan, tanpa Main lagi', rusak.judul === 'Duel dibatalkan' && /Versi game kalian berbeda/.test(rusak.detail) && rusak.lanjut === null, JSON.stringify(rusak));
    await page.close();
  }

  /* Ukuran layar */
  for (const u of [{ nama: 'hp-kecil', width: 360, height: 640 }, { nama: 'hp', width: 390, height: 844 }, { nama: 'hp-lanskap', width: 740, height: 360 }, { nama: 'tablet', width: 1024, height: 768 }]) {
    const page = await buka({ width: u.width, height: u.height });
    const luar = (selektor) => page.evaluate((sel, w) => {
      const hasil = [];
      document.querySelectorAll(sel).forEach((e) => {
        if (e.hidden || e.closest('[hidden]')) return;
        const q = e.getBoundingClientRect();
        if (!q.width) return;
        if (q.left < -0.5 || q.right > w + 0.5) hasil.push(`${e.id || e.className} ${Math.round(q.left)}..${Math.round(q.right)}`);
      });
      const layar = document.getElementById('layar-online');
      if (layar.scrollWidth > layar.clientWidth + 1) hasil.push(`gulir samping ${layar.scrollWidth - layar.clientWidth}px`);
      return hasil;
    }, selektor, u.width);
    const muatTinggi = () => page.evaluate((t) => {
      const layar = document.getElementById('layar-online');
      const bawah = Math.max(...[...document.querySelectorAll('#online-tunggu > :not([hidden])')].map((e) => e.getBoundingClientRect().bottom));
      return bawah <= t + 0.5 && layar.scrollHeight <= layar.clientHeight + 1 ? '' : `bawah ${Math.round(bawah)} dari ${t}, gulir ${layar.scrollHeight - layar.clientHeight}px`;
    }, u.height);
    await keLobi(page, 'Abcdefghijklmnop');
    await page.screenshot({ path: path.join(FOTO, `online-lobi-${u.nama}.png`) });
    const lobi = await luar('#online-lobi *');
    cek(`${u.nama}: lobi duel online muat`, lobi.length === 0, lobi.slice(0, 3).join(' | '));

    await palsu(page, () => { window.__palsu.kodeBerikut.push('WWWWW'); });
    await klik(page, 'tombol-buat-room');
    await tunggu(page, () => /Menunggu lawan/.test(document.getElementById('status-tunggu').textContent));
    // Pengaturan dengan teks terpanjang: Balapan, 10 poin.
    await pilihAtur(page, 'target', 10);
    await pilihAtur(page, 'sistem', 'balapan');
    await tunggu(page, () => /Balapan/.test(document.getElementById('info-atur').textContent), 2000);
    await tidur(300);
    await page.screenshot({ path: path.join(FOTO, `online-tunggu-${u.nama}.png`) });
    let samping = await luar('#online-tunggu *');
    let tinggi = await muatTinggi();
    cek(`${u.nama}: ruang tunggu sebelum ada lawan muat tanpa digulir`, samping.length === 0 && tinggi === '', samping.slice(0, 3).join(' | ') + tinggi);

    await palsu(page, () => { window.__palsu.lawanGabung('WWWWW', 'Wwwwwwwwwwwwwwww'); window.__palsu.lawanSiap('WWWWW'); });
    await tunggu(page, () => !document.getElementById('tombol-siap').hidden);
    await tidur(300);
    await page.screenshot({ path: path.join(FOTO, `online-siap-${u.nama}.png`) });
    samping = await luar('#online-tunggu *');
    tinggi = await muatTinggi();
    const segmen = await page.evaluate(() => [...document.querySelectorAll('#atur-tunggu .segmen button')].filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent));
    cek(`${u.nama}: ruang tunggu dengan lawan bernama 16 karakter muat tanpa digulir`, samping.length === 0 && tinggi === '' && segmen.length === 0, samping.slice(0, 3).join(' | ') + tinggi + segmen.join());

    await pilihAtur(page, 'sistem', 'rebutan');
    await pilihAtur(page, 'target', 3);
    await tidur(200);
    await palsu(page, () => window.__palsu.lawanSiap('WWWWW'));
    await klik(page, 'tombol-siap');
    await papanTampil(page);
    await tidur(900);
    const papanLuar = () => page.evaluate((w, t) => [...document.querySelectorAll('.slot, .sedia, #tombol-kunci, .bar-solo .ikon, #judul-level, #pesan-solo, #bilah-duel, #bilah-duel *, .kotak-ronde')].filter((e) => {
      if (e.hidden || e.closest('[hidden]')) return false;
      const q = e.getBoundingClientRect();
      return q.left < -0.5 || q.top < -0.5 || q.right > w + 0.5 || q.bottom > t + 0.5;
    }).map((e) => e.id || e.className), u.width, u.height);
    const tumpang = await page.evaluate(() => {
      const kotak = (el) => el.getBoundingClientRect();
      const b = kotak(document.getElementById('bilah-duel'));
      const p = kotak(document.getElementById('papan'));
      const lawan = document.getElementById('nama-lawan-duel');
      return { menimpaPapan: b.bottom > p.top + 0.5 && b.top < p.bottom && b.right > p.left && b.left < p.right, namaTerlihat: lawan.getBoundingClientRect().width > 20 };
    });
    await page.screenshot({ path: path.join(FOTO, `online-papan-${u.nama}.png`) });
    const luarPapan = await papanLuar();
    cek(`${u.nama}: papan duel dan bilah skor muat dengan nama lawan 16 karakter`, luarPapan.length === 0 && !tumpang.menimpaPapan && tumpang.namaTerlihat, luarPapan.slice(0, 4).join() + JSON.stringify(tumpang));

    await palsu(page, () => window.__palsu.lawanJawab('WWWWW', 0));
    await adaLapis(page, 'menang ronde 1$');
    await tidur(300);
    await page.screenshot({ path: path.join(FOTO, `online-jeda-${u.nama}.png`) });
    const luarJeda = await papanLuar();
    cek(`${u.nama}: lapisan antarronde muat`, luarJeda.length === 0 && (await lapis(page)) !== null, luarJeda.slice(0, 4).join());
    await page.close();
  }

  /* Tautan undangan */
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    page.on('pageerror', (e) => galat.push('pageerror: ' + e.message));
    // SDK Firebase tidak boleh diunduh selama uji ini, jadi permintaan ke luar diputus.
    await page.setRequestInterception(true);
    page.on('request', (r) => (r.url().startsWith('file:') ? r.continue() : r.abort()));
    await page.goto(require('url').pathToFileURL(path.join(__dirname, '..', 'public', 'index.html')).href + '?room=abcde');
    await tidur(900);
    const undangan = await page.evaluate(() => ({
      lobi: !document.getElementById('layar-online').hidden && !document.getElementById('online-lobi').hidden,
      kode: document.getElementById('input-kode').value,
      menu: document.getElementById('layar-menu').hidden || document.getElementById('layar-menu').classList.contains('pergi'),
    }));
    cek('tautan undangan ?room=KODE membuka lobi dengan kode terisi', undangan.lobi && undangan.kode === 'ABCDE' && undangan.menu, JSON.stringify(undangan));
    // Tanpa internet, lobi tetap tampil dan tombolnya menjelaskan masalahnya.
    await page.evaluate(() => { document.getElementById('input-nama').value = 'Bima'; });
    await page.evaluate(() => document.getElementById('tombol-gabung').click());
    const jelas = await page.waitForFunction(() => /Tidak bisa tersambung/.test(document.getElementById('galat-online').textContent), { timeout: 20000 }).then(() => true, () => false);
    cek('tanpa internet: Gabung menjelaskan bahwa sambungan gagal', jelas, await page.evaluate(() => document.getElementById('galat-online').textContent));
    await page.close();
  }
};
