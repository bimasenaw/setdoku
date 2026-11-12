// Uji browser duel online (tahap 4a). Lawan dan server ditirukan di dalam halaman, jadi yang
// diuji adalah alur layarnya: lobi, ruang tunggu, papan, hasil, dan main lagi.
// Sambungan Firebase sungguhan dan aturan keamanannya diuji terpisah dengan Firebase Emulator.
const path = require('path');

const LAWAN = 'uid-lawan';
const SAYA = 'uid-saya';

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
    kodeBerikut: [], // kode untuk room yang dibuat berikutnya
    majuHitung: 0, // memangkas hitung mundur, supaya uji tidak menunggu 4 detik
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
  S.kabari = kabari;
  S.sekarang = sekarang;
  // Mengubah room seolah-olah dari HP lawan.
  S.ubah = (kode, fn) => {
    fn(S.rooms[kode], sekarang());
    kabari(kode);
  };
  S.aturSambung = (ya) => {
    S.tersambung = ya;
    [...S.sambung].forEach((fn) => fn(ya));
  };
  // Room buatan lawan, siap dimasuki pemain ini.
  S.roomLawan = (kode, kesulitan, nama) => {
    const puzzle = D.pilihPuzzle(window.DataLevel, kesulitan);
    S.rooms[kode] = {
      v: D.VERSI, dibuat: sekarang(), tuan: 'uid-lawan', kesulitan, ...puzzle,
      pemain: { 'uid-lawan': { nama, tersambung: true } },
    };
  };
  window.__palsu = S;
  window.Online = {
    masuk: () => nanti(() => { coba(); return S.uid; }),
    buatRoom: ({ nama, kesulitan }) => nanti(() => {
      coba();
      const kode = S.kodeBerikut.shift() || D.buatKode();
      const puzzle = D.pilihPuzzle(window.DataLevel, kesulitan);
      S.rooms[kode] = { v: D.VERSI, dibuat: sekarang(), tuan: S.uid, kesulitan, ...puzzle, pemain: { [S.uid]: { nama, tersambung: true } } };
      S.catatan.push(['buat', kode, kesulitan, nama]);
      return kode;
    }),
    gabungRoom: (kode, nama) => nanti(() => {
      coba();
      const room = S.rooms[kode];
      if (!room) throw galat('tiada');
      if (room.tamu && (room.tuan === S.uid || room.tamu === S.uid)) return;
      if (room.tuan === S.uid) throw galat('sendiri');
      if (room.tamu) throw galat('penuh');
      if (!D.ambilPuzzle(window.DataLevel, room)) throw galat('versi');
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
    mulai: (kode) => nanti(() => {
      S.rooms[kode].mulaiPada = sekarang() - S.majuHitung;
      S.catatan.push(['mulai', kode]);
      kabari(kode);
    }),
    kirimJawaban: (kode, kawat) => nanti(() => {
      const room = S.rooms[kode];
      room.jawaban = room.jawaban || {};
      room.jawaban[S.uid] = { papan: kawat, pada: sekarang() };
      S.catatan.push(['jawab', kode, kawat]);
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
  console.log('\n== Duel online (lawan dan server ditirukan) ==');

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
  const keLobi = async (page, nama = 'Bima') => {
    await klik(page, 'tombol-online');
    await tidur(500);
    if (nama !== null) await isiNama(page, nama);
  };
  // Pemain ini membuat room, lalu lawan bergabung dan duel dimulai.
  const mulaiSebagaiTuan = async (page, { kesulitan = 'medium', kode = 'ABCDE', lawan = 'Budi' } = {}) => {
    await palsu(page, (k) => { window.__palsu.kodeBerikut.push(k); window.__palsu.majuHitung = 3700; }, kode);
    await keLobi(page);
    await page.evaluate((k) => document.querySelector(`#segmen-kesulitan [data-kesulitan="${k}"]`).click(), kesulitan);
    await klik(page, 'tombol-buat-room');
    await tunggu(page, () => /Menunggu lawan/.test(document.getElementById('status-tunggu').textContent));
    await palsu(page, (k, nama) => window.__palsu.ubah(k, (room) => {
      room.tamu = 'uid-lawan';
      room.pemain['uid-lawan'] = { nama, tersambung: true };
    }), kode, lawan);
    await tunggu(page, () => !document.getElementById('layar-solo').hidden && document.querySelectorAll('.slot').length === 9);
    await tidur(700);
    return kode;
  };
  // Lawan membuat room, lalu pemain ini bergabung dan duel dimulai.
  const mulaiSebagaiTamu = async (page, { kesulitan = 'medium', kode = 'FGHJK', lawan = 'Budi' } = {}) => {
    await palsu(page, (k, s, nama) => window.__palsu.roomLawan(k, s, nama), kode, kesulitan, lawan);
    await keLobi(page);
    await isiKode(page, kode);
    await klik(page, 'tombol-gabung');
    await tunggu(page, () => /memulai duel/.test(document.getElementById('status-tunggu').textContent));
    await palsu(page, (k) => window.__palsu.ubah(k, (room, t) => { room.mulaiPada = t - 3700; }), kode);
    await tunggu(page, () => !document.getElementById('layar-solo').hidden && document.querySelectorAll('.slot').length === 9);
    await tidur(700);
    return kode;
  };
  const dataPuzzle = (page, kode) => page.evaluate((k) => {
    const puzzle = DuelOnline.ambilPuzzle(DataLevel, window.__palsu.rooms[k]);
    return { papan: puzzle.papan, tersedia: puzzle.tersedia, solusi: DuelOnline.solusi(puzzle) };
  }, kode);
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
  const adaHasil = (page) => page.waitForSelector('#layar-hasil:not([hidden])', { timeout: 6000 }).then(() => tidur(450));

  /* Lobi */
  {
    const page = await buka();
    await keLobi(page, null);
    cek('menu: Duel online membuka lobi', await terlihat(page, 'online-lobi') && !(await terlihat(page, 'online-tunggu')));
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

    const waktu = [];
    for (const k of ['easy', 'medium', 'hard']) {
      await page.evaluate((x) => document.querySelector(`#segmen-kesulitan [data-kesulitan="${x}"]`).click(), k);
      waktu.push((await teksDi(page, 'info-kesulitan')).match(/\d+:\d\d/)[0]);
    }
    cek('lobi: waktu mengikuti tingkat kesulitan', waktu.join() === '3:00,5:00,8:00', waktu.join());

    // Room penuh dan room versi lain.
    await palsu(page, () => {
      const S = window.__palsu;
      S.roomLawan('PENHH', 'easy', 'Budi');
      S.rooms.PENHH.tamu = 'uid-orang-lain';
      S.roomLawan('VERSH', 'easy', 'Budi');
      S.rooms.VERSH.sidik += 1;
      S.roomLawan('LAMAA', 'easy', 'Budi');
      S.rooms.LAMAA.dibuat -= 11 * 60 * 1000;
    });
    for (const [kode, pola, nama] of [['PENHH', /sudah berisi dua pemain/, 'room penuh'], ['VERSH', /Versi game kamu berbeda/, 'versi game berbeda'], ['LAMAA', /kedaluwarsa/, 'kode kedaluwarsa']]) {
      await isiKode(page, kode);
      await klik(page, 'tombol-gabung');
      await tunggu(page, (p) => new RegExp(p).test(document.getElementById('galat-online').textContent), 3000, pola.source);
      cek(`lobi: ${nama} dijelaskan`, pola.test(await galatTampil(page) || ''), String(await galatTampil(page)));
    }

    // Room buatan sendiri: dua tab di browser yang sama tidak bisa saling melawan.
    await palsu(page, () => {
      const S = window.__palsu;
      S.roomLawan('SENDR', 'easy', 'Bima');
      S.rooms.SENDR.tuan = S.uid;
      S.rooms.SENDR.pemain = { [S.uid]: { nama: 'Bima', tersambung: true } };
    });
    await isiKode(page, 'SENDR');
    await klik(page, 'tombol-gabung');
    await tunggu(page, () => /room buatanmu sendiri/.test(document.getElementById('galat-online').textContent), 3000);
    cek('lobi: bergabung ke room buatan sendiri dijelaskan', /browser lain/.test(await galatTampil(page) || ''), String(await galatTampil(page)));

    await klik(page, 'tombol-online-keluar');
    const diMenu = await tunggu(page, () => !document.getElementById('layar-menu').hidden && document.getElementById('layar-online').hidden, 3000);
    cek('lobi: tombol keluar kembali ke menu', diMenu, await page.evaluate(() => JSON.stringify({ menu: document.getElementById('layar-menu').hidden, online: document.getElementById('layar-online').hidden, galat: document.getElementById('galat-online').textContent })));
    await klik(page, 'tombol-online');
    await tidur(500);
    cek('lobi: username diingat saat dibuka lagi', await page.evaluate(() => document.getElementById('input-nama').value === 'Bima Sena'));
    await page.close();
  }

  /* Pembuat room: ruang tunggu, kunci salah, lalu menang */
  {
    const page = await buka();
    await palsu(page, () => { window.__palsu.kodeBerikut.push('ABCDE'); });
    await keLobi(page);
    await klik(page, 'tombol-buat-room');
    await tunggu(page, () => /Menunggu lawan/.test(document.getElementById('status-tunggu').textContent));
    const tungguAwal = await page.evaluate(() => ({
      kode: document.getElementById('kode-room').textContent,
      kodeTampil: !document.getElementById('kode-room').hidden,
      bagi: !document.getElementById('tombol-bagi-kode').hidden,
      batal: !document.getElementById('tombol-batal-room').hidden,
      catatan: document.getElementById('catatan-tunggu').textContent,
    }));
    cek('ruang tunggu: kode room tampil dan bisa dibagikan', tungguAwal.kode === 'ABCDE' && tungguAwal.kodeTampil && tungguAwal.bagi && tungguAwal.batal && /10 menit/.test(tungguAwal.catatan), JSON.stringify(tungguAwal));
    cek('ruang tunggu: kehadiran dipasang untuk room ini', (await catatan(page, 'hadir')).some((c) => c[1] === 'ABCDE'));
    await page.screenshot({ path: path.join(FOTO, 'online-tunggu.png') });

    // Lawan bergabung tetapi belum tersambung: duel belum dimulai.
    await palsu(page, () => window.__palsu.ubah('ABCDE', (room) => {
      room.tamu = 'uid-lawan';
      room.pemain['uid-lawan'] = { nama: 'Budi', tersambung: false };
    }));
    await tidur(600);
    cek('ruang tunggu: duel tidak dimulai selama lawan belum tersambung', (await catatan(page, 'mulai')).length === 0 && /Menunggu Budi tersambung/.test(await teksDi(page, 'status-tunggu')), await teksDi(page, 'status-tunggu'));
    await palsu(page, () => window.__palsu.ubah('ABCDE', (room) => { room.pemain['uid-lawan'].tersambung = true; }));
    await tunggu(page, () => !document.getElementById('angka-mundur').hidden);
    const hitung = await page.evaluate(() => ({
      angka: document.getElementById('angka-mundur').textContent,
      judul: document.getElementById('judul-tunggu').textContent,
      kode: document.getElementById('kode-room').hidden,
      batal: document.getElementById('tombol-batal-room').hidden,
    }));
    cek('ruang tunggu: pembuat room memulai duel begitu lawan tersambung', (await catatan(page, 'mulai')).length === 1);
    cek('hitung mundur: angka tampil, kode dan tombol batal hilang', hitung.angka === '3' && hitung.judul === 'Melawan Budi' && hitung.kode && hitung.batal, JSON.stringify(hitung));
    await page.screenshot({ path: path.join(FOTO, 'online-hitung.png') });

    const mulaiTunggu = Date.now();
    await tunggu(page, () => !document.getElementById('layar-solo').hidden && document.querySelectorAll('.slot').length === 9, 7000);
    const lamaHitung = Date.now() - mulaiTunggu;
    cek('hitung mundur: papan tampil setelah sekitar 4 detik', lamaHitung > 2500 && lamaHitung < 5500, `${lamaHitung} ms`);
    await tidur(800);
    const awal = await page.evaluate(() => ({
      judul: document.getElementById('judul-level').textContent,
      timer: !document.getElementById('timer-solo').hidden,
      hint: document.getElementById('tombol-hint').hidden,
      waktu: document.getElementById('tombol-waktu').hidden,
      pesan: document.getElementById('pesan-solo').textContent,
      kunci: document.getElementById('tombol-kunci').textContent,
    }));
    cek('papan duel: timer tampil dan judulnya Duel', /^Duel · [45]:\d\d$/.test(awal.judul) && awal.timer, awal.judul);
    cek('O-6: tidak ada Hint dan Extra Time', awal.hint && awal.waktu);
    cek('papan duel: pesan menyebut nama lawan', /Budi/.test(awal.pesan), awal.pesan);
    await page.screenshot({ path: path.join(FOTO, 'online-papan.png') });

    const puzzle = await dataPuzzle(page, 'ABCDE');
    await page.keyboard.press('h');
    await tidur(200);
    cek('O-6: tombol H tidak membuka kartu', (await page.evaluate(() => document.querySelectorAll('.slot.tetap').length)) === puzzle.papan.filter((k) => k !== null).length);

    // Kunci salah: dibekukan, tanpa letak kesalahan, dan papan tidak dikirim.
    await isiSemua(page, puzzle, { tukar: true });
    await klik(page, 'tombol-kunci');
    await tidur(300);
    const salah = await page.evaluate(() => ({
      kunci: document.getElementById('tombol-kunci').textContent,
      mati: document.getElementById('tombol-kunci').getAttribute('aria-disabled'),
      garis: document.querySelectorAll('.garis-sorot, .slot.gagal').length,
      pesan: document.getElementById('pesan-solo').textContent,
      hasil: document.getElementById('layar-hasil').hidden,
    }));
    const toastSalah = await toast(page);
    cek('O-4: kunci salah membekukan tombol kunci 5 detik', /^Tunggu [45] detik$/.test(salah.kunci) && salah.mati === 'true', JSON.stringify(salah));
    cek('O-4: letak kesalahan tidak ditunjukkan', salah.garis === 0 && salah.pesan === 'Jawaban belum benar.', JSON.stringify(salah));
    cek('O-4: pesan melayang menjelaskan penaltinya', !!toastSalah && toastSalah.teks === 'Jawaban belum benar' && /dibekukan 5 detik/.test(toastSalah.sub || ''), JSON.stringify(toastSalah));
    cek('O-10: papan yang salah tidak dikirim ke server', (await catatan(page, 'jawab')).length === 0 && salah.hasil);
    await page.screenshot({ path: path.join(FOTO, 'online-beku.png') });
    // Jam halaman dimundurkan, supaya pembekuan 5 detik tidak habis selagi uji memasang kartu.
    await page.evaluate(() => {
      window.__jamAsli = performance.now.bind(performance);
      performance.now = () => window.__jamAsli() - 30000;
    });

    // Papan dibetulkan saat masih beku: kunci tetap ditolak.
    const [a, b] = kosongDari(puzzle);
    await page.evaluate((x, y) => {
      const slot = document.querySelectorAll('.slot');
      slot[x].click();
      slot[y].click();
    }, a, b);
    await tidur(400);
    await pasang(page, puzzle, a, puzzle.solusi[a]);
    await pasang(page, puzzle, b, puzzle.solusi[b]);
    await tidur(500);
    await klik(page, 'tombol-kunci');
    await tidur(250);
    const ditolak = await toast(page);
    cek('O-4: selama beku, kunci ditolak walau papan sudah benar', (await catatan(page, 'jawab')).length === 0 && !!ditolak && /^Tunggu \d+ detik lagi$/.test(ditolak.teks), JSON.stringify(ditolak));

    // Jam halaman dimajukan melewati masa beku.
    await page.evaluate(() => {
      performance.now = () => window.__jamAsli() + 5500;
    });
    await tunggu(page, () => document.getElementById('tombol-kunci').textContent === 'Kunci jawaban', 3000);
    cek('O-4: setelah 5 detik tombol kunci menyala lagi', await page.evaluate(() => document.getElementById('tombol-kunci').getAttribute('aria-disabled') === 'false'));

    const progresSebelum = await page.evaluate(() => localStorage.getItem('setdoku-progres'));
    await klik(page, 'tombol-kunci');
    await adaHasil(page);
    const menang = await hasilTampil(page);
    const kiriman = await catatan(page, 'jawab');
    cek('O-1: jawaban benar dikirim satu kali', kiriman.length === 1 && kiriman[0][2].join() === puzzle.solusi.join(), JSON.stringify(kiriman));
    cek('O-1: mengunci jawaban benar lebih dulu berarti menang', menang.judul === 'Kamu menang!' && menang.detail === 'Kamu mengunci jawaban benar lebih dulu.', JSON.stringify(menang));
    cek('hasil duel: tombolnya Main lagi dan Keluar', menang.lanjut === 'Main lagi' && menang.tutup === 'Keluar' && !menang.ulang && !menang.practice, JSON.stringify(menang));
    cek('O-7: duel online tidak memberi Stars dan tidak memotong nyawa', !menang.stars && !menang.nyawa && (await page.evaluate(() => localStorage.getItem('setdoku-progres'))) === progresSebelum);
    await page.screenshot({ path: path.join(FOTO, 'online-menang.png') });

    await klik(page, 'tombol-level-peta');
    const diLobi = await tunggu(page, () => document.getElementById('layar-hasil').hidden && document.getElementById('layar-solo').hidden && !document.getElementById('online-lobi').hidden, 3000);
    cek('hasil duel: Keluar kembali ke lobi', diLobi && await terlihat(page, 'online-lobi'));

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
    }));
    cek('Practice sesudah duel kembali normal', solo.judul === 'Level 1' && solo.hint && solo.timer && solo.kunci === 'Kunci jawaban' && !/Budi/.test(solo.pesan), JSON.stringify(solo));
    await page.close();
  }

  /* Tamu: bergabung dengan kode, lalu kalah karena lawan lebih dulu */
  {
    const page = await buka();
    await palsu(page, () => window.__palsu.roomLawan('FGHJK', 'easy', 'Budi'));
    await keLobi(page);
    await isiKode(page, ' fgh-jk ');
    await klik(page, 'tombol-gabung');
    await tunggu(page, () => /memulai duel/.test(document.getElementById('status-tunggu').textContent));
    const siap = await page.evaluate(() => ({
      judul: document.getElementById('judul-tunggu').textContent,
      status: document.getElementById('status-tunggu').textContent,
      kode: document.getElementById('kode-room').hidden,
      bagi: document.getElementById('tombol-bagi-kode').hidden,
      batal: !document.getElementById('tombol-batal-room').hidden,
    }));
    cek('tamu: kode dari chat dirapikan, lalu masuk ke room', (await catatan(page, 'gabung')).some((c) => c[1] === 'FGHJK'), JSON.stringify(await catatan(page, 'gabung')));
    cek('tamu: menunggu pembuat room memulai', siap.judul === 'Room FGHJK' && siap.status === 'Menunggu Budi memulai duel…' && siap.kode && siap.bagi && siap.batal, JSON.stringify(siap));
    cek('tamu: tidak memulai duel sendiri', (await catatan(page, 'mulai')).length === 0);

    await palsu(page, () => window.__palsu.ubah('FGHJK', (room, t) => { room.mulaiPada = t - 3700; }));
    await tunggu(page, () => !document.getElementById('layar-solo').hidden && document.querySelectorAll('.slot').length === 9);
    await tidur(700);
    const judul = await teksDi(page, 'judul-level');
    cek('tamu: timer mengikuti tingkat room (Mudah, 3 menit)', /^Duel · (3:00|2:5\d)$/.test(judul), judul);

    const puzzle = await dataPuzzle(page, 'FGHJK');
    await pasang(page, puzzle, kosongDari(puzzle)[0], puzzle.solusi[kosongDari(puzzle)[0]]);
    await palsu(page, () => window.__palsu.ubah('FGHJK', (room, t) => {
      const puzzleRoom = DuelOnline.ambilPuzzle(DataLevel, room);
      room.jawaban = { 'uid-lawan': { papan: DuelOnline.solusi(puzzleRoom).slice(), pada: t } };
    }));
    await adaHasil(page);
    const kalah = await hasilTampil(page);
    cek('O-1: lawan mengunci benar lebih dulu berarti kalah', kalah.judul === 'Kamu kalah' && kalah.detail === 'Budi mengunci jawaban benar lebih dulu.' && /gagal/.test(kalah.kelas), JSON.stringify(kalah));
    cek('kalah: papan terkunci dan timer berhenti', await page.evaluate(() => [...document.querySelectorAll('.slot')].every((b) => b.disabled) && document.getElementById('tombol-kunci').getAttribute('aria-disabled') === 'true'));
    cek('kalah: papan pemain ini tidak dikirim', (await catatan(page, 'jawab')).length === 0);
    await page.screenshot({ path: path.join(FOTO, 'online-kalah.png') });

    // Lawan mengajak main lagi lewat room baru.
    await palsu(page, () => {
      const S = window.__palsu;
      S.roomLawan('MNPQR', 'easy', 'Budi');
      S.ubah('FGHJK', (room) => { room.lanjut = 'MNPQR'; });
    });
    await tunggu(page, () => document.getElementById('tombol-level-lanjut').textContent === 'Gabung ronde berikutnya', 3000);
    const ajakan = await toast(page);
    cek('main lagi: ajakan lawan mengubah tombol dan memberi tahu', (await teksDi(page, 'tombol-level-lanjut')) === 'Gabung ronde berikutnya' && !!ajakan && ajakan.teks === 'Budi mengajak main lagi', JSON.stringify(ajakan));
    await klik(page, 'tombol-level-lanjut');
    await tunggu(page, () => !document.getElementById('online-tunggu').hidden && /memulai duel/.test(document.getElementById('status-tunggu').textContent));
    const ronde2 = await page.evaluate(() => ({
      judul: document.getElementById('judul-tunggu').textContent,
      hasil: document.getElementById('layar-hasil').hidden || document.getElementById('layar-hasil').classList.contains('pergi'),
      tamu: window.__palsu.rooms.MNPQR.tamu,
    }));
    cek('main lagi: menerima ajakan langsung masuk ke room baru', ronde2.judul === 'Room MNPQR' && ronde2.hasil && ronde2.tamu === SAYA, JSON.stringify(ronde2));

    // Ronde kedua berjalan dengan papan baru.
    await palsu(page, () => window.__palsu.ubah('MNPQR', (room, t) => { room.mulaiPada = t - 3700; }));
    const papanBaru = await tunggu(page, () => !document.getElementById('layar-solo').hidden && document.querySelectorAll('.slot.terisi').length === 0 && document.querySelectorAll('.slot').length === 9);
    cek('main lagi: ronde kedua mulai dengan papan kosong', papanBaru);
    await page.close();
  }

  /* Waktu habis: menang, seri, dan papan lawan yang tidak tiba */
  for (const kasus of [
    { nama: 'kartu benar lebih banyak menang', saya: 2, lawan: 1, judul: 'Kamu menang!', detail: 'Waktu habis. Kartu benar: kamu 2, Budi 1.' },
    { nama: 'kartu benar sama berarti seri', saya: 1, lawan: 1, judul: 'Seri', detail: 'Waktu habis. Kartu benar: kamu 1, Budi 1.' },
    { nama: 'kartu benar lebih sedikit kalah', saya: 0, lawan: 3, judul: 'Kamu kalah', detail: 'Waktu habis. Kartu benar: kamu 0, Budi 3.' },
    { nama: 'papan lawan tidak tiba dihitung 0', saya: 1, lawan: null, judul: 'Kamu menang!', detail: 'Waktu habis. Kartu benar: kamu 1, Budi 0.' },
  ]) {
    const page = await buka();
    const kode = await mulaiSebagaiTamu(page, { kesulitan: 'easy' });
    const puzzle = await dataPuzzle(page, kode);
    const kosong = kosongDari(puzzle);
    for (const i of kosong.slice(0, kasus.saya)) await pasang(page, puzzle, i, puzzle.solusi[i]);
    await tidur(400);
    // Waktu server dimajukan sampai melewati tenggat.
    await palsu(page, (k) => {
      const S = window.__palsu;
      S.selisih += DuelOnline.tenggat(S.rooms[k]) - S.sekarang() + 50;
    }, kode);
    await tunggu(page, () => window.__palsu.catatan.some((c) => c[0] === 'jawab'), 3000);
    const kiriman = (await catatan(page, 'jawab'))[0];
    const harapan = puzzle.papan.map((k, i) => (k !== null ? k : kosong.indexOf(i) < kasus.saya ? puzzle.solusi[i] : -1));
    const habis = await page.evaluate(() => ({
      pesan: document.getElementById('pesan-solo').textContent,
      judul: document.getElementById('judul-level').textContent,
      mati: [...document.querySelectorAll('.slot')].every((b) => b.disabled),
    }));
    if (kasus.lawan === null) {
      cek('O-3: waktu habis mengirim papan apa adanya, slot kosong ditulis -1', !!kiriman && kiriman[2].join() === harapan.join(), JSON.stringify(kiriman));
      cek('O-3: waktu habis mengunci papan dan menunggu hasil', habis.mati && habis.judul === 'Duel · 0:00' && /Menghitung hasil/.test(habis.pesan), JSON.stringify(habis));
      cek('O-3: hasil belum diumumkan selama papan lawan masih ditunggu', await page.evaluate(() => document.getElementById('layar-hasil').hidden));
      await palsu(page, () => { window.__palsu.selisih += DuelOnline.TENGGANG_KIRIM_MS + DuelOnline.JEDA_AMAN_MS; });
    } else {
      await palsu(page, (k, n) => window.__palsu.ubah(k, (room) => {
        const puzzleRoom = DuelOnline.ambilPuzzle(DataLevel, room);
        const kunci = DuelOnline.solusi(puzzleRoom);
        let sisa = n;
        const papan = puzzleRoom.papan.map((kartu, i) => {
          if (kartu !== null) return kartu;
          if (sisa > 0) { sisa -= 1; return kunci[i]; }
          return -1;
        });
        room.jawaban = room.jawaban || {};
        room.jawaban['uid-lawan'] = { papan, pada: DuelOnline.tenggat(room) + 300 };
      }), kode, kasus.lawan);
    }
    await adaHasil(page);
    const h = await hasilTampil(page);
    cek(`O-3: ${kasus.nama}`, h.judul === kasus.judul && h.detail === kasus.detail, JSON.stringify(h));
    if (kasus.judul === 'Seri') {
      cek('seri: judulnya netral, bukan merah atau hijau', /netral/.test(h.kelas) && !/gagal/.test(h.kelas), h.kelas);
      await page.screenshot({ path: path.join(FOTO, 'online-seri.png') });
    }
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
    cek('O-5: lawan yang kembali diberitahukan, dan duel lanjut', /Kunci jawaban benar lebih dulu dari Budi/.test(kembali.pesan) && !!kembali.toast && kembali.toast.teks === 'Budi tersambung lagi', JSON.stringify(kembali));

    await palsu(page, (k) => window.__palsu.ubah(k, (room, t) => {
      room.pemain['uid-lawan'].tersambung = false;
      room.pemain['uid-lawan'].putusPada = t - 30500;
    }), kode);
    await adaHasil(page);
    const h = await hasilTampil(page);
    cek('O-5: lawan putus lebih dari 30 detik, pemain ini mengklaim menang', (await catatan(page, 'klaim')).length === 1 && h.judul === 'Kamu menang!' && h.detail === 'Budi terputus lebih dari 30 detik.', JSON.stringify(h));
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
  }

  /* Keluar dan batal */
  {
    // Pembuat room membatalkan sebelum ada lawan.
    let page = await buka();
    await palsu(page, () => { window.__palsu.kodeBerikut.push('ABCDE'); });
    await keLobi(page);
    await klik(page, 'tombol-buat-room');
    await tunggu(page, () => /Menunggu lawan/.test(document.getElementById('status-tunggu').textContent));
    await klik(page, 'tombol-batal-room');
    await tidur(400);
    cek('batal: room tanpa lawan dihapus, lalu kembali ke lobi', (await catatan(page, 'hapus')).length === 1 && await terlihat(page, 'online-lobi') && await page.evaluate(() => !window.__palsu.rooms.ABCDE));

    // Kode kedaluwarsa saat menunggu.
    await palsu(page, () => { window.__palsu.kodeBerikut.push('BCDEF'); });
    await klik(page, 'tombol-buat-room');
    await tunggu(page, () => /Menunggu lawan/.test(document.getElementById('status-tunggu').textContent));
    await palsu(page, () => { window.__palsu.selisih += DuelOnline.MASA_TUNGGU_MS + 1000; });
    await tunggu(page, () => !document.getElementById('online-lobi').hidden, 3000);
    cek('O-9: room tanpa lawan kedaluwarsa setelah 10 menit', /kedaluwarsa/.test(await galatTampil(page) || '') && await page.evaluate(() => !window.__palsu.rooms.BCDEF), String(await galatTampil(page)));
    await page.close();

    // Lawan keluar sebelum duel dimulai.
    page = await buka();
    await palsu(page, () => window.__palsu.roomLawan('FGHJK', 'easy', 'Budi'));
    await keLobi(page);
    await isiKode(page, 'FGHJK');
    await klik(page, 'tombol-gabung');
    await tunggu(page, () => /memulai duel/.test(document.getElementById('status-tunggu').textContent));
    await palsu(page, () => window.__palsu.ubah('FGHJK', (room, t) => { room.pemain['uid-lawan'].menyerah = t; }));
    await tunggu(page, () => !document.getElementById('online-lobi').hidden, 3000);
    cek('batal: lawan keluar sebelum mulai, pemain kembali ke lobi dengan penjelasan', /Budi keluar sebelum duel dimulai/.test(await galatTampil(page) || ''), String(await galatTampil(page)));

    // Tamu membatalkan sebelum duel dimulai.
    await palsu(page, () => window.__palsu.roomLawan('GHJKL', 'easy', 'Budi'));
    await isiKode(page, 'GHJKL');
    await klik(page, 'tombol-gabung');
    await tunggu(page, () => /memulai duel/.test(document.getElementById('status-tunggu').textContent));
    await klik(page, 'tombol-batal-room');
    await tidur(400);
    cek('batal: tamu yang keluar sebelum mulai memberi tahu pembuat room', (await catatan(page, 'menyerah')).some((c) => c[1] === 'GHJKL') && await terlihat(page, 'online-lobi'));
    await page.close();

    // Keluar di tengah duel.
    page = await buka();
    const kode = await mulaiSebagaiTuan(page);
    await klik(page, 'tombol-solo-keluar');
    await tidur(500);
    const dialog = await page.evaluate(() => ({
      buka: !document.getElementById('dialog-keluar').hidden,
      judul: document.getElementById('judul-keluar').textContent,
      teks: document.getElementById('teks-keluar').textContent,
    }));
    cek('keluar di tengah duel: diminta yakin dulu', dialog.buka && dialog.judul === 'Keluar dari duel?' && /dihitung kalah/.test(dialog.teks), JSON.stringify(dialog));
    await klik(page, 'tombol-lanjut-main');
    await tidur(500);
    cek('keluar di tengah duel: Lanjut main tidak mengubah apa pun', (await catatan(page, 'menyerah')).length === 0 && await page.evaluate(() => !document.getElementById('layar-solo').hidden));
    await klik(page, 'tombol-solo-keluar');
    await tidur(400);
    await klik(page, 'tombol-yakin-keluar');
    await tidur(700);
    cek('keluar di tengah duel: dicatat menyerah, lalu kembali ke lobi', (await catatan(page, 'menyerah')).some((c) => c[1] === kode) && await terlihat(page, 'online-lobi') && await page.evaluate(() => document.getElementById('dialog-keluar').hidden || document.getElementById('dialog-keluar').classList.contains('pergi')));
    await page.close();

    // Lawan keluar di tengah duel.
    page = await buka();
    const kode3 = await mulaiSebagaiTuan(page);
    await palsu(page, (k) => window.__palsu.ubah(k, (room, t) => { room.pemain['uid-lawan'].menyerah = t; }), kode3);
    await adaHasil(page);
    const h = await hasilTampil(page);
    cek('lawan keluar di tengah duel: pemain ini menang', h.judul === 'Kamu menang!' && h.detail === 'Budi keluar dari duel.', JSON.stringify(h));

    // Main lagi atas ajakan sendiri.
    await palsu(page, () => { window.__palsu.kodeBerikut.push('RSTUV'); });
    await klik(page, 'tombol-level-lanjut');
    await tunggu(page, () => !document.getElementById('online-tunggu').hidden && /Menunggu lawan/.test(document.getElementById('status-tunggu').textContent));
    const lagi = await page.evaluate((k) => ({
      kode: document.getElementById('kode-room').textContent,
      ajakan: window.__palsu.rooms[k].lanjut,
      kesulitan: window.__palsu.rooms.RSTUV.kesulitan,
      toast: (document.querySelector('.toast:not(.keluar) .toast-teks') || {}).textContent || null,
    }), kode3);
    cek('main lagi: membuat room baru dengan tingkat yang sama dan mengabari lawan', lagi.kode === 'RSTUV' && lagi.ajakan === 'RSTUV' && lagi.kesulitan === 'medium', JSON.stringify(lagi));
    cek('main lagi: ajakan sendiri tidak disangka ajakan lawan', lagi.toast !== 'Budi mengajak main lagi', String(lagi.toast));
    await page.close();

    // Keduanya menekan Main lagi bersamaan: yang kalah cepat ikut room lawan.
    page = await buka();
    const kode4 = await mulaiSebagaiTuan(page);
    await palsu(page, (k) => window.__palsu.ubah(k, (room, t) => { room.pemain['uid-lawan'].menyerah = t; }), kode4);
    await adaHasil(page);
    await palsu(page, (k) => {
      const S = window.__palsu;
      S.kodeBerikut.push('WXYZ2');
      S.roomLawan('TUVWX', 'medium', 'Budi');
      // Ajakan lawan tiba di server lebih dulu, tetapi belum sampai ke layar pemain ini.
      S.rooms[k].lanjut = 'TUVWX';
    }, kode4);
    await klik(page, 'tombol-level-lanjut');
    await tunggu(page, () => !document.getElementById('online-tunggu').hidden && /memulai duel/.test(document.getElementById('status-tunggu').textContent));
    const balapan = await page.evaluate(() => ({
      judul: document.getElementById('judul-tunggu').textContent,
      tamu: window.__palsu.rooms.TUVWX.tamu,
      sisa: !!window.__palsu.rooms.WXYZ2,
    }));
    cek('main lagi bersamaan: ikut room lawan, dan room sendiri dibuang', balapan.judul === 'Room TUVWX' && balapan.tamu === SAYA && !balapan.sisa, JSON.stringify(balapan));
    await page.close();
  }

  /* Tab tertidur selama duel: hasil tetap tampil tanpa papan */
  {
    const page = await buka();
    await palsu(page, () => window.__palsu.roomLawan('FGHJK', 'easy', 'Budi'));
    await keLobi(page);
    await isiKode(page, 'FGHJK');
    await klik(page, 'tombol-gabung');
    await tunggu(page, () => /memulai duel/.test(document.getElementById('status-tunggu').textContent));
    await palsu(page, () => window.__palsu.ubah('FGHJK', (room, t) => {
      const puzzleRoom = DuelOnline.ambilPuzzle(DataLevel, room);
      room.mulaiPada = t - 60000;
      room.jawaban = { 'uid-lawan': { papan: DuelOnline.solusi(puzzleRoom).slice(), pada: t - 1000 } };
    }));
    await adaHasil(page);
    const h = await hasilTampil(page);
    cek('hasil tetap tampil walau papan belum sempat dibuka', h.judul === 'Kamu kalah' && h.detail === 'Budi mengunci jawaban benar lebih dulu.', JSON.stringify(h));
    await klik(page, 'tombol-level-peta');
    await tidur(600);
    cek('keluar dari hasil tanpa papan kembali ke lobi', await terlihat(page, 'online-lobi'));
    await page.close();
  }

  /* Memuat ulang halaman di tengah duel, lalu masuk lagi lewat kode */
  {
    const page = await buka();
    await palsu(page, () => {
      const S = window.__palsu;
      S.roomLawan('FGHJK', 'medium', 'Budi');
      S.ubah('FGHJK', (room, t) => {
        room.tamu = S.uid;
        room.pemain[S.uid] = { nama: 'Bima', tersambung: false, putusPada: t - 5000 };
        room.mulaiPada = t - 60000;
      });
    });
    await keLobi(page);
    await isiKode(page, 'FGHJK');
    await klik(page, 'tombol-gabung');
    const lanjut = await tunggu(page, () => !document.getElementById('layar-solo').hidden && document.querySelectorAll('.slot').length === 9);
    await tidur(600);
    const judul = await teksDi(page, 'judul-level');
    cek('masuk lagi ke duel yang sedang berjalan: papan tampil dengan sisa waktu', lanjut && /^Duel · (4:0\d|3:5\d)$/.test(judul), judul);
    cek('masuk lagi: kehadiran dipasang lagi', (await catatan(page, 'hadir')).some((c) => c[1] === 'FGHJK'));
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
    await keLobi(page, 'Abcdefghijklmnop');
    await page.screenshot({ path: path.join(FOTO, `online-lobi-${u.nama}.png`) });
    const lobi = await luar('#online-lobi *');
    cek(`${u.nama}: lobi duel online muat`, lobi.length === 0, lobi.slice(0, 3).join(' | '));
    await palsu(page, () => { window.__palsu.kodeBerikut.push('WWWWW'); });
    await klik(page, 'tombol-buat-room');
    await tunggu(page, () => /Menunggu lawan/.test(document.getElementById('status-tunggu').textContent));
    await tidur(300);
    await page.screenshot({ path: path.join(FOTO, `online-tunggu-${u.nama}.png`) });
    const ruang = await luar('#online-tunggu *');
    const tinggi = await page.evaluate((t) => [...document.querySelectorAll('#online-tunggu > :not([hidden])')].every((e) => e.getBoundingClientRect().bottom <= t + 0.5), u.height);
    cek(`${u.nama}: ruang tunggu muat tanpa digulir`, ruang.length === 0 && tinggi, ruang.slice(0, 3).join(' | ') + (tinggi ? '' : ' terlalu tinggi'));
    await palsu(page, () => {
      window.__palsu.majuHitung = 3700;
      window.__palsu.ubah('WWWWW', (room) => {
        room.tamu = 'uid-lawan';
        room.pemain['uid-lawan'] = { nama: 'Wwwwwwwwwwwwwwww', tersambung: true };
      });
    });
    await tunggu(page, () => !document.getElementById('layar-solo').hidden && document.querySelectorAll('.slot').length === 9);
    await tidur(900);
    const papanLuar = await page.evaluate((w, t) => [...document.querySelectorAll('.slot, .sedia, #tombol-kunci, .bar-solo .ikon, #judul-level, #pesan-solo')].filter((e) => {
      if (e.hidden) return false;
      const q = e.getBoundingClientRect();
      return q.left < -0.5 || q.top < -0.5 || q.right > w + 0.5 || q.bottom > t + 0.5;
    }).map((e) => e.id || e.className), u.width, u.height);
    await page.screenshot({ path: path.join(FOTO, `online-papan-${u.nama}.png`) });
    cek(`${u.nama}: papan duel muat dengan nama lawan 16 karakter`, papanLuar.length === 0, papanLuar.slice(0, 4).join());
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
