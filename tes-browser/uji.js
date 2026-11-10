// Uji browser SETDOKU dengan pointer sungguhan di Edge. Jalankan: npm run uji:browser
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const EDGE = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
// Uji memakai alat uji main, jadi alamatnya memakai ?uji. Uji rilis memakai alamat biasa.
const HALAMAN_BIASA = pathToFileURL(path.join(__dirname, '..', 'public', 'index.html')).href;
const HALAMAN = HALAMAN_BIASA + '?uji';
const FOTO = path.join(__dirname, 'foto');
fs.mkdirSync(FOTO, { recursive: true });

const hasil = [];
function cek(nama, lolos, info = '') {
  hasil.push({ nama, lolos });
  console.log(`${lolos ? 'LOLOS' : 'GAGAL'}  ${nama}${info ? '  -> ' + info : ''}`);
}
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

// bukaSemua: Practice semua level terbuka. Uji Tantangan dan peta mematikannya.
async function bukaHalaman(browser, viewport, galat, { bukaSemua = true } = {}) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  page.on('pageerror', (e) => galat.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') galat.push('console: ' + m.text()); });
  await page.goto(HALAMAN);
  await page.evaluate((buka) => {
    localStorage.clear();
    if (buka) localStorage.setItem('setdoku-uji-buka-semua', '1');
  }, bukaSemua);
  await page.reload();
  await tidur(700);
  return page;
}

const tengah = (page, sel, n = 0) => page.evaluate((s, i) => {
  const r = document.querySelectorAll(s)[i].getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
}, sel, n);

const papan = (page) => page.evaluate(() => [...document.querySelectorAll('.slot')].map((b) => b.getAttribute('aria-label').split(', ').slice(1).join(', ')));
const namaKartu = (page, id) => page.evaluate((i) => {
  const k = Puzzle.DEK[i];
  return `${k.jumlah + 1} ${['bintang', 'bulan sabit', 'planet'][k.bentuk]} ${['emas', 'biru es', 'koral'][k.warna]} ${['penuh', 'garis tepi', 'bertitik'][k.isian]}`;
}, id);
const tenang = (page) => page.waitForFunction(() => !document.querySelector('#lapisan-seret .hantu') && !document.querySelector('.menunggu'), { timeout: 5000 });

async function seret(page, dari, ke, { langkah = 12, tahanMs = 0 } = {}) {
  await page.mouse.move(dari.x, dari.y);
  await page.mouse.down();
  await page.mouse.move(ke.x, ke.y, { steps: langkah });
  if (tahanMs) await tidur(tahanMs);
  await page.mouse.up();
}

async function keLevel(page, nomor) {
  await page.evaluate(() => document.getElementById('tombol-solo').click());
  await tidur(450);
  await page.evaluate((n) => { document.querySelectorAll('.tombol-level')[n - 1].click(); document.getElementById('tombol-mode-practice').click(); }, nomor);
  await tidur(800);
}

async function ujiSeret(browser, galat) {
  console.log('\n== Seret dan ketuk (mouse, 1280x800) ==');
  const page = await bukaHalaman(browser, { width: 1280, height: 800 }, galat);
  await page.screenshot({ path: path.join(FOTO, 'menu.png') });
  await keLevel(page, 5);
  await page.screenshot({ path: path.join(FOTO, 'solo-awal.png') });

  const level = await page.evaluate(() => DataLevel[4].practice);
  const kosong = level.papan.flatMap((k, i) => (k === null ? [i] : []));
  const [a, b, c] = kosong;
  const klu = level.papan.findIndex((k) => k !== null);
  const [idA, idB] = level.tersedia;
  const [nA, nB] = [await namaKartu(page, idA), await namaKartu(page, idB)];

  // Kartu tersedia ke slot kosong, sambil tertahan untuk melihat sorot.
  const dari = await tengah(page, '.sedia', 0);
  const keA = await tengah(page, '.slot', a);
  await page.mouse.move(dari.x, dari.y);
  await page.mouse.down();
  await page.mouse.move(keA.x, keA.y, { steps: 14 });
  await tidur(250);
  const saatSeret = await page.evaluate(() => ({
    hantu: document.querySelectorAll('.hantu.diseret').length,
    tujuan: document.querySelectorAll('.slot.tujuan').length,
    samar: document.querySelectorAll('.slot .samar').length,
    asal: document.querySelectorAll('.sedia.asal').length,
  }));
  await page.screenshot({ path: path.join(FOTO, 'solo-seret.png') });
  cek('selama seret: ada hantu, slot tujuan menyala, bayangan samar, asal redup',
    saatSeret.hantu === 1 && saatSeret.tujuan === 1 && saatSeret.samar === 1 && saatSeret.asal === 1, JSON.stringify(saatSeret));
  await page.mouse.up();
  await tenang(page);
  cek('kartu tersedia -> slot kosong', (await papan(page))[a] === nA);
  const bersih = await page.evaluate(() => ({
    samar: document.querySelectorAll('.samar').length,
    tujuan: document.querySelectorAll('.tujuan').length,
    asal: document.querySelectorAll('.asal').length,
  }));
  cek('setelah mendarat tidak ada sisa sorot', bersih.samar + bersih.tujuan + bersih.asal === 0, JSON.stringify(bersih));
  const terpakai = await page.evaluate(() => document.querySelectorAll('.sedia')[0].classList.contains('terpakai'));
  cek('kartu asal hilang dari kartu tersedia', terpakai);

  // Slot ke slot kosong.
  await seret(page, await tengah(page, '.slot', a), await tengah(page, '.slot', b));
  await tenang(page);
  let isi = await papan(page);
  cek('slot -> slot kosong memindahkan kartu', isi[b] === nA && isi[a] === 'kosong');

  // Kartu tersedia ke slot terisi: mengganti, kartu lama kembali.
  await seret(page, await tengah(page, '.sedia', 1), await tengah(page, '.slot', b));
  await tenang(page);
  isi = await papan(page);
  const kembali = await page.evaluate(() => !document.querySelectorAll('.sedia')[0].classList.contains('terpakai'));
  cek('kartu tersedia -> slot terisi mengganti, kartu lama kembali', isi[b] === nB && kembali);

  // Tukar dua kartu di papan.
  await seret(page, await tengah(page, '.sedia', 0), await tengah(page, '.slot', a));
  await tenang(page);
  await seret(page, await tengah(page, '.slot', a), await tengah(page, '.slot', b));
  await tenang(page);
  isi = await papan(page);
  cek('slot -> slot terisi menukar kedua kartu', isi[a] === nB && isi[b] === nA);

  // Keluar papan: kembali ke kartu tersedia.
  const r = await tengah(page, '.slot', b);
  await seret(page, r, { x: 1230, y: 120 }, { tahanMs: 120 });
  await tenang(page);
  isi = await papan(page);
  cek('slot -> keluar papan mengembalikan kartu', isi[b] === 'kosong');

  // Dilepas di luar papan: kartu tersedia kembali ke tempatnya.
  await seret(page, await tengah(page, '.sedia', 0), { x: 1230, y: 120 }, { tahanMs: 120 });
  await tenang(page);
  isi = await papan(page);
  cek('kartu tersedia dilepas di luar papan tidak mengubah papan', !isi.includes(nA));

  // Petunjuk tidak bisa diseret.
  const sebelum = await papan(page);
  await seret(page, await tengah(page, '.slot', klu), await tengah(page, '.slot', b), { langkah: 6 });
  const gembok = await page.evaluate(() => document.querySelectorAll('.gembok').length);
  await page.screenshot({ path: path.join(FOTO, 'solo-gembok.png') });
  await tidur(800);
  cek('petunjuk menolak seret dan menampilkan gembok', gembok === 1 && JSON.stringify(await papan(page)) === JSON.stringify(sebelum));
  const pesanPetunjuk = await page.$eval('#pesan-solo', (e) => e.textContent);
  cek('pesan petunjuk muncul', pesanPetunjuk.includes('petunjuk'), pesanPetunjuk);

  // Lempar: dilepas dengan cepat sebelum sampai ke slot.
  await page.evaluate(() => document.getElementById('tombol-kosongkan').click());
  await tenang(page);
  const asalLempar = await tengah(page, '.sedia', 0);
  const sasaranLempar = await tengah(page, '.slot', b);
  await page.mouse.move(asalLempar.x, asalLempar.y);
  await page.mouse.down();
  // Berhenti di sekitar 70% jalan, lalu dilepas tanpa jeda.
  const titikLepas = { x: asalLempar.x + (sasaranLempar.x - asalLempar.x) * 0.7, y: asalLempar.y + (sasaranLempar.y - asalLempar.y) * 0.7 };
  await page.mouse.move(titikLepas.x, titikLepas.y, { steps: 4 });
  await page.mouse.up();
  await tenang(page);
  isi = await papan(page);
  cek('lempar cepat ke arah papan mengisi slot', isi.includes(nA), JSON.stringify(isi.map((x, i) => (x === nA ? i : null)).filter((x) => x !== null)));

  // Tangkap kartu yang sedang terbang.
  await page.evaluate(() => document.getElementById('tombol-kosongkan').click());
  await tenang(page);
  const asalT = await tengah(page, '.sedia', 0);
  const keT = await tengah(page, '.slot', a);
  await seret(page, asalT, keT, { langkah: 8 });
  // Langsung ditekan lagi saat masih terbang.
  const terbangT = await page.evaluate(() => {
    const h = document.querySelector('#lapisan-seret .hantu');
    if (!h) return null;
    const q = h.getBoundingClientRect();
    return { x: q.left + q.width / 2, y: q.top + q.height / 2 };
  });
  if (terbangT) {
    const keB = await tengah(page, '.slot', b);
    await page.mouse.move(terbangT.x, terbangT.y);
    await page.mouse.down();
    await page.mouse.move(keB.x, keB.y, { steps: 8 });
    await tidur(120);
    const sedang = await page.evaluate(() => document.querySelectorAll('.hantu.diseret').length);
    await page.mouse.up();
    await tenang(page);
    isi = await papan(page);
    cek('kartu terbang bisa ditangkap dan dipindah', sedang === 1 && isi[b] === nA && isi[a] === 'kosong', `seret=${sedang}`);
  } else {
    cek('kartu terbang bisa ditangkap dan dipindah', false, 'hantu sudah mendarat sebelum sempat ditekan');
  }

  // Ketuk lalu ketuk.
  await page.evaluate(() => document.getElementById('tombol-kosongkan').click());
  await tenang(page);
  const sedia0 = await tengah(page, '.sedia', 0);
  await page.mouse.click(sedia0.x, sedia0.y);
  const terpilih = await page.evaluate(() => document.querySelectorAll('.sedia.dipilih').length);
  const slotA = await tengah(page, '.slot', a);
  await page.mouse.click(slotA.x, slotA.y);
  await tenang(page);
  isi = await papan(page);
  cek('ketuk kartu lalu ketuk slot', terpilih === 1 && isi[a] === nA);
  await page.mouse.click(slotA.x, slotA.y);
  await tenang(page);
  isi = await papan(page);
  cek('ketuk kartu di papan mengambilnya lagi', isi[a] === 'kosong');

  // Keyboard.
  await page.evaluate(() => document.querySelectorAll('.sedia')[1].focus());
  await page.keyboard.press('Enter');
  const pilihanKeyboard = await page.evaluate(() => document.querySelectorAll('.sedia.dipilih').length);
  await page.evaluate((i) => document.querySelectorAll('.slot')[i].focus(), a);
  await page.keyboard.press('Enter');
  await tenang(page);
  isi = await papan(page);
  cek('keyboard Enter memilih dan menaruh kartu', pilihanKeyboard === 1 && isi[a] === nB);
  await page.evaluate(() => document.getElementById('tombol-kosongkan').click());
  await tenang(page);

  // Kunci saat belum penuh.
  const kunci = await tengah(page, '#tombol-kunci');
  await page.mouse.click(kunci.x, kunci.y);
  const pesanKunci = await page.$eval('#pesan-solo', (e) => e.textContent);
  const kedip = await page.evaluate(() => document.querySelectorAll('.slot.kedip').length);
  cek('kunci saat papan belum penuh memberi pesan dan slot kosong berkedip', pesanKunci.includes('Isi semua') && kedip > 0, `${pesanKunci}, kedip=${kedip}`);

  // Kunci salah: susun solusi lalu tukar dua kartu.
  const solusi = await page.evaluate(() => Puzzle.cariSolusi(DataLevel[4].practice)[0]);
  const urutan = await page.evaluate(() => DataLevel[4].practice.tersedia);
  for (const i of kosong) {
    const n = urutan.indexOf(solusi[i]);
    await seret(page, await tengah(page, '.sedia', n), await tengah(page, '.slot', i), { langkah: 6 });
    await tenang(page);
  }
  await seret(page, await tengah(page, '.slot', a), await tengah(page, '.slot', b), { langkah: 6 });
  await tenang(page);
  await page.mouse.click(kunci.x, kunci.y);
  await tidur(200);
  const salah = await page.evaluate(() => ({
    pesan: document.getElementById('pesan-solo').textContent,
    garis: document.querySelectorAll('.garis-sorot').length,
    gagal: document.querySelectorAll('.slot.gagal').length,
  }));
  await page.screenshot({ path: path.join(FOTO, 'solo-salah.png') });
  cek('kunci salah: pesan, garis merah, slot gagal', salah.pesan.startsWith('Belum rasi') && salah.garis > 0 && salah.gagal > 0, JSON.stringify(salah));

  // Membetulkan: garis merah hilang, lalu kunci benar.
  await seret(page, await tengah(page, '.slot', a), await tengah(page, '.slot', b), { langkah: 6 });
  await tenang(page);
  const garisSisa = await page.evaluate(() => document.querySelectorAll('.garis-sorot').length);
  cek('garis merah hilang saat papan berubah', garisSisa === 0);
  await page.mouse.click(kunci.x, kunci.y);
  await tidur(620);
  await page.screenshot({ path: path.join(FOTO, 'solo-benar.png') });
  const garisBenar = await page.evaluate(() => document.querySelectorAll('.garis-sorot').length);
  cek('kunci benar: keenam garis menyala', garisBenar === 6, `garis=${garisBenar}`);
  await page.waitForSelector('#layar-hasil:not([hidden])', { timeout: 4000 });
  await tidur(1000);
  await page.screenshot({ path: path.join(FOTO, 'solo-hasil.png') });
  const hasilLevel = await page.evaluate(() => ({
    judul: document.getElementById('judul-hasil').textContent,
    detail: document.getElementById('detail-hasil').textContent,
    uji: JSON.parse(localStorage.getItem('setdoku-uji')),
  }));
  cek('layar hasil dan data uji main tercatat dengan benar',
    hasilLevel.judul === 'Level 5 selesai!' && /kunci salah 1 kali/.test(hasilLevel.detail) && hasilLevel.uji.length === 1 && hasilLevel.uji[0].kunciSalah === 1,
    hasilLevel.detail);

  // Kembali ke peta.
  await page.evaluate(() => document.getElementById('tombol-level-peta').click());
  await tidur(800);
  const peta = await page.evaluate(() => ({
    solo: document.getElementById('layar-solo').hidden,
    peta: document.getElementById('layar-peta').hidden,
    selesai: document.querySelectorAll('.tombol-level.selesai').length,
    hasil: document.getElementById('layar-hasil').hidden,
  }));
  cek('kembali ke peta: level ditandai selesai', peta.solo && !peta.peta && peta.selesai === 1 && peta.hasil, JSON.stringify(peta));
  await page.screenshot({ path: path.join(FOTO, 'peta.png') });
  await page.close();
}

const SIFAT_DARI_LABEL = (label) => {
  const m = label.match(/^(\d) (bintang|bulan sabit|planet) (emas|biru es|koral) (penuh|garis tepi|bertitik)/);
  return {
    jumlah: Number(m[1]) - 1,
    bentuk: ['bintang', 'bulan sabit', 'planet'].indexOf(m[2]),
    warna: ['emas', 'biru es', 'koral'].indexOf(m[3]),
    isian: ['penuh', 'garis tepi', 'bertitik'].indexOf(m[4]),
  };
};

async function cariRasi(page, salah = false) {
  const label = await page.evaluate(() => [...document.querySelectorAll('.kartu')].map((b) => b.getAttribute('aria-label')));
  const k = label.map(SIFAT_DARI_LABEL);
  const rasi = (a, b, c) => ['bentuk', 'warna', 'jumlah', 'isian'].every((s) => (a[s] + b[s] + c[s]) % 3 === 0);
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) for (let n = j + 1; n < 12; n++) {
    if (rasi(k[i], k[j], k[n]) !== salah) return [i, j, n];
  }
  return null;
}

async function ujiDuel(browser, galat) {
  console.log('\n== Duel (potret 390x844) ==');
  const page = await bukaHalaman(browser, { width: 390, height: 844, hasTouch: false }, galat);
  await page.evaluate(() => document.getElementById('tombol-mulai').click());
  await tidur(900);
  await page.screenshot({ path: path.join(FOTO, 'duel-awal.png') });
  const jumlah = await page.evaluate(() => document.querySelectorAll('.kartu svg').length);
  cek('duel: 12 kartu dibagikan', jumlah === 12);

  // Tukar oleh kedua pemain.
  const gambarAwal = await page.evaluate(() => [...document.querySelectorAll('.kartu')].map((b) => b.innerHTML));
  await page.evaluate(() => document.querySelectorAll('.tombol-tukar').forEach((b) => b.click()));
  await tidur(120);
  await page.screenshot({ path: path.join(FOTO, 'duel-balik.png') });
  await tidur(780);
  const gambarTukar = await page.evaluate(() => [...document.querySelectorAll('.kartu')].map((b) => ({ html: b.innerHTML, skala: b.style.scale })));
  const beda = gambarAwal.filter((x, i) => x !== gambarTukar[i].html).length;
  cek('duel: tukar bersama mengganti gambar kartu dalam 900 ms', beda >= 3, `berubah=${beda}`);

  // Benar untuk pemain 1.
  await page.keyboard.press('a');
  await tidur(120);
  const tandaAktif = await page.evaluate(() => document.querySelector('.p1').classList.contains('aktif'));
  cek('duel: panel pemain aktif menyala', tandaAktif);
  const rasi = await cariRasi(page);
  for (const i of rasi.slice(0, 2)) await page.evaluate((n) => document.querySelectorAll('.kartu')[n].click(), i);
  await tidur(160);
  await page.screenshot({ path: path.join(FOTO, 'duel-pilih.png') });
  await page.evaluate((n) => document.querySelectorAll('.kartu')[n].click(), rasi[2]);
  await tidur(60);
  const skorAwal = await page.evaluate(() => document.querySelectorAll('.p1 .bintang-skor svg.isi').length);
  await tidur(560);
  await page.screenshot({ path: path.join(FOTO, 'duel-terbang.png') });
  await tidur(520);
  const skorTiba = await page.evaluate(() => document.querySelectorAll('.p1 .bintang-skor svg.isi').length);
  cek('duel: bintang baru terisi saat kartu tiba', skorAwal === 0 && skorTiba === 1, `awal=${skorAwal}, tiba=${skorTiba}`);
  await tidur(700);
  const dibagi = await page.evaluate(() => ({
    sisa: document.querySelectorAll('#lapisan-seret .hantu').length,
    tunggu: document.querySelectorAll('.kartu.menunggu').length,
    fase: document.querySelector('.p1 .pesan').textContent,
  }));
  cek('duel: kartu baru dibagikan dan tidak ada sisa', dibagi.sisa === 0 && dibagi.tunggu === 0, JSON.stringify(dibagi));

  // Salah untuk pemain 2: poin ke pemain 1.
  await page.keyboard.press('l');
  await tidur(100);
  const salah = await cariRasi(page, true);
  for (const i of salah) await page.evaluate((n) => document.querySelectorAll('.kartu')[n].click(), i);
  await tidur(140);
  await page.screenshot({ path: path.join(FOTO, 'duel-salah.png') });
  await tidur(2300);
  const skorSalah = await page.evaluate(() => document.querySelectorAll('.p1 .bintang-skor svg.isi').length);
  cek('duel: salah memberi poin ke lawan', skorSalah === 2, `skor=${skorSalah}`);

  // Waktu habis untuk pemain 2.
  await page.keyboard.press('l');
  await tidur(5400);
  const gawat = await page.evaluate(() => document.getElementById('timer').classList.contains('gawat'));
  const lebarTimer = await page.evaluate(() => document.querySelector('#timer i').style.transform);
  cek('duel: bar waktu gawat di bawah 3 detik', gawat, lebarTimer);
  await tidur(5100);
  const skorWaktu = await page.evaluate(() => document.querySelectorAll('.p1 .bintang-skor svg.isi').length);
  cek('duel: waktu habis memberi poin ke lawan', skorWaktu === 3, `skor=${skorWaktu}`);

  // Sampai menang.
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('a');
    await tidur(80);
    const r = await cariRasi(page);
    for (const n of r) await page.evaluate((x) => document.querySelectorAll('.kartu')[x].click(), n);
    await tidur(1800);
  }
  await page.waitForSelector('#layar-menang:not([hidden])', { timeout: 3000 });
  await tidur(350);
  await page.screenshot({ path: path.join(FOTO, 'duel-menang.png') });
  const menang = await page.$eval('#judul-menang', (e) => e.textContent);
  cek('duel: pemenang muncul', menang === 'Pemain 1 menang!', menang);
  const bintangAkhir = await page.evaluate(() => document.querySelectorAll('.p1 .bintang-skor svg.isi').length);
  cek('duel: lima bintang terisi saat menang', bintangAkhir === 5, `bintang=${bintangAkhir}`);

  // Main lagi.
  await tidur(300);
  await page.evaluate(() => document.getElementById('tombol-ulang').click());
  await tidur(900);
  const ulang = await page.evaluate(() => ({
    bintang: document.querySelectorAll('.bintang-skor svg.isi').length,
    tertutup: document.getElementById('layar-menang').hidden,
    kartu: document.querySelectorAll('.kartu svg').length,
  }));
  cek('duel: main lagi mereset', ulang.bintang === 0 && ulang.tertutup && ulang.kartu === 12, JSON.stringify(ulang));

  // Dialog keluar.
  await page.evaluate(() => document.getElementById('tombol-keluar').click());
  await tidur(450);
  await page.screenshot({ path: path.join(FOTO, 'duel-dialog.png') });
  const buka = await page.evaluate(() => !document.getElementById('dialog-keluar').hidden);
  await page.keyboard.press('Escape');
  await tidur(700);
  const tutup = await page.evaluate(() => document.getElementById('dialog-keluar').hidden);
  cek('dialog keluar terbuka dan Esc menutup', buka && tutup);
  await page.evaluate(() => document.getElementById('tombol-keluar').click());
  await tidur(300);
  await page.evaluate(() => document.getElementById('tombol-yakin-keluar').click());
  await page.waitForFunction(() => document.getElementById('layar-main').hidden, { timeout: 3000 }).catch(() => {});
  const diMenu = await page.evaluate(() => ({
    menu: !document.getElementById('layar-menu').hidden,
    main: document.getElementById('layar-main').hidden,
    dialog: document.getElementById('dialog-keluar').hidden,
  }));
  cek('keluar kembali ke menu', diMenu.menu && diMenu.main && diMenu.dialog, JSON.stringify(diMenu));
  await page.close();
}

async function ujiTombol(browser, galat) {
  console.log('== Tombol dan tepi layar ==');
  const page = await bukaHalaman(browser, { width: 1280, height: 800 }, galat);
  await tidur(500);
  const b = await tengah(page, '#tombol-cara');
  const transformasi = () => page.$eval('#tombol-cara', (e) => getComputedStyle(e).transform);
  const awal = await transformasi();
  await page.mouse.move(b.x, b.y);
  await page.mouse.down();
  const langsung = await page.$eval('#tombol-cara', (e) => e.classList.contains('ditekan'));
  await tidur(90);
  const turun = await transformasi();
  cek('tombol: tekanan terasa di pointerdown, sebelum dilepas', langsung && turun !== awal, `${awal} -> ${turun}`);

  // Bergeser menjauh: tekanan lepas dan klik batal. Kembali: tekanan muncul lagi.
  await page.mouse.move(b.x, b.y + 200, { steps: 4 });
  const jauh = await page.$eval('#tombol-cara', (e) => e.classList.contains('ditekan'));
  await page.mouse.move(b.x, b.y, { steps: 4 });
  const balik = await page.$eval('#tombol-cara', (e) => e.classList.contains('ditekan'));
  cek('tombol: geser menjauh melepas tekanan, kembali menekan lagi', !jauh && balik, `jauh=${jauh}, balik=${balik}`);
  await page.mouse.move(b.x, b.y + 200, { steps: 4 });
  await page.mouse.up();
  await tidur(250);
  const masihDiMenu = await page.evaluate(() => document.getElementById('layar-cara').hidden);
  cek('tombol: dilepas di luar tombol tidak menjalankan klik', masihDiMenu);

  await page.mouse.move(b.x, b.y);
  await page.mouse.down();
  await page.mouse.up();
  await tidur(120);
  const terbuka = await page.evaluate(() => !document.getElementById('layar-cara').hidden);
  cek('tombol: ketuk biasa membuka layar', terbuka);
  await tidur(700);
  await page.evaluate(() => document.getElementById('tombol-tutup-cara').click());
  await tidur(700);

  // Input tidak dikunci: layar baru bisa langsung ditekan saat transisi berjalan.
  await page.evaluate(() => document.getElementById('tombol-solo').click());
  await tidur(70);
  const pergi = await page.evaluate(() => ({
    menuPergi: document.getElementById('layar-menu').classList.contains('pergi'),
    petaAda: !document.getElementById('layar-peta').hidden,
    bisaTekan: getComputedStyle(document.getElementById('layar-peta')).pointerEvents !== 'none',
  }));
  cek('transisi: layar baru langsung bisa disentuh', pergi.menuPergi && pergi.petaAda && pergi.bisaTekan, JSON.stringify(pergi));
  await page.evaluate(() => { document.querySelectorAll('.tombol-level')[4].click(); document.getElementById('tombol-mode-practice').click(); });
  await tidur(900);

  // Karet di tepi layar: kartu tertinggal dari jari saat melewati batas.
  const dari = await tengah(page, '.sedia', 0);
  await page.mouse.move(dari.x, dari.y);
  await page.mouse.down();
  await page.mouse.move(1270, dari.y, { steps: 6 });
  await tidur(250);
  const dekatTepi = await tengah(page, '.hantu.diseret');
  await page.mouse.move(1700, dari.y, { steps: 6 });
  await tidur(250);
  const lewatTepi = await tengah(page, '.hantu.diseret');
  await page.mouse.move(2600, dari.y, { steps: 6 });
  await tidur(250);
  const jauhLewat = await tengah(page, '.hantu.diseret');
  await page.mouse.up();
  await tenang(page);
  const geser1 = lewatTepi.x - dekatTepi.x;
  const geser2 = jauhLewat.x - lewatTepi.x;
  cek('karet: kartu tertinggal dari jari dan makin tertahan', geser1 > 0 && geser1 < 430 && geser2 < geser1 * 1.2 && geser2 < 900, `jari +430 -> kartu +${geser1.toFixed(0)}, jari +900 -> kartu +${geser2.toFixed(0)}`);
  await page.close();
}

async function selesaikanLevel(page, nomor) {
  const { solusi, tersedia, papanAwal } = await page.evaluate((i) => ({
    solusi: Puzzle.cariSolusi(DataLevel[i].practice)[0],
    tersedia: DataLevel[i].practice.tersedia,
    papanAwal: DataLevel[i].practice.papan,
  }), nomor - 1);
  for (let i = 0; i < 9; i++) {
    if (papanAwal[i] !== null) continue;
    await seret(page, await tengah(page, '.sedia', tersedia.indexOf(solusi[i])), await tengah(page, '.slot', i), { langkah: 4 });
    await tenang(page);
  }
  await page.evaluate(() => document.getElementById('tombol-kunci').click());
  await page.waitForSelector('#layar-hasil:not([hidden])', { timeout: 4000 });
  await tidur(400);
  await page.evaluate(() => document.getElementById('tombol-level-peta').click());
  await tidur(800);
}

const tandaPeta = (page) => page.evaluate(() => ({
  selesai: [...document.querySelectorAll('.tombol-level.selesai')].map((b) => Number(b.textContent)),
  baru: document.querySelectorAll('.tombol-level.baru-selesai').length,
}));

async function ujiProgres(browser, galat) {
  console.log('\n== Progres terpisah dari Data uji main ==');
  const page = await bukaHalaman(browser, { width: 1024, height: 768 }, galat);
  page.on('dialog', (d) => d.accept());
  await keLevel(page, 2);
  await selesaikanLevel(page, 2);
  let tanda = await tandaPeta(page);
  cek('level selesai ditandai di peta, dengan efek baru', tanda.selesai.join() === '2' && tanda.baru === 1, JSON.stringify(tanda));

  const simpanan = await page.evaluate(() => ({
    progres: JSON.parse(localStorage.getItem('setdoku-progres')),
    uji: JSON.parse(localStorage.getItem('setdoku-uji')),
  }));
  cek('progres dan data uji tersimpan di kunci terpisah', simpanan.progres.latihan.join() === '2' && simpanan.uji.length === 1 && simpanan.progres.totalStars === 0);

  // Practice tidak boleh memberi Stars atau mengubah nyawa.
  cek('Practice tidak memberi Stars dan tidak memakai nyawa', simpanan.progres.wallet === 0 && simpanan.progres.nyawa === 5 && Object.keys(simpanan.progres.rekor).length === 0);

  await page.evaluate(() => document.getElementById('tombol-hapus-uji').click());
  await tidur(200);
  tanda = await tandaPeta(page);
  const catatan = await page.$eval('#judul-uji', (e) => e.textContent);
  cek('Hapus data uji tidak menghapus tanda selesai', tanda.selesai.join() === '2' && catatan.includes('(0 catatan)'), catatan);

  await page.reload();
  await tidur(500);
  await page.evaluate(() => document.getElementById('tombol-solo').click());
  await tidur(500);
  tanda = await tandaPeta(page);
  cek('progres bertahan setelah halaman dimuat ulang', tanda.selesai.join() === '2', JSON.stringify(tanda));

  // Mengulang level yang sudah selesai tidak memutar efek baru lagi.
  await page.evaluate(() => { document.querySelectorAll('.tombol-level')[1].click(); document.getElementById('tombol-mode-practice').click(); });
  await tidur(800);
  await selesaikanLevel(page, 2);
  tanda = await tandaPeta(page);
  const uji = await page.evaluate(() => JSON.parse(localStorage.getItem('setdoku-uji')).length);
  cek('mengulang level: tanpa efek baru, tetapi data uji tetap mencatat', tanda.baru === 0 && uji === 1, `baru=${tanda.baru}, uji=${uji}`);

  await page.evaluate(() => document.getElementById('tombol-reset-progres').click());
  await tidur(200);
  tanda = await tandaPeta(page);
  const ujiSetelahReset = await page.evaluate(() => JSON.parse(localStorage.getItem('setdoku-uji')).length);
  cek('Reset progres menghapus tanda selesai, dan data uji tetap ada', tanda.selesai.length === 0 && ujiSetelahReset === 1, `selesai=${tanda.selesai.length}, uji=${ujiSetelahReset}`);

  // Data rusak.
  await page.evaluate(() => localStorage.setItem('setdoku-progres', '{rusak'));
  await page.reload();
  await tidur(500);
  await page.evaluate(() => document.getElementById('tombol-solo').click());
  await tidur(500);
  tanda = await tandaPeta(page);
  cek('data progres rusak tidak menghentikan game', tanda.selesai.length === 0);
  await page.close();

  // Penyimpanan diblokir.
  const blokir = await browser.newPage();
  await blokir.setViewport({ width: 1024, height: 768 });
  blokir.on('pageerror', (e) => galat.push('pageerror: ' + e.message));
  await blokir.evaluateOnNewDocument(() => {
    const tolak = () => { throw new Error('penyimpanan diblokir'); };
    Storage.prototype.getItem = tolak;
    Storage.prototype.setItem = tolak;
    Storage.prototype.removeItem = tolak;
  });
  await blokir.goto(HALAMAN);
  await tidur(500);
  await keLevel(blokir, 1);
  await selesaikanLevel(blokir, 1);
  tanda = await tandaPeta(blokir);
  cek('P-07: tanpa penyimpanan, game tetap jalan dengan data di memori', tanda.selesai.join() === '1', JSON.stringify(tanda));
  await blokir.close();
}

const progresDi = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('setdoku-progres')));
const teksDi = (page, id) => page.evaluate((i) => document.getElementById(i).textContent, id);
const klik = (page, id) => page.evaluate((i) => document.getElementById(i).click(), id);
const adaHasil = (page) => page.waitForSelector('#layar-hasil:not([hidden])', { timeout: 6000 });
const detikTimer = async (page) => {
  const m = (await teksDi(page, 'judul-level')).match(/(\d+):(\d\d)$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

async function bukaPeta(page) {
  await klik(page, 'tombol-solo');
  await tidur(500);
}

async function pilihLevel(page, nomor) {
  await page.evaluate((n) => document.querySelectorAll('.tombol-level')[n - 1].click(), nomor);
  await tidur(350);
}

async function mainRanked(page, nomor) {
  await pilihLevel(page, nomor);
  await klik(page, 'tombol-mode-ranked');
  await tidur(800);
}

// tukar: dua kartu terakhir ditukar, supaya jawabannya salah.
async function isiRanked(page, nomor, { tukar = false } = {}) {
  const { solusi, tersedia, papanAwal } = await page.evaluate((i) => ({
    solusi: Puzzle.cariSolusi(DataLevel[i].ranked)[0],
    tersedia: DataLevel[i].ranked.tersedia,
    papanAwal: DataLevel[i].ranked.papan,
  }), nomor - 1);
  const kosong = papanAwal.flatMap((k, i) => (k === null ? [i] : []));
  const isi = kosong.map((i) => solusi[i]);
  if (tukar) [isi[isi.length - 1], isi[isi.length - 2]] = [isi[isi.length - 2], isi[isi.length - 1]];
  for (let n = 0; n < kosong.length; n++) {
    await seret(page, await tengah(page, '.sedia', tersedia.indexOf(isi[n])), await tengah(page, '.slot', kosong[n]), { langkah: 4 });
    await tenang(page);
  }
  return kosong;
}

async function isiProgres(page, data) {
  await page.evaluate((d) => localStorage.setItem('setdoku-progres', JSON.stringify({ versi: 1, nyawa: 5, nyawaMaks: 5, ...d })), data);
  await page.reload();
  await tidur(500);
}

const toastDi = (page) => page.evaluate(() => {
  const el = document.querySelector('.toast:not(.keluar)');
  if (!el) return null;
  const isi = el.querySelector('.toast-isi');
  const s = getComputedStyle(el);
  const i = getComputedStyle(isi);
  const t = getComputedStyle(el.querySelector('.toast-teks'));
  const kotak = isi.getBoundingClientRect();
  return {
    jenis: el.classList.contains('perayaan') ? 'perayaan' : el.classList.contains('penalti') ? 'penalti' : el.classList.contains('peringatan') ? 'peringatan' : 'info',
    teks: el.querySelector('.toast-teks').textContent,
    sub: el.querySelector('.toast-sub') ? el.querySelector('.toast-sub').textContent : null,
    opacity: Number(s.opacity),
    geser: el.style.translate,
    animasi: i.animationName,
    durasi: i.animationDuration,
    sentuh: s.pointerEvents,
    font: t.fontFamily,
    berat: Number(t.fontWeight),
    warna: t.color,
    gradasi: [t.backgroundImage, i.backgroundImage].join(' '),
    atas: kotak.top,
    bawah: kotak.bottom,
    jumlah: document.querySelectorAll('.toast:not(.keluar)').length,
  };
});

// Mencatat posisi dan keburaman teks di setiap bingkai, dari muncul sampai hilang.
const jejakToast = (page, picu) => page.evaluate((nomor) => new Promise((selesai) => {
  document.querySelectorAll('.tombol-level')[nomor].click();
  const el = document.querySelector('.toast:not(.keluar)');
  const isi = el.querySelector('.toast-isi');
  const mulai = performance.now();
  const data = [];
  const f = (t) => {
    if (!el.isConnected) {
      selesai({ lama: t - mulai, data });
      return;
    }
    data.push({ t: t - mulai, o: Number(getComputedStyle(el).opacity), y: isi.getBoundingClientRect().top });
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}), picu);

const menimpaDi = (page, selektor) => page.evaluate((daftar) => {
  const t = document.querySelector('.toast:not(.keluar) .toast-isi').getBoundingClientRect();
  return daftar.filter((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return t.left < r.right && t.right > r.left && t.top < r.bottom && t.bottom > r.top;
  });
}, selektor);

const hasilDi = (page) => page.evaluate(() => {
  const teks = (id) => {
    const el = document.getElementById(id);
    return el.hidden ? null : el.textContent;
  };
  return {
    dapat: document.querySelectorAll('#stars-hasil .dapat').length,
    kosong: document.querySelectorAll('#stars-hasil .kosong').length,
    hadiah: teks('hadiah-hasil'),
    tetap: document.getElementById('hadiah-hasil').classList.contains('tetap'),
    detail: teks('detail-hasil'),
    saran: teks('saran-hasil'),
  };
});

// Mengisi papan, menunggu sampai sisa waktu cukup kecil, lalu mengunci jawaban.
async function menangSaatSisa(page, nomor, detikMaks) {
  await isiRanked(page, nomor);
  await page.waitForFunction((m) => {
    const c = document.getElementById('judul-level').textContent.match(/(\d+):(\d\d)$/);
    return c && Number(c[1]) * 60 + Number(c[2]) <= m;
  }, { timeout: 15000, polling: 50 }, detikMaks);
  await klik(page, 'tombol-kunci');
  await adaHasil(page);
}

// Syarat selesai tahap 2 yang belum tercakup uji lain.
async function ujiNada(browser, galat) {
  console.log('== Tangga nada saat menaruh kartu ==');
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 768 });
  page.on('pageerror', (e) => galat.push('pageerror: ' + e.message));
  // Mencatat frekuensi setiap nada yang benar-benar dimainkan browser.
  await page.evaluateOnNewDocument(() => {
    window.__nada = [];
    const asli = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (...a) {
      window.__nada.push(Math.round(this.frequency.value));
      return asli.apply(this, a);
    };
  });
  await page.goto(HALAMAN);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('setdoku-uji-buka-semua', '1'); });
  await page.reload();
  await tidur(600);
  await keLevel(page, 5);
  const lv = await page.evaluate(() => ({ papan: DataLevel[4].practice.papan, tersedia: DataLevel[4].practice.tersedia, sol: Puzzle.cariSolusi(DataLevel[4].practice)[0] }));
  const kosong = lv.papan.flatMap((k, i) => (k === null ? [i] : []));
  const bunyi = async (aksi) => {
    await page.evaluate(() => { window.__nada.length = 0; });
    await aksi();
    await tenang(page);
    await tidur(60);
    return page.evaluate(() => window.__nada.slice());
  };
  // Kartu ditahan sebelum dilepas, supaya tidak terhitung lemparan ke slot lain.
  const taruh = (n, slot) => async () => seret(page, await tengah(page, '.sedia', n), await tengah(page, '.slot', slot), { langkah: 4, tahanMs: 120 });
  // Bunyi mendarat selalu berupa pasangan: nada tangga, lalu nada yang sama satu oktaf di bawahnya.
  const nadaMendarat = (b) => b.find((f, i) => Math.abs(b[i + 1] - f / 2) <= 1);
  const DO = 262;
  const DO_TINGGI = 523;
  const DO_RE_MI = [262, 294, 330, 349, 392, 440, 494, 523];
  const nadaUtama = [];
  let terakhir = [];
  for (let n = 0; n < kosong.length; n++) {
    terakhir = await bunyi(taruh(lv.tersedia.indexOf(lv.sol[kosong[n]]), kosong[n]));
    nadaUtama.push(nadaMendarat(terakhir));
  }
  cek('nada naik mengikuti tangga nada, dari do ke do tinggi', nadaUtama[0] === DO && nadaUtama[nadaUtama.length - 1] === DO_TINGGI && nadaUtama.every((f, i) => i === 0 || f > nadaUtama[i - 1]) && nadaUtama.every((f) => DO_RE_MI.includes(f)), nadaUtama.join(', '));
  cek('slot terakhir ditutup akor', terakhir.includes(660) && terakhir.includes(784), terakhir.join(', '));

  // Mengambil kartu: nadanya turun.
  const ambil = await bunyi(async () => {
    const q = await tengah(page, '.slot', kosong[kosong.length - 1]);
    await page.mouse.click(q.x, q.y);
  });
  cek('mengambil kartu memainkan nada yang lebih rendah', ambil.length >= 1 && ambil.every((f) => f < DO_TINGGI), ambil.join(', '));

  // Bunyi tidak boleh membocorkan jawaban: urutan salah terdengar sama.
  await klik(page, 'tombol-kosongkan');
  await tenang(page);
  const salah = [];
  const urutSalah = [...kosong].reverse();
  for (let n = 0; n < kosong.length; n++) {
    const b = await bunyi(taruh(lv.tersedia.indexOf(lv.sol[kosong[n]]), urutSalah[n]));
    salah.push(nadaMendarat(b));
  }
  cek('kartu di tempat salah terdengar sama, jadi tidak membocorkan jawaban', salah.join() === nadaUtama.join(), salah.join(', '));

  // Tukar dua kartu di papan: jumlah terisi tetap, nadanya tetap.
  const tukarNada = await bunyi(async () => seret(page, await tengah(page, '.slot', kosong[0]), await tengah(page, '.slot', kosong[1]), { langkah: 4, tahanMs: 120 }));
  cek('menukar kartu saat papan penuh tetap di do tinggi', nadaMendarat(tukarNada) === DO_TINGGI, tukarNada.join(', '));

  // Level dengan dua slot: tetap berakhir di do tinggi.
  await klik(page, 'tombol-solo-keluar');
  await tidur(700);
  await page.evaluate(() => { document.querySelectorAll('.tombol-level')[0].click(); document.getElementById('tombol-mode-practice').click(); });
  await tidur(900);
  const lv1 = await page.evaluate(() => ({ papan: DataLevel[0].practice.papan, tersedia: DataLevel[0].practice.tersedia, sol: Puzzle.cariSolusi(DataLevel[0].practice)[0] }));
  const k1 = lv1.papan.flatMap((k, i) => (k === null ? [i] : []));
  const dua = [];
  for (const slot of k1) {
    const b = await bunyi(taruh(lv1.tersedia.indexOf(lv1.sol[slot]), slot));
    dua.push(nadaMendarat(b));
  }
  cek('level pendek juga berakhir di do tinggi', dua.join() === `${DO},${DO_TINGGI}`, dua.join(', '));

  // Suara dimatikan: tidak ada nada.
  await klik(page, 'tombol-kosongkan');
  await tenang(page);
  await page.evaluate(() => document.querySelector('#layar-solo .tombol-suara').click());
  const bisu = await bunyi(taruh(lv1.tersedia.indexOf(lv1.sol[k1[0]]), k1[0]));
  cek('suara dimatikan: tidak ada nada', bisu.length === 0, bisu.join(', '));
  await page.close();
}

async function ujiKlikDuel(browser, galat) {
  console.log('== Ketuk kartu sebelum RASI! ==');
  const page = await bukaHalaman(browser, { width: 390, height: 844 }, galat);
  await klik(page, 'tombol-mulai');
  await tidur(1000);
  const kartu = await tengah(page, '.kartu', 5);
  await page.mouse.move(kartu.x, kartu.y);
  await page.mouse.down();
  const ditekan = await page.$eval('.kartu:nth-child(6)', (e) => e.classList.contains('ditekan'));
  await page.mouse.up();
  await tidur(60);
  const sesudah = await page.evaluate(() => ({
    geser: document.querySelectorAll('.kartu')[5].style.translate,
    dipilih: document.querySelectorAll('.kartu.dipilih').length,
    pesan: [...document.querySelectorAll('.pesan')].map((p) => p.textContent),
    ajak: document.querySelectorAll('.tombol-rebut.ajak').length,
    rasi: [...document.querySelectorAll('.tombol-rebut')].every((b) => !b.disabled),
  }));
  await page.screenshot({ path: path.join(FOTO, 'duel-ajak.png') });
  cek('kartu langsung bereaksi saat ditekan', ditekan);
  cek('kartu bergoyang, tanpa ikut terpilih', sesudah.geser !== '' && sesudah.dipilih === 0, sesudah.geser);
  cek('kedua pemain diajak menekan RASI!', sesudah.pesan.every((x) => x === 'Tekan RASI! dulu') && sesudah.ajak === 2 && sesudah.rasi, JSON.stringify(sesudah.pesan));
  await tidur(1600);
  const pulih = await page.evaluate(() => ({
    geser: document.querySelectorAll('.kartu')[5].style.translate,
    pesan: document.querySelector('.p1 .pesan').textContent,
    ajak: document.querySelectorAll('.tombol-rebut.ajak').length,
  }));
  cek('pesan dan efek kembali normal', pulih.geser === '' && pulih.pesan === 'Lihat rasi? Tekan tombolmu!' && pulih.ajak === 0, JSON.stringify(pulih));

  // Ketukan beruntun tidak mengubah skor atau fase, dan RASI! tetap bisa ditekan.
  await page.evaluate(() => { for (let n = 0; n < 8; n++) document.querySelectorAll('.kartu')[n].click(); });
  await tidur(100);
  await page.keyboard.press('a');
  await tidur(120);
  const main = await page.evaluate(() => ({
    pesan: document.querySelector('.p1 .pesan').textContent,
    aria: document.querySelector('.kartu').getAttribute('aria-disabled'),
    bintang: document.querySelectorAll('.bintang-skor svg.isi').length,
    aktif: document.querySelector('.p1').classList.contains('aktif'),
  }));
  cek('sesudah ketukan beruntun, RASI! tetap jalan dan skor tidak berubah', main.aktif && main.pesan === 'Pilih 3 kartu (0/3)' && main.aria === 'false' && main.bintang === 0, JSON.stringify(main));
  await page.mouse.click(kartu.x, kartu.y);
  await tidur(120);
  cek('sesudah RASI!, ketukan kartu kembali memilih', await page.evaluate(() => document.querySelectorAll('.kartu')[5].classList.contains('dipilih')));
  await tidur(8200);
  await page.waitForFunction(() => document.querySelector('.tombol-rebut') && document.querySelector('.kartu').disabled === false, { timeout: 4000 });
  await page.close();

  // Layar sentuh.
  const hp = await bukaHalaman(browser, { width: 390, height: 844, hasTouch: true, isMobile: true }, galat);
  await klik(hp, 'tombol-mulai');
  await tidur(1000);
  const k = await tengah(hp, '.kartu', 2);
  await hp.touchscreen.tap(k.x, k.y);
  await tidur(100);
  cek('layar sentuh: ketukan kartu mengajak menekan RASI!', (await hp.$eval('.p2 .pesan', (e) => e.textContent)) === 'Tekan RASI! dulu');
  await hp.close();

  // Gerak dikurangi: pesannya tetap muncul, tanpa goyangan.
  const kurang = await browser.newPage();
  await kurang.setViewport({ width: 390, height: 844 });
  kurang.on('pageerror', (e) => galat.push('pageerror: ' + e.message));
  await kurang.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await kurang.goto(HALAMAN);
  await tidur(400);
  await klik(kurang, 'tombol-mulai');
  await tidur(800);
  await kurang.evaluate(() => document.querySelectorAll('.kartu')[1].click());
  await tidur(80);
  const diam = await kurang.evaluate(() => ({
    pesan: document.querySelector('.p1 .pesan').textContent,
    geser: document.querySelectorAll('.kartu')[1].style.translate,
  }));
  cek('gerak dikurangi: pesan tampil tanpa goyangan', diam.pesan === 'Tekan RASI! dulu' && diam.geser === '', JSON.stringify(diam));
  await kurang.close();
}

async function ujiRilis(browser, galat) {
  console.log('== Rilis web ==');
  const http = require('http');
  const AKAR = path.join(__dirname, '..', 'public');
  const JENIS = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
  let versi = 'v1';
  let hidup = true;
  const server = http.createServer((q, r) => {
    if (!hidup) { q.socket.destroy(); return; }
    let p = decodeURIComponent(q.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(AKAR, p);
    if (!f.startsWith(AKAR) || !fs.existsSync(f)) { r.writeHead(404); r.end(); return; }
    let isi = fs.readFileSync(f);
    if (p === '/index.html') isi = isi.toString().replace('<title>SETDOKU</title>', '<title>SETDOKU</title><meta name="versi-uji" content="' + versi + '">');
    r.writeHead(200, { 'Content-Type': JENIS[path.extname(f)] || 'application/octet-stream' });
    r.end(isi);
  });
  await new Promise((s) => server.listen(0, '127.0.0.1', s));
  const ALAMAT = 'http://127.0.0.1:' + server.address().port + '/';

  // File rilis lengkap.
  const manifest = JSON.parse(fs.readFileSync(path.join(AKAR, 'manifest.webmanifest'), 'utf8'));
  const ukuranPng = (f) => { const b = fs.readFileSync(path.join(AKAR, f)); return b.readUInt32BE(16) + 'x' + b.readUInt32BE(20); };
  cek('manifest: nama, tampilan, dan ikon lengkap', manifest.name === 'SETDOKU' && manifest.display === 'standalone' && manifest.icons.every((i) => ukuranPng(i.src) === i.sizes) && manifest.icons.some((i) => i.purpose === 'maskable') && manifest.icons.some((i) => i.sizes === '512x512'), manifest.icons.map((i) => i.sizes).join());
  cek('gambar pratinjau tautan berukuran 1200x630', ukuranPng('ikon/pratinjau.png') === '1200x630');
  const html = fs.readFileSync(path.join(AKAR, 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(AKAR, 'sw.js'), 'utf8');
  const skrip = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  cek('service worker menyimpan semua skrip game', skrip.length >= 6 && skrip.every((f) => sw.includes("'" + f + "'")), skrip.join());
  const daftarSw = [...sw.matchAll(/^  '([^']+)',$/gm)].map((m) => m[1]).filter((f) => f !== './');
  cek('semua file di daftar service worker ada', daftarSw.length > 0 && daftarSw.every((f) => fs.existsSync(path.join(AKAR, f))), daftarSw.length + ' file');
  cek('halaman punya deskripsi, ikon, dan pratinjau tautan', ['name="description"', 'manifest.webmanifest', 'rel="apple-touch-icon"', 'property="og:image"', 'name="twitter:card"'].every((x) => html.includes(x)));

  // Pemain biasa tidak melihat alat uji main.
  const biasa = await browser.newPage();
  await biasa.setViewport({ width: 390, height: 844 });
  biasa.on('pageerror', (e) => galat.push('pageerror: ' + e.message));
  await biasa.goto(HALAMAN_BIASA);
  await biasa.evaluate(() => { localStorage.clear(); localStorage.setItem('setdoku-uji-buka-semua', '1'); });
  await biasa.reload();
  await tidur(500);
  await bukaPeta(biasa);
  const tampilan = await biasa.evaluate(() => ({
    uji: document.getElementById('uji-main').hidden,
    terkunci: document.querySelectorAll('.tombol-level.terkunci').length,
  }));
  cek('tanpa ?uji: Data uji main tersembunyi, dan saklar Buka semua level tidak berlaku', tampilan.uji && tampilan.terkunci === 149, JSON.stringify(tampilan));
  await pilihLevel(biasa, 1);
  await klik(biasa, 'tombol-mode-practice');
  await tidur(800);
  await isiPractice(biasa, 1);
  await klik(biasa, 'tombol-kunci');
  await adaHasil(biasa);
  const catatan = await biasa.evaluate(() => localStorage.getItem('setdoku-uji'));
  cek('tanpa ?uji: tidak ada data uji main yang dicatat', catatan === null, String(catatan));
  await biasa.close();
  const denganUji = await bukaHalaman(browser, { width: 390, height: 844 }, galat);
  await bukaPeta(denganUji);
  cek('dengan ?uji: Data uji main tampil', await denganUji.$eval('#uji-main', (e) => !e.hidden));
  await denganUji.close();

  // G-08: offline.
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  page.on('pageerror', (e) => galat.push('pageerror: ' + e.message));
  await page.goto(ALAMAT);
  await page.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true), { timeout: 8000 });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await tidur(800);
  const kendali = await page.evaluate(() => !!navigator.serviceWorker.controller);
  cek('G-08: service worker aktif', kendali);
  cek('manifest terpasang saat dibuka lewat alamat web', await page.$eval('link[rel="manifest"]', (e) => e.getAttribute('href')) === 'manifest.webmanifest');
  hidup = false;
  await page.setOfflineMode(true);
  await page.reload();
  await tidur(800);
  const luring = await page.evaluate(() => ({ judul: document.title, kartu: document.querySelectorAll('#logo svg').length, level: typeof DataLevel }));
  cek('G-08: halaman terbuka tanpa internet', luring.judul === 'SETDOKU' && luring.kartu === 3 && luring.level === 'object', JSON.stringify(luring));
  await bukaPeta(page);
  await mainRanked(page, 1);
  await isiRanked(page, 1);
  await klik(page, 'tombol-kunci');
  await adaHasil(page);
  cek('G-08: Tantangan bisa ditamatkan tanpa internet', (await teksDi(page, 'judul-hasil')) === 'Level 1 selesai!');
  await page.goto(ALAMAT + '?uji').catch(() => {});
  await tidur(500);
  cek('G-08: alamat ?uji juga terbuka tanpa internet', await page.evaluate(() => document.title) === 'SETDOKU');

  // Setelah deploy ulang, pemain yang online langsung mendapat versi baru.
  await page.setOfflineMode(false);
  hidup = true;
  versi = 'v2';
  await page.goto(ALAMAT);
  await tidur(500);
  const terbaru = await page.$eval('meta[name="versi-uji"]', (e) => e.content);
  cek('G-08: online langsung memakai versi terbaru', terbaru === 'v2', terbaru);
  await page.close();
  await new Promise((s) => server.close(s));

  // G-05 dan G-07 di Duel.
  const duel = await bukaHalaman(browser, { width: 1024, height: 768 }, galat);
  await klik(duel, 'tombol-mulai');
  await tidur(900);
  await duel.keyboard.press('a');
  await tidur(120);
  const badge = await duel.$eval('.kartu', (e) => getComputedStyle(e, '::after').content);
  cek('G-07: kartu Duel menampilkan tombolnya saat memilih', badge === '"1"', badge);
  await duel.screenshot({ path: path.join(FOTO, 'keyboard-duel.png') });
  const TOMBOL = '1234qwerasdf';
  const rasi = await cariRasi(duel);
  const salah = await cariRasi(duel, true);
  await duel.keyboard.down('Control');
  await duel.keyboard.press(TOMBOL[salah[0]]);
  await duel.keyboard.up('Control');
  await tidur(60);
  cek('G-07: Ctrl+tombol tidak memilih kartu', await duel.evaluate(() => document.querySelectorAll('.kartu.dipilih').length) === 0);
  await duel.keyboard.press(TOMBOL[salah[0]]);
  await tidur(60);
  cek('G-07: tombol memilih kartu sesuai posisinya', await duel.evaluate((i) => document.querySelectorAll('.kartu')[i].classList.contains('dipilih'), salah[0]));
  await duel.keyboard.press(TOMBOL[salah[0]]);
  await tidur(60);
  cek('G-07: tombol yang sama membatalkan pilihan', await duel.evaluate(() => document.querySelectorAll('.kartu.dipilih').length) === 0);
  for (const i of salah) await duel.keyboard.press(TOMBOL[i]);
  await tidur(250);
  const terlewat = await duel.evaluate(() => [...document.querySelectorAll('.kartu')].flatMap((b, i) => (b.classList.contains('terlewat') ? [i] : [])));
  const label = await duel.evaluate(() => [...document.querySelectorAll('.kartu')].map((b) => b.getAttribute('aria-label')));
  const sifat = terlewat.map((i) => SIFAT_DARI_LABEL(label[i]));
  const benarkahRasi = sifat.length === 3 && ['bentuk', 'warna', 'jumlah', 'isian'].every((x) => (sifat[0][x] + sifat[1][x] + sifat[2][x]) % 3 === 0);
  const garis = await duel.$eval('.kartu.terlewat .tepi', (e) => { const g = getComputedStyle(e); return g.stroke + ' ' + g.strokeDasharray; });
  await duel.screenshot({ path: path.join(FOTO, 'duel-terlewat.png') });
  cek('G-05: salah menandai tiga kartu yang benar-benar rasi', benarkahRasi, terlewat.join());
  cek('G-05: tandanya hijau putus-putus, jadi tidak hanya mengandalkan warna', garis.includes('94, 224, 138') && /11/.test(garis), garis);
  await tidur(2100);
  cek('G-05: tanda hilang di ronde berikutnya', await duel.evaluate(() => document.querySelectorAll('.kartu.terlewat').length) === 0);
  await tidur(800);
  const setelahKocok = await duel.evaluate(() => ({
    label: [...document.querySelectorAll('.kartu')].map((b) => b.getAttribute('aria-label')),
    gambar: [...document.querySelectorAll('.kartu')].map((b) => b.style.scale),
    pesan: document.querySelector('.p1 .pesan').textContent,
    dipilih: document.querySelectorAll('.kartu.dipilih, .kartu.salah').length,
  }));
  const berganti = setelahKocok.label.filter((x, i) => x !== label[i]).length;
  await duel.screenshot({ path: path.join(FOTO, 'duel-kocok.png') });
  cek('setelah salah: kartu dikocok dan pesannya memberi tahu', berganti >= 8 && setelahKocok.pesan === 'Kartu dikocok. Lihat rasi?' && setelahKocok.dipilih === 0, `berganti ${berganti}, ${setelahKocok.pesan}`);
  cek('setelah salah: animasi balik selesai dan kartu kembali tegak', setelahKocok.gambar.every((x) => x === ''), setelahKocok.gambar.join());
  await duel.keyboard.press('l');
  await tidur(100);
  const rasi2 = await cariRasi(duel);
  for (const i of rasi2) await duel.keyboard.press(TOMBOL[i]);
  await tidur(250);
  cek('G-05: jawaban benar tidak menandai apa pun', await duel.evaluate(() => document.querySelectorAll('.kartu.terlewat').length) === 0);
  await duel.close();

  // G-07 di Solo.
  const solo = await bukaHalaman(browser, { width: 1024, height: 768 }, galat, { bukaSemua: false });
  await isiProgres(solo, { barang: { heart: 0, hint: 1, waktu: 1 } });
  await bukaPeta(solo);
  await mainRanked(solo, 1);
  const lv = await solo.evaluate(() => ({ papan: DataLevel[0].ranked.papan, tersedia: DataLevel[0].ranked.tersedia, sol: Puzzle.cariSolusi(DataLevel[0].ranked)[0] }));
  const POOL = '1234567890-=';
  const SLOT = 'qweasdzxc';
  const tandaSolo = await solo.evaluate(() => ({ sedia: getComputedStyle(document.querySelector('.sedia'), '::after').content, slot: getComputedStyle(document.querySelector('.slot:not(.tetap)'), '::after').content }));
  cek('G-07: kartu dan slot Solo menampilkan tombolnya', tandaSolo.sedia === '"1"' && tandaSolo.slot.length === 3, JSON.stringify(tandaSolo));
  await solo.screenshot({ path: path.join(FOTO, 'keyboard-solo.png') });
  const t0 = await detikTimer(solo);
  await solo.keyboard.press('t');
  await tidur(100);
  cek('G-07: T memakai Extra Time', (await detikTimer(solo)) > t0 && (await teksDi(solo, 'stok-waktu')) === '0');
  await solo.keyboard.press('h');
  await tenang(solo);
  cek('G-07: H memakai Hint', (await teksDi(solo, 'stok-hint')) === '0');
  const sisa = await solo.evaluate(() => [...document.querySelectorAll('.slot')].flatMap((b, i) => (b.classList.contains('kosong') ? [i] : [])));
  for (const i of sisa) {
    await solo.keyboard.press(POOL[lv.tersedia.indexOf(lv.sol[i])]);
    await tidur(60);
    await solo.keyboard.press(SLOT[i]);
    await tenang(solo);
  }
  await solo.keyboard.press('k');
  await adaHasil(solo);
  cek('G-07: seluruh level bisa ditamatkan dengan keyboard', (await teksDi(solo, 'judul-hasil')) === 'Level 1 selesai!');
  await solo.keyboard.press('k');
  await solo.keyboard.press('q');
  await tidur(150);
  cek('G-07: tombol tidak bekerja saat layar hasil terbuka', await solo.evaluate(() => !document.getElementById('layar-hasil').hidden));
  await solo.close();

  // Tanda tombol tidak muncul di HP.
  const hp = await bukaHalaman(browser, { width: 390, height: 844, hasTouch: true, isMobile: true }, galat);
  await keLevel(hp, 1);
  const tanda = await hp.$eval('.sedia', (e) => getComputedStyle(e, '::after').content);
  cek('G-07: tanda tombol tidak muncul di HP', tanda === 'none' || tanda === 'normal', tanda);
  await hp.close();
}

async function ujiAkhirTahap2(browser, galat) {
  console.log('== Pemeriksaan akhir tahap 2 ==');

  // Tanpa localStorage: seluruh alur Tantangan dan Toko tetap jalan dengan data di memori.
  const blokir = await browser.newPage();
  await blokir.setViewport({ width: 390, height: 844 });
  blokir.on('pageerror', (e) => galat.push('pageerror: ' + e.message));
  await blokir.evaluateOnNewDocument(() => {
    const tolak = () => { throw new Error('penyimpanan diblokir'); };
    Storage.prototype.getItem = tolak;
    Storage.prototype.setItem = tolak;
    Storage.prototype.removeItem = tolak;
  });
  await blokir.goto(HALAMAN);
  await tidur(500);
  await bukaPeta(blokir);
  await mainRanked(blokir, 1);
  await isiRanked(blokir, 1);
  await klik(blokir, 'tombol-kunci');
  await adaHasil(blokir);
  await tidur(1300);
  const menang = await hasilDi(blokir);
  cek('tanpa localStorage: Tantangan bisa dimenangkan', menang.dapat === 3 && menang.hadiah.startsWith('+3'), menang.hadiah);
  await klik(blokir, 'tombol-level-peta');
  await tidur(800);
  const peta = await blokir.evaluate(() => ({
    wallet: document.getElementById('stat-wallet').textContent,
    terbuka: !document.querySelectorAll('.tombol-level')[1].classList.contains('terkunci'),
  }));
  cek('tanpa localStorage: Stars dan level terbuka tersimpan di memori', peta.wallet === '3 ⭐' && peta.terbuka, JSON.stringify(peta));
  await klik(blokir, 'tombol-peta-toko');
  await tidur(700);
  await klik(blokir, 'beli-heart');
  await tidur(150);
  cek('tanpa localStorage: Saldo kurang tetap ditolak di Toko', (await teksDi(blokir, 'saldo-wallet')) === '3 ⭐');
  await blokir.close();

  // Gerak dikurangi: semua layar baru tetap muat dan tidak tertinggal setengah jalan.
  const kurang = await browser.newPage();
  await kurang.setViewport({ width: 390, height: 844 });
  kurang.on('pageerror', (e) => galat.push('pageerror: ' + e.message));
  await kurang.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await kurang.goto(HALAMAN);
  await kurang.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('setdoku-progres', JSON.stringify({ versi: 1, nyawa: 3, nyawaMaks: 5, pulihSejak: Date.now(), wallet: 40, totalStars: 40, barang: { heart: 1, hint: 1, waktu: 1 } }));
  });
  await kurang.reload();
  await tidur(500);
  const terlihat = (sel) => kurang.evaluate((s) => {
    const e = document.querySelector(s);
    const g = getComputedStyle(e);
    return !e.hidden && Number(g.opacity) > 0.97 && e.style.translate === '' && e.style.scale === '';
  }, sel);
  await klik(kurang, 'tombol-toko');
  await tidur(500);
  cek('gerak dikurangi: Toko tampil penuh', await terlihat('#layar-toko'));
  await klik(kurang, 'beli-hint');
  await tidur(400);
  cek('gerak dikurangi: membeli tetap jalan, dan pesannya tampil tanpa gerak', (await teksDi(kurang, 'punya-hint')) === 'Punya 2' && (await toastDi(kurang)).animasi === 'none');
  await klik(kurang, 'tombol-toko-keluar');
  await tidur(500);
  await klik(kurang, 'tombol-profil');
  await tidur(500);
  cek('gerak dikurangi: Profil tampil penuh', await terlihat('#layar-profil'));
  await klik(kurang, 'tombol-profil-keluar');
  await tidur(500);
  await bukaPeta(kurang);
  cek('gerak dikurangi: peta tampil penuh', await terlihat('#layar-peta') && await terlihat('.tombol-level'));
  await pilihLevel(kurang, 1);
  cek('gerak dikurangi: Pilih Mode tampil penuh', await terlihat('#dialog-mode .kotak-dialog'));
  await klik(kurang, 'tombol-mode-ranked');
  await tidur(700);
  cek('gerak dikurangi: papan Tantangan tampil penuh', await terlihat('#layar-solo') && await terlihat('.slot'));
  await klik(kurang, 'tombol-hint');
  await tenang(kurang);
  await klik(kurang, 'tombol-waktu');
  await tidur(200);
  cek('gerak dikurangi: item tetap bisa dipakai', (await teksDi(kurang, 'stok-hint')) === '1' && (await teksDi(kurang, 'stok-waktu')) === '0');
  await kurang.close();

  // G-13: hadiah selalu disebut Stars. Kata bintang hanya untuk bentuk kartu dan skor Duel.
  const page = await bukaHalaman(browser, { width: 390, height: 844 }, galat, { bukaSemua: false });
  await isiProgres(page, { rekor: { 1: 2 }, wallet: 40, totalStars: 40 });
  const adaKata = () => page.evaluate(() => /bintang/i.test(['layar-peta', 'layar-toko', 'layar-profil', 'dialog-mode', 'layar-hasil'].map((i) => document.getElementById(i).textContent).join(' ')));
  await bukaPeta(page);
  await pilihLevel(page, 1);
  const kataPeta = await adaKata();
  await klik(page, 'tombol-mode-ranked');
  await tidur(800);
  await isiRanked(page, 1);
  await klik(page, 'tombol-kunci');
  await adaHasil(page);
  await tidur(1000);
  const kataHasil = await adaKata();
  const labelStars = await page.$eval('#stars-hasil', (e) => e.getAttribute('aria-label'));
  cek('G-13: hadiah disebut Stars, bukan bintang', !kataPeta && !kataHasil && /Stars$/.test(labelStars), labelStars);
  await page.close();
}

async function ujiProfil(browser, galat) {
  console.log('== Profil dan Cara bermain ==');
  for (const u of [{ nama: 'hp-kecil', width: 360, height: 640 }, { nama: 'hp', width: 390, height: 844 }, { nama: 'hp-lanskap', width: 740, height: 360 }, { nama: 'tablet', width: 1024, height: 768 }]) {
    const page = await bukaHalaman(browser, { width: u.width, height: u.height }, galat, { bukaSemua: false });
    await isiProgres(page, { rekor: { 1: 3, 2: 2 }, totalStars: 5, wallet: 2, nyawa: 3, pulihSejak: Date.now(), barang: { heart: 1, hint: 2, waktu: 3 } });
    await tidur(600);
    const menu = await page.evaluate((w, t) => [...document.querySelectorAll('#layar-menu button, #layar-menu h1')].filter((e) => {
      const q = e.getBoundingClientRect();
      return q.left < -0.5 || q.top < -0.5 || q.right > w + 0.5 || q.bottom > t + 0.5;
    }).map((e) => e.id || e.tagName), u.width, u.height);
    cek(u.nama + ': menu dengan 5 tombol muat', menu.length === 0, menu.join());
    await page.screenshot({ path: path.join(FOTO, 'menu-' + u.nama + '.png') });
    await klik(page, 'tombol-profil');
    await tidur(700);
    const isi = await page.$eval('#isi-profil', (e) => e.innerText.replace(/\s+/g, ' '));
    const luar = await page.evaluate((w) => [...document.querySelectorAll('.stat, .stat b, .stat small')].filter((e) => {
      const q = e.getBoundingClientRect();
      const i = e.closest('.stat').getBoundingClientRect();
      return q.left < -0.5 || q.right > w + 0.5 || q.left < i.left - 0.5 || q.right > i.right + 0.5;
    }).length, u.width);
    await page.screenshot({ path: path.join(FOTO, 'profil-' + u.nama + '.png') });
    cek(u.nama + ': Profil muat', luar === 0, 'keluar ' + luar);
    if (u.nama === 'hp') {
      cek('Profil: angkanya sesuai progres', /Level Solo 3 /.test(isi) && /Tantangan menang 2 /.test(isi) && /Total Stars 5/.test(isi) && /Star Wallet 2/.test(isi) && /Nyawa 3\/5/.test(isi) && /Malam/.test(isi) && /Heart 1 · Hint 2 · Time 3/.test(isi), isi);
    }
    await klik(page, 'tombol-profil-keluar');
    await tidur(700);
    cek(u.nama + ': keluar Profil kembali ke menu', await page.evaluate(() => !document.getElementById('layar-menu').hidden && document.getElementById('layar-profil').hidden));
    await page.close();
  }
  const page = await bukaHalaman(browser, { width: 390, height: 844 }, galat);
  const cara = await page.$eval('#layar-cara', (e) => e.textContent);
  cek('Cara bermain menjelaskan Tantangan, Stars, nyawa, dan Toko', ['Tantangan', '15 detik', 'Extra Time', 'Card Skin', '20 menit'].every((x) => cara.includes(x)));
  cek('Nama lama Solo Ranked tidak tersisa di teks game', !/Ranked/.test(await page.evaluate(() => document.body.innerText + document.getElementById('layar-cara').textContent + document.getElementById('dialog-mode').textContent)));
  await page.close();
}

async function ujiSkin(browser, galat) {
  console.log('== Card Skin ==');
  const page = await bukaHalaman(browser, { width: 390, height: 844 }, galat);
  const warnaKartu = (sel) => page.$eval(sel, (e) => {
    const s = getComputedStyle(e);
    return `${s.fill} ${s.stroke}`;
  });
  const SENJA = 'rgb(36, 17, 54) rgb(107, 63, 134)';
  const DASAR = 'rgb(29, 35, 80) rgb(57, 65, 127)';

  await isiProgres(page, { wallet: 24, totalStars: 24 });
  await klik(page, 'tombol-toko');
  await tidur(600);
  await klik(page, 'beli-skin');
  await tidur(150);
  let p = await progresDi(page);
  cek('Card Skin: saldo kurang tidak terbeli', p.wallet === 24 && !(p.koleksi || []).includes('senja') && (await toastDi(page)).teks === 'Star Wallet kurang 1 ⭐');
  cek('Card Skin: tombol Pakai tersembunyi sebelum dimiliki', await page.$eval('#pakai-skin', (e) => e.hidden));
  await page.screenshot({ path: path.join(FOTO, 'skin-toko-awal.png') });

  await isiProgres(page, { wallet: 30, totalStars: 30 });
  await klik(page, 'tombol-toko');
  await tidur(600);
  await klik(page, 'beli-skin');
  await tidur(100);
  p = await progresDi(page);
  cek('Card Skin: tekan pertama hanya meminta yakin', (await teksDi(page, 'beli-skin')) === 'Yakin?' && p.wallet === 30);
  await klik(page, 'beli-skin');
  await tidur(200);
  p = await progresDi(page);
  cek('pesan di Toko tidak menutupi saldo', (await menimpaDi(page, ['.bar-toko'])).length === 0);
  cek('P-03: Card Skin mengurangi Wallet, Total Stars tetap, dan langsung dipakai', p.wallet === 5 && p.totalStars === 30 && p.koleksi.includes('senja') && p.skinAktif === 'senja', JSON.stringify({ w: p.wallet, t: p.totalStars, s: p.skinAktif }));
  const tombol = await page.evaluate(() => ({ beli: document.getElementById('beli-skin').textContent, mati: document.getElementById('beli-skin').disabled, pakai: document.getElementById('pakai-skin').textContent, status: document.getElementById('punya-skin').textContent }));
  cek('Card Skin: status berubah menjadi dimiliki dan bisa dilepas', tombol.beli === 'Dimiliki' && tombol.mati && tombol.pakai === 'Lepas' && tombol.status === 'Sedang dipakai', JSON.stringify(tombol));
  await page.screenshot({ path: path.join(FOTO, 'skin-toko.png') });
  await klik(page, 'tombol-toko-keluar');
  await tidur(700);

  // Berlaku di semua kartu.
  await bukaPeta(page);
  await pilihLevel(page, 5);
  await klik(page, 'tombol-mode-practice');
  await tidur(900);
  await page.screenshot({ path: path.join(FOTO, 'skin-main.png') });
  cek('skin berlaku pada kartu tersedia', (await warnaKartu('.sedia .tepi')) === SENJA, await warnaKartu('.sedia .tepi'));
  cek('skin berlaku pada kartu petunjuk', (await warnaKartu('.slot.tetap .tepi')) === 'rgb(54, 28, 72) rgb(197, 139, 224)', await warnaKartu('.slot.tetap .tepi'));
  const dari = await tengah(page, '.sedia', 0);
  await page.mouse.move(dari.x, dari.y);
  await page.mouse.down();
  await page.mouse.move(dari.x - 60, dari.y - 80, { steps: 5 });
  await tidur(100);
  cek('skin berlaku pada kartu yang sedang diseret', (await warnaKartu('.hantu .tepi')) === SENJA);
  await page.mouse.up();
  await tenang(page);
  const simbol = await page.$eval('.sedia g path, .sedia g circle', (e) => e.getAttribute('stroke'));
  cek('warna simbol tidak berubah', ['#fae242', '#68dcf3', '#f0506e'].includes(simbol), simbol);

  // Tanda jawaban tetap terbaca.
  const level = await page.evaluate(() => ({ papan: DataLevel[4].practice.papan, tersedia: DataLevel[4].practice.tersedia, solusi: Puzzle.cariSolusi(DataLevel[4].practice)[0] }));
  const kosong = level.papan.flatMap((k, i) => (k === null ? [i] : []));
  const isi = kosong.map((i) => level.solusi[i]);
  [isi[0], isi[1]] = [isi[1], isi[0]];
  for (let n = 0; n < kosong.length; n++) {
    await seret(page, await tengah(page, '.sedia', level.tersedia.indexOf(isi[n])), await tengah(page, '.slot', kosong[n]), { langkah: 4 });
    await tenang(page);
  }
  await klik(page, 'tombol-kunci');
  await tidur(250);
  const merah = await page.$eval('.slot.gagal .tepi', (e) => getComputedStyle(e).stroke);
  await page.screenshot({ path: path.join(FOTO, 'skin-salah.png') });
  cek('tanda garis salah tetap merah di skin baru', merah === 'rgb(255, 107, 125)', merah);
  await klik(page, 'tombol-solo-keluar');
  await tidur(700);

  // Duel, dan bertahan setelah dimuat ulang.
  await page.reload();
  await tidur(500);
  await klik(page, 'tombol-mulai');
  await tidur(900);
  cek('skin bertahan setelah dimuat ulang dan berlaku di Duel', (await warnaKartu('.kartu .tepi')) === SENJA);
  await page.screenshot({ path: path.join(FOTO, 'skin-duel.png') });
  await klik(page, 'tombol-keluar');
  await tidur(250);
  await klik(page, 'tombol-yakin-keluar');
  await tidur(800);

  // Lepas dan pakai lagi, tanpa membayar lagi.
  await klik(page, 'tombol-toko');
  await tidur(600);
  await klik(page, 'pakai-skin');
  await tidur(150);
  p = await progresDi(page);
  const logo = await warnaKartu('#logo .tepi');
  cek('Lepas: kembali ke kartu dasar, tanpa kehilangan skin', p.skinAktif === 'dasar' && p.koleksi.includes('senja') && p.wallet === 5 && logo === DASAR, logo);
  await klik(page, 'pakai-skin');
  await tidur(150);
  p = await progresDi(page);
  cek('Pakai lagi: gratis', p.skinAktif === 'senja' && p.wallet === 5);

  // Reset progres mengembalikan tampilan dasar.
  page.on('dialog', (d) => d.accept());
  await klik(page, 'tombol-toko-keluar');
  await tidur(700);
  await bukaPeta(page);
  await klik(page, 'tombol-reset-progres');
  await tidur(200);
  cek('Reset progres mengembalikan kartu dasar', (await warnaKartu('#logo .tepi')) === DASAR);
  await page.close();
}

async function ujiCara(browser, galat) {
  console.log('== Tombol Kembali di Cara bermain ==');
  const buka = async () => {
    const p = await bukaHalaman(browser, { width: 390, height: 844, hasTouch: true, isMobile: true }, galat);
    await klik(p, 'tombol-cara');
    await tidur(700);
    await p.evaluate(() => { const l = document.getElementById('layar-cara'); l.scrollTop = l.scrollHeight; });
    await tidur(100);
    return p;
  };
  const kembali = (p) => p.evaluate(() => document.getElementById('layar-cara').classList.contains('pergi') || document.getElementById('layar-cara').hidden);

  // Browser menelan click: hanya pointerdown dan pointerup yang sampai.
  let p = await buka();
  await p.evaluate(() => {
    const b = document.getElementById('tombol-tutup-cara');
    const q = b.getBoundingClientRect();
    const o = { bubbles: true, pointerId: 7, clientX: q.x + 20, clientY: q.y + 10 };
    b.dispatchEvent(new PointerEvent('pointerdown', o));
    b.dispatchEvent(new PointerEvent('pointerup', o));
  });
  await tidur(100);
  cek('Kembali: tetap jalan walau click ditelan browser', await kembali(p));
  await p.close();

  // Ketukan biasa sekali saja.
  p = await buka();
  const b = await tengah(p, '#tombol-tutup-cara');
  await p.touchscreen.tap(b.x, b.y);
  await tidur(900);
  cek('Kembali: sekali ketuk langsung ke menu', await p.evaluate(() => !document.getElementById('layar-menu').hidden && document.getElementById('layar-cara').hidden));
  await p.close();

  // Menggulir yang dimulai dari tombol tidak dihitung ketukan.
  p = await buka();
  const t = await tengah(p, '#tombol-tutup-cara');
  const c = await p.target().createCDPSession();
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: t.x, y: t.y }] });
  for (let i = 1; i <= 8; i++) {
    await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: t.x, y: t.y + i * 25 }] });
    await tidur(16);
  }
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await tidur(300);
  cek('Kembali: menggulir dari tombol tidak keluar', !(await kembali(p)));
  await p.close();

  // Keyboard.
  p = await buka();
  await p.evaluate(() => document.getElementById('tombol-tutup-cara').focus());
  await p.keyboard.press('Enter');
  await tidur(100);
  cek('Kembali: keyboard tetap jalan', await kembali(p));
  await p.close();
}

async function ujiToko(browser, galat) {
  console.log('== Toko dan item ==');
  const page = await bukaHalaman(browser, { width: 390, height: 844 }, galat, { bukaSemua: false });

  // Membeli dari menu.
  await isiProgres(page, { wallet: 20, totalStars: 30 });
  await klik(page, 'tombol-toko');
  await tidur(600);
  await page.screenshot({ path: path.join(FOTO, 'toko.png') });
  const teks = await page.$eval('#daftar-toko', (e) => e.textContent);
  cek('Toko menampilkan empat item dan harganya', ['Extra Heart', 'Hint', 'Extra Time', 'Heart Upgrade'].every((x) => teks.includes(x)) && (await teksDi(page, 'beli-upgrade')).startsWith('30'), await teksDi(page, 'saldo-wallet'));
  cek('Toko memakai istilah Stars, bukan bintang (G-13)', !/bintang/i.test(teks));
  await klik(page, 'beli-waktu');
  await tidur(150);
  let p = await progresDi(page);
  cek('P-03: membeli mengurangi Wallet dan Total Stars tetap', p.wallet === 12 && p.totalStars === 30 && p.barang.waktu === 1, JSON.stringify({ w: p.wallet, t: p.totalStars }));
  cek('stok dan saldo di layar ikut berubah', (await teksDi(page, 'punya-waktu')) === 'Punya 1' && (await teksDi(page, 'saldo-wallet')) === '12 ⭐');

  // Saldo kurang.
  await klik(page, 'beli-upgrade');
  await tidur(200);
  p = await progresDi(page);
  const kurang = await toastDi(page);
  cek('saldo kurang: tidak terbeli, dan pesan menyebut kekurangannya', p.wallet === 12 && p.nyawaMaks === 5 && kurang.teks === 'Star Wallet kurang 18 ⭐' && kurang.jenis === 'peringatan', kurang.teks);
  const redup = await page.$eval('#beli-upgrade', (e) => e.getAttribute('aria-disabled'));
  cek('saldo kurang: tombol terlihat tidak aktif', redup === 'true');

  // Kembali ke menu.
  await klik(page, 'tombol-toko-keluar');
  await tidur(700);
  cek('keluar Toko kembali ke menu', await page.evaluate(() => !document.getElementById('layar-menu').hidden && document.getElementById('layar-toko').hidden));

  // Heart Upgrade perlu dua kali tekan.
  await isiProgres(page, { wallet: 60, totalStars: 60 });
  await klik(page, 'tombol-toko');
  await tidur(500);
  await klik(page, 'beli-upgrade');
  await tidur(100);
  p = await progresDi(page);
  const yakin = await teksDi(page, 'beli-upgrade');
  await page.screenshot({ path: path.join(FOTO, 'toko-yakin.png') });
  cek('Heart Upgrade: tekan pertama hanya meminta yakin', yakin === 'Yakin?' && p.wallet === 60 && p.nyawaMaks === 5, yakin);
  await tidur(3200);
  cek('Heart Upgrade: pertanyaan yakin hilang sendiri', (await teksDi(page, 'beli-upgrade')).startsWith('30'));
  await klik(page, 'beli-upgrade');
  await tidur(100);
  await klik(page, 'beli-upgrade');
  await tidur(200);
  p = await progresDi(page);
  cek('Heart Upgrade: tekan kedua membeli', p.wallet === 30 && p.nyawaMaks === 6 && p.totalStars === 60, JSON.stringify({ w: p.wallet, m: p.nyawaMaks }));

  // Extra Heart.
  await klik(page, 'beli-heart');
  await tidur(150);
  await isiProgres(page, { wallet: 30, barang: { heart: 1, hint: 0, waktu: 0 } });
  await klik(page, 'tombol-toko');
  await tidur(500);
  cek('Extra Heart: tidak bisa dipakai saat nyawa penuh', await page.$eval('#pakai-heart', (e) => e.disabled));
  await isiProgres(page, { nyawa: 3, pulihSejak: Date.now(), barang: { heart: 1, hint: 0, waktu: 0 } });
  await klik(page, 'tombol-toko');
  await tidur(500);
  await klik(page, 'pakai-heart');
  await tidur(150);
  p = await progresDi(page);
  cek('Extra Heart: memulihkan satu nyawa dan stok berkurang', p.nyawa === 4 && p.barang.heart === 0 && (await teksDi(page, 'saldo-nyawa')).includes('4/5'));

  // Nyawa habis bukan jalan buntu.
  await isiProgres(page, { nyawa: 0, pulihSejak: Date.now(), barang: { heart: 1, hint: 0, waktu: 0 } });
  await bukaPeta(page);
  await pilihLevel(page, 1);
  await page.screenshot({ path: path.join(FOTO, 'toko-pilih-heart.png') });
  cek('Pilih Mode: nyawa habis menawarkan Extra Heart', await page.$eval('#tombol-mode-heart', (e) => !e.hidden && e.textContent.includes('punya 1')));
  await klik(page, 'tombol-mode-heart');
  await tidur(200);
  p = await progresDi(page);
  const siapMain = await page.$eval('#tombol-mode-ranked', (e) => !e.disabled);
  cek('Pilih Mode: Extra Heart membuka Tantangan lagi', p.nyawa === 1 && p.barang.heart === 0 && siapMain);
  await klik(page, 'tombol-mode-batal');
  await tidur(500);
  await isiProgres(page, { nyawa: 0, pulihSejak: Date.now(), wallet: 10 });
  await bukaPeta(page);
  await pilihLevel(page, 1);
  cek('Pilih Mode: tanpa Extra Heart menawarkan Toko', await page.$eval('#tombol-mode-toko', (e) => !e.hidden));
  await klik(page, 'tombol-mode-toko');
  await tidur(700);
  cek('dari Pilih Mode masuk ke Toko', await page.evaluate(() => !document.getElementById('layar-toko').hidden && document.getElementById('dialog-mode').hidden));
  await klik(page, 'tombol-toko-keluar');
  await tidur(700);
  cek('keluar Toko kembali ke peta', await page.evaluate(() => !document.getElementById('layar-peta').hidden));

  await page.close();

  // Hint di Tantangan.
  const main = await bukaHalaman(browser, { width: 390, height: 844 }, galat, { bukaSemua: false });
  await isiProgres(main, { barang: { heart: 0, hint: 2, waktu: 1 } });
  await bukaPeta(main);
  await mainRanked(main, 1);
  await main.screenshot({ path: path.join(FOTO, 'toko-main.png') });
  const stok = await main.evaluate(() => ({
    hint: document.getElementById('stok-hint').textContent,
    waktu: document.getElementById('stok-waktu').textContent,
    tampil: !document.getElementById('tombol-waktu').hidden,
    label: document.getElementById('tombol-hint').getAttribute('aria-label'),
  }));
  cek('Tantangan: tombol Hint dan Extra Time menampilkan stok', stok.hint === '2' && stok.waktu === '1' && stok.tampil && stok.label === 'Hint, punya 2', JSON.stringify(stok));
  const solusi = await main.evaluate(() => Puzzle.cariSolusi(DataLevel[0].ranked)[0]);
  await klik(main, 'tombol-hint');
  await tenang(main);
  const sesudahHint = await papan(main);
  p = await progresDi(main);
  const namaSolusi = [];
  for (const id of solusi) namaSolusi.push(await namaKartu(main, id));
  const terbuka = sesudahHint.map((x, i) => (x.startsWith(namaSolusi[i]) && x.includes('petunjuk') ? i : null)).filter((x) => x !== null);
  const klu = await main.evaluate(() => DataLevel[0].ranked.papan.filter((k) => k !== null).length);
  cek('Hint: memasang kartu benar sebagai petunjuk, dan stok berkurang', terbuka.length === klu + 1 && p.barang.hint === 1, `petunjuk ${terbuka.length}, stok ${p.barang.hint}`);
  const pesanHint = await toastDi(main);
  cek('Hint: memberi tahu hadiah maksimal 2 Stars', pesanHint.teks === 'Satu kartu dibuka' && pesanHint.sub === 'Hadiah maksimal 2 ⭐', pesanHint.sub);

  // Extra Time.
  const t0 = await detikTimer(main);
  await klik(main, 'tombol-waktu');
  await tidur(100);
  const t1 = await detikTimer(main);
  p = await progresDi(main);
  cek('Extra Time: menambah 30 detik dan stok berkurang', t1 - t0 >= 28 && t1 - t0 <= 30 && p.barang.waktu === 0, `${t0} -> ${t1}`);
  await klik(main, 'tombol-waktu');
  await tidur(100);
  const t2 = await detikTimer(main);
  const habis = await toastDi(main);
  cek('Extra Time habis: waktu tidak bertambah, dan pesan mengarahkan ke Toko', t2 <= t1 && habis.teks === 'Extra Time habis. Beli di Toko.' && habis.jenis === 'peringatan', habis.teks);

  // Menyelesaikan dengan Hint: maksimal 2 Stars walau sisa waktu banyak.
  await klik(main, 'tombol-hint');
  await tenang(main);
  p = await progresDi(main);
  cek('Hint terakhir: papan terisi semua lewat Hint', p.barang.hint === 0 && !(await papan(main)).includes('kosong'));
  await klik(main, 'tombol-hint');
  await tidur(120);
  const hintHabis = await toastDi(main);
  cek('Hint habis: pesan mengarahkan ke Toko', hintHabis.teks === 'Hint habis. Beli di Toko.');
  await klik(main, 'tombol-kunci');
  await adaHasil(main);
  await tidur(1300);
  const h = await hasilDi(main);
  p = await progresDi(main);
  await main.screenshot({ path: path.join(FOTO, 'toko-hasil.png') });
  cek('P-05: memakai bantuan membatasi hadiah menjadi 2 Stars', h.dapat === 2 && p.rekor[1] === 2 && p.totalStars === 2, JSON.stringify({ dapat: h.dapat, rekor: p.rekor[1] }));
  cek('saran memberi tahu 3 Stars harus tanpa bantuan', h.saran.includes('tanpa bantuan') && h.saran.includes('3 ⭐'), h.saran);

  // Tanpa bantuan di percobaan berikutnya: status bantuan tidak terbawa.
  await klik(main, 'tombol-level-ulang');
  await tidur(800);
  await isiRanked(main, 1);
  await klik(main, 'tombol-kunci');
  await adaHasil(main);
  await tidur(1300);
  p = await progresDi(main);
  cek('status bantuan tidak terbawa ke percobaan berikutnya', (await hasilDi(main)).dapat === 3 && p.rekor[1] === 3 && p.totalStars === 3, `rekor ${p.rekor[1]}`);

  // Hint memperbaiki kartu pemain yang salah.
  await isiProgres(main, { rekor: { 1: 3 }, barang: { heart: 0, hint: 1, waktu: 0 } });
  await bukaPeta(main);
  await pilihLevel(main, 1);
  await klik(main, 'tombol-mode-practice');
  await tidur(800);
  const tampilWaktu = await main.$eval('#tombol-waktu', (e) => !e.hidden);
  cek('P-04: Extra Time tidak tampil di Practice', !tampilWaktu);
  const p1 = await main.evaluate(() => DataLevel[0].practice);
  const kosong = p1.papan.flatMap((k, i) => (k === null ? [i] : []));
  const sol = await main.evaluate(() => Puzzle.cariSolusi(DataLevel[0].practice)[0]);
  await seret(main, await tengah(main, '.sedia', p1.tersedia.indexOf(sol[kosong[1]])), await tengah(main, '.slot', kosong[0]), { langkah: 4 });
  await tenang(main);
  await seret(main, await tengah(main, '.sedia', p1.tersedia.indexOf(sol[kosong[0]])), await tengah(main, '.slot', kosong[1]), { langkah: 4 });
  await tenang(main);
  await klik(main, 'tombol-hint');
  await tenang(main);
  const benar = await papan(main);
  const namaBenar = await namaKartu(main, sol[kosong[0]]);
  cek('Hint memperbaiki slot yang salah, dan kartu lamanya kembali', benar[kosong[0]].startsWith(namaBenar) && benar[kosong[0]].includes('petunjuk') && benar[kosong[1]] === 'kosong', JSON.stringify([benar[kosong[0]], benar[kosong[1]]]));
  const dalamPractice = await toastDi(main);
  cek('Hint di Practice tanpa peringatan hadiah', dalamPractice.sub === null);
  await main.close();

  // Ukuran layar.
  for (const u of [{ nama: 'hp-kecil', width: 360, height: 640 }, { nama: 'hp-lanskap', width: 740, height: 360 }, { nama: 'tablet', width: 1024, height: 768 }]) {
    const hal = await bukaHalaman(browser, { width: u.width, height: u.height }, galat, { bukaSemua: false });
    const r = {};
    for (let n = 1; n <= 49; n++) r[n] = 1;
    await isiProgres(hal, { rekor: r, wallet: 999, nyawaMaks: 12, nyawa: 12, barang: { heart: 99, hint: 99, waktu: 99 } });
    await klik(hal, 'tombol-toko');
    await tidur(700);
    const toko = await hal.evaluate((w) => ({
      luar: [...document.querySelectorAll('.kartu-toko, .tombol-beli, .saldo-toko, .bar-toko h2')].filter((e) => {
        const q = e.getBoundingClientRect();
        return q.left < -0.5 || q.right > w + 0.5;
      }).map((e) => e.id || e.className),
      gulirSamping: document.getElementById('layar-toko').scrollWidth - document.getElementById('layar-toko').clientWidth,
    }), u.width);
    cek(u.nama + ': Toko muat tanpa gulir ke samping', toko.luar.length === 0 && toko.gulirSamping <= 0, JSON.stringify(toko));
    await hal.screenshot({ path: path.join(FOTO, 'toko-' + u.nama + '.png') });
    await klik(hal, 'tombol-toko-keluar');
    await tidur(700);
    await bukaPeta(hal);
    await pilihLevel(hal, 50);
    await klik(hal, 'tombol-mode-practice');
    await tidur(900);
    const lebarPractice = await hal.$eval('.slot', (e) => e.offsetWidth);
    await klik(hal, 'tombol-solo-keluar');
    await tidur(700);
    await pilihLevel(hal, 50);
    await klik(hal, 'tombol-mode-ranked');
    await tidur(1000);
    const muat = await hal.evaluate((w, t) => ({
      lebar: document.querySelector('.slot').offsetWidth,
      luar: [...document.querySelectorAll('.slot, .sedia, #tombol-kunci, .tombol-item')].filter((e) => {
        const q = e.getBoundingClientRect();
        return q.left < -0.5 || q.top < -0.5 || q.right > w + 0.5 || q.bottom > t + 0.5;
      }).map((e) => e.id || e.className),
      tinggiItem: document.getElementById('tombol-hint').offsetHeight,
      tinggiKunci: document.getElementById('tombol-kunci').offsetHeight,
      lebarKunci: document.getElementById('tombol-kunci').offsetWidth,
    }), u.width, u.height);
    await hal.screenshot({ path: path.join(FOTO, 'toko-main-' + u.nama + '.png') });
    cek(u.nama + ': tombol item muat, dan papan tidak mengecil', muat.luar.length === 0 && muat.lebar === lebarPractice && muat.tinggiItem === muat.tinggiKunci && muat.lebarKunci > 140, JSON.stringify(muat));
    await hal.close();
  }
}

async function ujiHasil(browser, galat) {
  console.log('== Layar hasil ==');
  const page = await bukaHalaman(browser, { width: 390, height: 844 }, galat, { bukaSemua: false });
  await bukaPeta(page);

  // 1 Star: durasi 12 detik, jadi 2 Stars butuh sisa 3 detik dan 3 Stars butuh 6 detik.
  await page.evaluate(() => { Progres.DURASI_MS.easy = 12000; });
  await mainRanked(page, 1);
  await menangSaatSisa(page, 1, 2);
  await tidur(1500);
  let h = await hasilDi(page);
  await page.screenshot({ path: path.join(FOTO, 'hasil-1.png') });
  cek('1 Star: dua Stars lain tampil kosong', h.dapat === 1 && h.kosong === 2, JSON.stringify(h));
  cek('1 Star: hadiah dan Star Wallet tampil', h.hadiah === '+1\u00a0⭐ · Star Wallet 1\u00a0⭐' && !h.tetap, h.hadiah);
  cek('1 Star: saran menyebut sisa waktu untuk Star berikutnya', h.saran === 'Sisa waktu minimal 0:03 untuk 2\u00a0⭐', h.saran);

  // 2 Stars: rekor naik dan hanya selisihnya yang masuk.
  await klik(page, 'tombol-level-ulang');
  await tidur(800);
  await menangSaatSisa(page, 1, 5);
  await tidur(1500);
  h = await hasilDi(page);
  let p = await progresDi(page);
  cek('2 Stars: hanya selisih rekor yang masuk', h.dapat === 2 && h.hadiah.startsWith('+1\u00a0⭐') && p.totalStars === 2 && p.wallet === 2 && p.rekor[1] === 2, JSON.stringify({ h: h.hadiah, total: p.totalStars }));
  cek('2 Stars: saran menyebut syarat 3 Stars', h.saran === 'Sisa waktu minimal 0:06 untuk 3\u00a0⭐', h.saran);

  // 3 Stars: muncul satu per satu, dan hasil sudah tersimpan sebelum animasinya.
  await page.evaluate(() => { Progres.DURASI_MS.easy = 180000; });
  await klik(page, 'tombol-level-ulang');
  await tidur(800);
  await isiRanked(page, 1);
  await klik(page, 'tombol-kunci');
  await tidur(100);
  const sebelumAnimasi = await progresDi(page);
  cek('hasil tersimpan sebelum animasi dimulai', sebelumAnimasi.rekor[1] === 3 && sebelumAnimasi.totalStars === 3 && sebelumAnimasi.berjalan === null);
  await page.waitForFunction(() => !document.getElementById('layar-hasil').hidden && document.querySelectorAll('#stars-hasil .dapat').length === 3, { timeout: 5000, polling: 'raf' });
  const urutan = await page.evaluate(() => new Promise((selesai) => {
    const el = [...document.querySelectorAll('#stars-hasil .dapat')];
    const waktu = el.map(() => null);
    const f = (t) => {
      el.forEach((s, i) => { if (waktu[i] === null && Number(getComputedStyle(s).opacity) > 0.5) waktu[i] = t; });
      if (waktu.every((x) => x !== null)) selesai(waktu);
      else requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }));
  cek('3 Stars muncul satu per satu', urutan[1] - urutan[0] > 150 && urutan[2] - urutan[1] > 150, urutan.map((x) => Math.round(x - urutan[0])).join(', ') + ' ms');
  await page.screenshot({ path: path.join(FOTO, 'hasil-3-animasi.png') });
  await tidur(900);
  h = await hasilDi(page);
  const opasitas = await page.evaluate(() => [...document.querySelectorAll('#stars-hasil .dapat')].map((s) => Number(getComputedStyle(s).opacity)));
  await page.screenshot({ path: path.join(FOTO, 'hasil-3.png') });
  cek('3 Stars: semua terlihat penuh dan tanpa saran', opasitas.every((o) => o > 0.99) && h.saran === null, opasitas.join(', '));
  const sesudahAnimasi = await progresDi(page);
  cek('animasi tidak mengubah hasil', JSON.stringify(sebelumAnimasi) === JSON.stringify(sesudahAnimasi));

  // Hasil lebih rendah dari rekor.
  await page.evaluate(() => { Progres.DURASI_MS.easy = 12000; });
  await klik(page, 'tombol-level-ulang');
  await tidur(800);
  await menangSaatSisa(page, 1, 2);
  await tidur(1200);
  h = await hasilDi(page);
  p = await progresDi(page);
  await page.screenshot({ path: path.join(FOTO, 'hasil-rekor-tetap.png') });
  cek('hasil di bawah rekor: Stars percobaan ini tampil, rekor tetap, dan tanpa saran', h.dapat === 1 && h.tetap && h.hadiah === 'Rekor tetap ⭐⭐⭐' && h.saran === null && p.rekor[1] === 3 && p.totalStars === 3, JSON.stringify(h));

  // Tombol bisa ditekan selama animasi, tanpa meninggalkan sisa.
  await page.evaluate(() => { Progres.DURASI_MS.easy = 180000; });
  await klik(page, 'tombol-level-ulang');
  await tidur(800);
  await isiRanked(page, 1);
  await klik(page, 'tombol-kunci');
  await adaHasil(page);
  await klik(page, 'tombol-level-peta');
  await tidur(1200);
  const diPeta = await page.evaluate(() => ({ peta: !document.getElementById('layar-peta').hidden, hasil: document.getElementById('layar-hasil').hidden, solo: document.getElementById('layar-solo').hidden }));
  cek('tombol hasil bisa ditekan selama Stars masih muncul', diPeta.peta && diPeta.hasil && diPeta.solo, JSON.stringify(diPeta));

  // Gagal: nyawa yang hilang terlihat.
  await page.evaluate(() => { Progres.DURASI_MS.easy = 1200; });
  await mainRanked(page, 1);
  await adaHasil(page);
  await tidur(100);
  const awalNyawa = await page.evaluate(() => [...document.querySelectorAll('.nyawa-ikon')].map((s) => s.classList.contains('kosong')));
  await tidur(800);
  const akhirNyawa = await page.evaluate(() => ({
    kosong: [...document.querySelectorAll('.nyawa-ikon')].map((s) => s.classList.contains('kosong')),
    label: document.getElementById('nyawa-hasil').getAttribute('aria-label'),
    stars: document.getElementById('stars-hasil').hidden,
    hadiah: document.getElementById('hadiah-hasil').hidden,
  }));
  await page.screenshot({ path: path.join(FOTO, 'hasil-gagal.png') });
  cek('gagal: nyawa yang hilang berubah kosong setelah layar muncul', awalNyawa.filter(Boolean).length === 0 && akhirNyawa.kosong.join() === 'false,false,false,false,true', akhirNyawa.kosong.join());
  cek('gagal: tanpa Stars dan tanpa hadiah', akhirNyawa.stars && akhirNyawa.hadiah && akhirNyawa.label === 'Sisa nyawa 4 dari 5', akhirNyawa.label);

  // Practice tidak menampilkan baris Tantangan.
  await klik(page, 'tombol-level-practice');
  await tidur(800);
  await isiPractice(page, 1);
  await klik(page, 'tombol-kunci');
  await adaHasil(page);
  await tidur(900);
  const practice = await page.evaluate(() => ['stars-hasil', 'nyawa-hasil', 'hadiah-hasil', 'saran-hasil'].map((i) => document.getElementById(i).hidden));
  cek('Practice: tanpa Stars, nyawa, hadiah, dan saran', practice.every(Boolean), practice.join());
  cek('Practice: tetap menampilkan waktu', /^Waktu \d+:\d\d, kunci salah 0 kali$/.test(await teksDi(page, 'detail-hasil')));
  await page.close();

  // Gerak dikurangi: Stars langsung tampil.
  const kurang = await browser.newPage();
  await kurang.setViewport({ width: 390, height: 844 });
  kurang.on('pageerror', (e) => galat.push('pageerror: ' + e.message));
  await kurang.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await kurang.goto(HALAMAN);
  await kurang.evaluate(() => localStorage.clear());
  await kurang.reload();
  await tidur(400);
  await bukaPeta(kurang);
  await mainRanked(kurang, 1);
  await isiRanked(kurang, 1);
  await klik(kurang, 'tombol-kunci');
  await adaHasil(kurang);
  await tidur(1300);
  const diam = await kurang.evaluate(() => ({
    op: [...document.querySelectorAll('#stars-hasil .dapat')].map((s) => Number(getComputedStyle(s).opacity)),
    skala: [...document.querySelectorAll('#stars-hasil .dapat')].map((s) => s.style.scale),
    detail: document.getElementById('detail-hasil').textContent,
  }));
  cek('gerak dikurangi: Stars tampil tanpa animasi skala', diam.op.length === 3 && diam.op.every((o) => o > 0.97) && diam.skala.every((x) => x === ''), JSON.stringify(diam.skala));
  cek('gerak dikurangi: waktu langsung terbaca', /^Sisa waktu \d+:\d\d · Kunci salah 0 kali$/.test(diam.detail), diam.detail);
  await kurang.close();

  // Ukuran layar: kasus terpanjang, dengan saran dan tiga tombol.
  for (const u of [{ nama: 'hp-kecil', width: 360, height: 640 }, { nama: 'hp-lanskap', width: 740, height: 360 }, { nama: 'tablet', width: 1024, height: 768 }]) {
    const hal = await bukaHalaman(browser, { width: u.width, height: u.height }, galat, { bukaSemua: false });
    await bukaPeta(hal);
    await hal.evaluate(() => { Progres.DURASI_MS.easy = 12000; });
    await mainRanked(hal, 1);
    await menangSaatSisa(hal, 1, 2);
    await tidur(60);
    const tabrak = await hal.evaluate(() => {
      const t = document.querySelector('.toast:not(.keluar)');
      if (!t) return false;
      const a = t.getBoundingClientRect();
      const b = document.querySelector('#layar-hasil .kotak-kaca').getBoundingClientRect();
      return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    });
    cek(u.nama + ': pesan melayang tidak menimpa kotak hasil', !tabrak);
    await tidur(1300);
    const muat = await hal.evaluate((w, t) => {
      const kotak = document.querySelector('.kotak-kaca');
      const luar = [...document.querySelectorAll('.kotak-kaca, .kotak-kaca button:not([hidden]), #stars-hasil, #saran-hasil')].filter((e) => {
        const q = e.getBoundingClientRect();
        return q.left < -0.5 || q.top < -0.5 || q.right > w + 0.5 || q.bottom > t + 0.5;
      }).map((e) => e.id || e.className);
      return { luar, gulir: kotak.scrollHeight - kotak.clientHeight };
    }, u.width, u.height);
    cek(u.nama + ': layar hasil terpanjang muat tanpa perlu digulir', muat.luar.length === 0 && muat.gulir <= 1, JSON.stringify(muat));
    await hal.screenshot({ path: path.join(FOTO, 'hasil-' + u.nama + '.png') });
    await hal.close();
  }
}

async function ujiToast(browser, galat) {
  console.log('== Teks melayang ==');
  const page = await bukaHalaman(browser, { width: 390, height: 844 }, galat, { bukaSemua: false });
  await bukaPeta(page);

  // Jejak penuh: fade in, naik terus tanpa mundur, lalu fade out sampai hilang.
  const jejak = await jejakToast(page, 4);
  const d = jejak.data;
  const puncak = Math.max(...d.map((x) => x.o));
  const langkah = d.slice(1).map((x, i) => x.y - d[i].y);
  cek('toast: tampil sekitar 3 detik', jejak.lama > 2800 && jejak.lama < 3700, `${Math.round(jejak.lama)} ms`);
  cek('toast: fade in, penuh, lalu fade out', d[0].o < 0.5 && puncak > 0.99 && d[d.length - 1].o < 0.2, `${d[0].o.toFixed(2)} -> ${puncak.toFixed(2)} -> ${d[d.length - 1].o.toFixed(2)}`);
  cek('toast: terus naik dan tidak pernah mundur', d[d.length - 1].y < d[0].y - 20 && Math.max(...langkah) < 0.6, `${(d[0].y - d[d.length - 1].y).toFixed(1)} px, mundur terbesar ${Math.max(...langkah).toFixed(2)} px`);
  cek('toast: gerakan halus, tanpa lompatan', Math.min(...langkah) > -6, `lompatan terbesar ${Math.abs(Math.min(...langkah)).toFixed(2)} px per bingkai, ${d.length} bingkai`);

  await page.evaluate(() => document.querySelectorAll('.tombol-level')[4].click());
  await tidur(600);
  const awal = await toastDi(page);
  await page.screenshot({ path: path.join(FOTO, 'toast-peringatan.png') });
  const menimpa = await menimpaDi(page, ['.status-peta', '#daftar-level', '#keterangan-peta']);
  cek('toast di peta berada di atas, tanpa menimpa status, keterangan, atau daftar level', awal.atas < 30 && menimpa.length === 0, `atas ${Math.round(awal.atas)}, ${menimpa.join(', ')}`);
  cek('toast peringatan: satu baris berisi level yang terkunci', awal.jenis === 'peringatan' && awal.teks === 'Level 5 terkunci' && awal.sub === null, JSON.stringify(awal));
  const merahStatis = await page.$eval('#keterangan-peta', (e) => ({ warna: getComputedStyle(e).color, merah: e.classList.contains('peringatan') }));
  cek('warna peringatan sama dengan tulisan merah di atas level', merahStatis.merah && awal.warna === merahStatis.warna && awal.warna === 'rgb(255, 107, 125)', `${awal.warna} / ${merahStatis.warna}`);
  cek('toast: durasi 3 detik, tanpa gradasi, tidak menghalangi sentuhan', awal.durasi === '3s' && awal.gradasi === 'none none' && awal.sentuh === 'none', `${awal.durasi}, ${awal.gradasi}, ${awal.sentuh}`);
  const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  cek('toast: font sama dengan judul game, dan tebal', awal.font === bodyFont && awal.berat >= 800, `${awal.berat}`);
  await tidur(3000);

  // Pesan baru menggantikan yang lama.
  await page.evaluate(() => { document.querySelectorAll('.tombol-level')[5].click(); });
  await tidur(60);
  await page.evaluate(() => { document.querySelectorAll('.tombol-level')[6].click(); });
  await tidur(120);
  const ganti = await toastDi(page);
  cek('pesan baru menggantikan yang lama, tidak bertumpuk', ganti.jumlah === 1 && ganti.teks === 'Level 7 terkunci', JSON.stringify({ jumlah: ganti.jumlah, teks: ganti.teks }));
  await tidur(500);
  const sisaLama = await page.evaluate(() => document.querySelectorAll('.toast').length);
  cek('pesan lama benar-benar hilang setelah digantikan', sisaLama === 1, `tersisa ${sisaLama}`);

  // Perayaan: warna emas polos.
  await pilihLevel(page, 1);
  await klik(page, 'tombol-mode-practice');
  await tidur(800);
  await isiPractice(page, 1);
  await klik(page, 'tombol-kunci');
  await tidur(300);
  const raya = await toastDi(page);
  await page.screenshot({ path: path.join(FOTO, 'toast-perayaan.png') });
  cek('toast perayaan: emas polos tanpa gradasi', raya.jenis === 'perayaan' && raya.teks === 'Latihan selesai!' && raya.warna === 'rgb(250, 226, 66)' && raya.gradasi === 'none none', `${raya.warna}, ${raya.gradasi}`);
  await adaHasil(page);
  await tidur(300);
  const diAtasHasil = await page.evaluate(() => {
    const t = document.querySelector('.toast');
    return !!t && Number(getComputedStyle(document.getElementById('lapisan-toast')).zIndex) > Number(getComputedStyle(document.getElementById('layar-hasil')).zIndex);
  });
  cek('toast tetap terlihat di atas layar hasil', diAtasHasil);

  // Tantangan: rekor baru dan level terbuka dalam satu pesan.
  await klik(page, 'tombol-level-lanjut');
  await tidur(800);
  await isiRanked(page, 1);
  await klik(page, 'tombol-kunci');
  await tidur(300);
  const rekor = await toastDi(page);
  cek('Tantangan menang: rekor baru dan level yang terbuka', rekor.jenis === 'perayaan' && rekor.teks === 'Rekor baru! +3 ⭐' && rekor.sub === 'Level 2 terbuka', JSON.stringify({ t: rekor.teks, s: rekor.sub }));
  await adaHasil(page);
  await klik(page, 'tombol-level-ulang');
  await tidur(900);

  // Penalti dan peringatan di dalam permainan.
  await klik(page, 'tombol-kunci');
  await tidur(200);
  const slotKosong = await toastDi(page);
  cek('kunci saat papan belum penuh: toast peringatan', slotKosong.jenis === 'peringatan' && slotKosong.teks === 'Isi semua slot dulu');
  await isiRanked(page, 1, { tukar: true });
  await klik(page, 'tombol-kunci');
  await tidur(300);
  const penalti = await toastDi(page);
  await page.screenshot({ path: path.join(FOTO, 'toast-penalti.png') });
  cek('kunci salah: toast penalti merah polos', penalti.jenis === 'penalti' && penalti.teks === '−15 detik' && penalti.warna === 'rgb(255, 107, 125)' && penalti.gradasi === 'none none', `${penalti.teks}, ${penalti.warna}`);
  const tutupTimer = await menimpaDi(page, ['.bar-solo']);
  cek('toast di papan tidak menutupi timer', tutupTimer.length === 0, `atas ${Math.round(penalti.atas)}`);

  await page.evaluate(() => { Progres.DURASI_MS.easy = 1200; });
  await klik(page, 'tombol-solo-keluar');
  await tidur(300);
  await klik(page, 'tombol-yakin-keluar');
  await tidur(900);
  await page.close();

  // Petunjuk terkunci dan waktu habis.
  const hal = await bukaHalaman(browser, { width: 1024, height: 768 }, galat, { bukaSemua: false });
  await bukaPeta(hal);
  await hal.evaluate(() => { Progres.DURASI_MS.easy = 1500; });
  await mainRanked(hal, 1);
  await adaHasil(hal);
  await tidur(200);
  const habis = await toastDi(hal);
  cek('waktu habis: toast penalti', habis && habis.teks === 'Waktu habis!' && habis.jenis === 'penalti', habis && habis.teks);
  await hal.close();

  const petunjuk = await bukaHalaman(browser, { width: 1024, height: 768 }, galat);
  await keLevel(petunjuk, 5);
  const dari = await petunjuk.evaluate(() => DataLevel[4].practice.papan.findIndex((k) => k !== null));
  await petunjuk.mouse.click((await tengah(petunjuk, '.slot', dari)).x, (await tengah(petunjuk, '.slot', dari)).y);
  await tidur(150);
  const kunciPetunjuk = await toastDi(petunjuk);
  cek('menyentuh petunjuk: toast peringatan', kunciPetunjuk && kunciPetunjuk.teks === 'Kartu petunjuk terkunci' && kunciPetunjuk.jenis === 'peringatan');
  await petunjuk.close();

  // Gerak dikurangi: hanya fade, tanpa gerak naik.
  const kurang = await browser.newPage();
  await kurang.setViewport({ width: 390, height: 844 });
  kurang.on('pageerror', (e) => galat.push('pageerror: ' + e.message));
  await kurang.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await kurang.goto(HALAMAN);
  await kurang.evaluate(() => localStorage.clear());
  await kurang.reload();
  await tidur(400);
  await bukaPeta(kurang);
  await kurang.evaluate(() => document.querySelectorAll('.tombol-level')[4].click());
  await tidur(700);
  const diam = await toastDi(kurang);
  cek('gerak dikurangi: hanya fade, tanpa gerak naik', diam.animasi === 'none' && diam.geser === '' && diam.opacity > 0.97, `${diam.animasi}, '${diam.geser}', ${diam.opacity}`);
  await kurang.close();
}

// Memasang semua kartu benar, dan mengambil kartu yang sudah terbuka lebih dulu.
async function isiBenar(page, nomor, jenis, langkah = 4) {
  const { solusi, tersedia, papanAwal } = await page.evaluate((i, j) => ({
    solusi: Puzzle.cariSolusi(DataLevel[i][j])[0],
    tersedia: DataLevel[i][j].tersedia,
    papanAwal: DataLevel[i][j].papan,
  }), nomor - 1, jenis);
  let sisa = papanAwal.flatMap((k, i) => (k === null ? [i] : []));
  while (sisa.length) {
    const tertutup = await page.evaluate(() => [...document.querySelectorAll('.sedia')].map((b) => b.classList.contains('tertutup')));
    const slot = sisa.find((i) => !tertutup[tersedia.indexOf(solusi[i])]);
    if (slot === undefined) throw new Error('Level ' + nomor + ': semua kartu yang dibutuhkan masih tertutup');
    for (let coba = 1; ; coba++) {
      await seret(page, await tengah(page, '.sedia', tersedia.indexOf(solusi[slot])), await tengah(page, '.slot', slot), { langkah, tahanMs: 120 }); // lebih singkat bisa terhitung lemparan
      await tenang(page);
      if (tertutup.some(Boolean)) await tidur(380); // kartu yang terbuka sedang membalik
      if ((await papan(page))[slot] !== 'kosong') break;
      if (coba >= 3) throw new Error(`Level ${nomor}: kartu gagal dipasang di slot ${slot} setelah 3 kali seret`);
      console.log(`   ulang seret: level ${nomor}, slot ${slot}`);
      await tidur(400);
    }
    sisa = sisa.filter((i) => i !== slot);
  }
}

async function isiPractice(page, nomor) {
  await isiBenar(page, nomor, 'practice');
}

async function ujiChapter(browser, galat) {
  console.log('== Chapter dan Kartu Tersembunyi ==');
  const page = await bukaHalaman(browser, { width: 390, height: 844 }, galat, { bukaSemua: false });
  const rekorSemua = (sampai, stars) => {
    const r = {};
    for (let n = 1; n <= sampai; n++) r[n] = stars;
    return r;
  };
  await bukaPeta(page);
  const judul = await page.$$eval('.judul-chapter', (e) => e.map((x) => x.textContent));
  cek('peta menampilkan tiga chapter', judul.join('|') === 'Chapter 1: Rookie Solver|Chapter 2: Pattern Master|Chapter 3: Logic Expert', judul.join('|'));
  const isiGrid = await page.$$eval('.grid-level', (g) => g.map((x) => x.children.length));
  cek('setiap chapter berisi 50 level', isiGrid.join() === '50,50,50', isiGrid.join());
  await page.screenshot({ path: path.join(FOTO, 'chapter-peta.png') });

  // Karusel chapter.
  const tabAktif = (p) => p.$$eval('.titik', (e) => e.map((x) => x.getAttribute('aria-selected')).join());
  const posisiGeser = (p) => p.evaluate(() => Math.round(document.getElementById('daftar-level').scrollLeft));
  const lebarHal = await page.evaluate(() => document.getElementById('halaman-chapter-2').offsetLeft - document.getElementById('halaman-chapter-1').offsetLeft);
  const tataKarusel = await page.evaluate(() => ({
    titik: document.querySelectorAll('.titik[role="tab"]').length,
    sebelum: document.getElementById('chapter-sebelum').disabled,
    gulirHalaman: document.documentElement.scrollWidth - innerWidth,
    gulirPeta: document.getElementById('layar-peta').scrollWidth - document.getElementById('layar-peta').clientWidth,
  }));
  cek('karusel: tiga titik chapter, Chapter 1 aktif, panah kiri mati', tataKarusel.titik === 3 && tataKarusel.sebelum && (await tabAktif(page)) === 'true,false,false', JSON.stringify(tataKarusel));
  cek('karusel: tidak ada gulir ke samping di luar karusel', tataKarusel.gulirHalaman <= 0 && tataKarusel.gulirPeta <= 0, JSON.stringify(tataKarusel));
  await page.click('#chapter-berikut');
  await tidur(800);
  cek('karusel: panah kanan bergeser tepat ke Chapter 2', (await tabAktif(page)) === 'false,true,false' && Math.abs((await posisiGeser(page)) - lebarHal) <= 2, (await posisiGeser(page)) + ' vs ' + lebarHal);
  const bisaDisentuh = await page.evaluate(() => {
    const b = document.querySelectorAll('.tombol-level')[50];
    const r = b.getBoundingClientRect();
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return el && el.closest('.tombol-level') === b;
  });
  cek('karusel: level 51 terlihat di layar dan bisa disentuh', bisaDisentuh);
  await page.screenshot({ path: path.join(FOTO, 'chapter-karusel-2.png') });
  await page.evaluate((w) => document.getElementById('daftar-level').scrollTo({ left: w * 2, behavior: 'instant' }), lebarHal);
  await tidur(250);
  cek('karusel: geseran jari memperbarui titik, dan panah kanan mati di ujung', (await tabAktif(page)) === 'false,false,true' && await page.$eval('#chapter-berikut', (e) => e.disabled));
  await page.focus('.titik[aria-selected="true"]');
  await page.keyboard.press('ArrowLeft');
  await tidur(800);
  cek('karusel: tombol panah keyboard pindah chapter dan fokus ikut', (await tabAktif(page)) === 'false,true,false' && await page.evaluate(() => document.activeElement.getAttribute('aria-selected') === 'true'));
  await page.click('.titik');
  await tidur(800);
  cek('karusel: titik bisa diketuk langsung', (await tabAktif(page)) === 'true,false,false' && (await posisiGeser(page)) <= 2);

  // Syarat Total Stars.
  await isiProgres(page, { rekor: rekorSemua(50, 1), totalStars: 74, wallet: 74 });
  await bukaPeta(page);
  const aturan2 = await page.$$eval('.aturan-chapter', (e) => e[1].textContent);
  cek('Chapter 2 terkunci kalau Total Stars kurang', aturan2 === 'Butuh 75\u00a0⭐ Total Stars. Sekarang 74\u00a0⭐', aturan2);
  await page.evaluate(() => document.querySelectorAll('.tombol-level')[50].click());
  await tidur(200);
  const tolak = await page.evaluate(() => ({ dialog: document.getElementById('dialog-mode').hidden, teks: document.getElementById('keterangan-peta').textContent }));
  cek('level 51 menolak dan menyebut syarat Stars', tolak.dialog && tolak.teks.includes('Butuh 75'), tolak.teks);
  await isiProgres(page, { rekor: rekorSemua(50, 1), totalStars: 75, wallet: 75 });
  await bukaPeta(page);
  const buka21 = await page.evaluate(() => ({ b21: document.querySelectorAll('.tombol-level')[50].classList.contains('terkunci'), b22: document.querySelectorAll('.tombol-level')[51].classList.contains('terkunci') }));
  cek('Total Stars cukup membuka level 51, tetapi belum level 52', !buka21.b21 && buka21.b22, JSON.stringify(buka21));

  // Chapter 2: kartu dengan beberapa simbol bisa dimainkan.
  await mainRanked(page, 51);
  await page.waitForFunction(() => document.getElementById('layar-peta').hidden, { timeout: 2000 });
  cek('peta benar-benar tertutup setelah level dimulai', true);
  await tidur(300);
  await page.screenshot({ path: path.join(FOTO, 'chapter-2-main.png') });
  await isiBenar(page, 51, 'ranked');
  await klik(page, 'tombol-kunci');
  await adaHasil(page);
  await tidur(400);
  cek('level pertama Chapter 2 bisa dimenangkan', (await teksDi(page, 'judul-hasil')) === 'Level 51 selesai!');
  await page.close();

  // Chapter 3.
  const c3 = await bukaHalaman(browser, { width: 390, height: 844 }, galat, { bukaSemua: false });
  await isiProgres(c3, { rekor: rekorSemua(100, 2), totalStars: 200, wallet: 200 });
  await bukaPeta(c3);
  await mainRanked(c3, 101);
  await c3.screenshot({ path: path.join(FOTO, 'chapter-3-tutup.png') });
  const d = await c3.evaluate(() => DataLevel[100].ranked);
  const nomorTutup = d.tersedia.indexOf(d.tutup[0]);
  const awal = await c3.evaluate((n) => {
    const b = document.querySelectorAll('.sedia')[n];
    return { tutup: b.classList.contains('tertutup'), label: b.getAttribute('aria-label'), teks: b.textContent.trim(), jumlah: document.querySelectorAll('.sedia.tertutup').length };
  }, nomorTutup);
  cek('level 101 dimulai dengan kartu tertutup', awal.tutup === true && awal.jumlah === d.tutup.length, JSON.stringify(awal));
  if (awal.tutup) {
    cek('kartu tertutup tampil tanpa isi, dan labelnya tidak membocorkan kartu', awal.label === 'Kartu tertutup' && awal.teks === '?', JSON.stringify(awal));
    const q = await tengah(c3, '.sedia', nomorTutup);
    const k = await c3.evaluate((i) => DataLevel[i].ranked.papan.indexOf(null), 100);
    const tuju = await tengah(c3, '.slot', k);
    await seret(c3, q, tuju, { langkah: 4, tahanMs: 80 });
    await tidur(150);
    const seretan = await c3.evaluate(() => document.querySelectorAll('.hantu').length);
    const papanKini = await papan(c3);
    cek('kartu tertutup tidak bisa diseret', seretan === 0 && papanKini[k] === 'kosong');
    await c3.mouse.click(q.x, q.y);
    await tidur(150);
    const psn = await toastDi(c3);
    cek('mengetuk kartu tertutup memberi tahu cara membukanya', psn.teks === 'Kartu masih tertutup' && (await teksDi(c3, 'pesan-solo')).includes('Bentuk rasi'), psn.teks);
    await c3.evaluate((n) => { document.querySelectorAll('.sedia')[n].focus(); }, nomorTutup);
    await c3.keyboard.press('Enter');
    await tidur(80);
    cek('kartu tertutup juga tidak bisa dipilih dengan keyboard', await c3.evaluate(() => document.querySelectorAll('.sedia.dipilih').length) === 0);
  }
  await isiBenar(c3, 101, 'ranked');
  const terbuka = await c3.evaluate(() => document.querySelectorAll('.sedia.tertutup').length);
  await klik(c3, 'tombol-kunci');
  await adaHasil(c3);
  await tidur(400);
  cek('level pertama Chapter 3 bisa dimenangkan, dan kartunya terbuka', terbuka === 0 && (await teksDi(c3, 'judul-hasil')) === 'Level 101 selesai!', 'tertutup ' + terbuka);
  await c3.close();

  // Membuka kartu dengan membentuk rasi, pada level yang kartu pentingnya tertutup.
  const b = await bukaHalaman(browser, { width: 390, height: 844 }, galat);
  await keLevel(b, 130);
  const lv = await b.evaluate(() => ({ p: DataLevel[129].practice, sol: Puzzle.cariSolusi(DataLevel[129].practice)[0] }));
  const sebelum = await b.$$eval('.sedia.tertutup', (e) => e.length);
  await b.screenshot({ path: path.join(FOTO, 'chapter-3-sulit.png') });
  await isiBenar(b, 130, 'practice');
  const sisaTutup = await b.$$eval('.sedia.tertutup', (e) => e.length);
  await tidur(350);
  cek('level sulit: kartu tertutup terbuka sambil bermain', sebelum >= 1 && sisaTutup < sebelum, sebelum + ' -> ' + sisaTutup);
  const lebar = await b.$$eval('.sedia', (e) => Math.min(...e.map((x) => x.getBoundingClientRect().width)));
  cek('animasi balik kartu selesai dan kartu kembali tegak', lebar > 20, 'lebar terkecil ' + lebar);
  await klik(b, 'tombol-kunci');
  await adaHasil(b);
  cek('level sulit bisa dimenangkan lewat seret', (await teksDi(b, 'judul-hasil')) === 'Level 130 selesai!');
  await klik(b, 'tombol-level-peta');
  await tidur(900);
  const kembali = await b.evaluate(() => {
    const t = document.querySelectorAll('.tombol-level')[129].getBoundingClientRect();
    return { tab: [...document.querySelectorAll('.titik')].map((x) => x.getAttribute('aria-selected')).join(), x: t.left, w: innerWidth };
  });
  cek('kembali ke peta dari level 130 mendarat di Chapter 3, tombolnya terlihat', kembali.tab === 'false,false,true' && kembali.x >= 0 && kembali.x < kembali.w, JSON.stringify(kembali));
  await b.close();

  // Gerak dikurangi: pegas tidak berjalan, tetapi kartu tetap harus terbuka dan terlihat.
  const rm = await bukaHalaman(browser, { width: 390, height: 844 }, galat);
  await rm.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await keLevel(rm, 130);
  await isiBenar(rm, 130, 'practice');
  const lebarRm = await rm.$$eval('.sedia', (e) => Math.min(...e.map((x) => x.getBoundingClientRect().width)));
  const tutupRm = await rm.$$eval('.sedia.tertutup', (e) => e.length);
  cek('gerak dikurangi: kartu terbuka tanpa hilang dari layar', lebarRm > 20 && tutupRm === 0, 'lebar ' + lebarRm + ', tertutup ' + tutupRm);
  await rm.close();

  // Pesan menang harus jujur soal apa yang terbuka.
  const kurangBintang = await bukaHalaman(browser, { width: 390, height: 844 }, galat, { bukaSemua: false });
  await isiProgres(kurangBintang, { rekor: rekorSemua(49, 1), totalStars: 49, wallet: 49 });
  await bukaPeta(kurangBintang);
  await mainRanked(kurangBintang, 50);
  await isiBenar(kurangBintang, 50, 'ranked');
  await klik(kurangBintang, 'tombol-kunci');
  await tidur(120);
  const psnKurang = await toastDi(kurangBintang);
  cek('level 50 dengan Stars kurang: tidak mengaku Chapter 2 terbuka', psnKurang.sub === 'Butuh 75 ⭐ untuk Chapter 2', psnKurang.sub);
  await adaHasil(kurangBintang);
  await tidur(400);
  const lanjutKurang = await kurangBintang.evaluate(() => document.getElementById('tombol-level-lanjut').hidden);
  cek('level 50 dengan Stars kurang: tidak ada tombol level berikutnya', lanjutKurang);
  await isiProgres(kurangBintang, { rekor: { ...rekorSemua(50, 1), 1: 1 }, totalStars: 74, wallet: 74 });
  await bukaPeta(kurangBintang);
  await mainRanked(kurangBintang, 1);
  await isiBenar(kurangBintang, 1, 'ranked');
  await klik(kurangBintang, 'tombol-kunci');
  await tidur(120);
  const psnBuka = await toastDi(kurangBintang);
  cek('mengulang level lama sampai Stars cukup: Chapter 2 terbuka', psnBuka.sub === 'Chapter 2 terbuka', psnBuka.sub);
  await adaHasil(kurangBintang);
  await tidur(400);
  await klik(kurangBintang, 'tombol-level-peta');
  await tidur(600);
  const sebelumGeser = await kurangBintang.$$eval('.titik', (e) => e.map((x) => x.getAttribute('aria-selected')).join());
  await tidur(1400);
  const sesudahGeser = await kurangBintang.$$eval('.titik', (e) => e.map((x) => x.getAttribute('aria-selected')).join());
  cek('chapter baru terbuka: peta kembali ke Chapter 1, lalu bergeser sendiri ke Chapter 2', sebelumGeser === 'true,false,false' && sesudahGeser === 'false,true,false', sebelumGeser + ' -> ' + sesudahGeser);
  await kurangBintang.screenshot({ path: path.join(FOTO, 'chapter-2-terbuka.png') });
  await kurangBintang.close();

  // Keterbacaan dan tata letak di HP kecil.
  for (const u of [{ nama: 'hp-kecil', width: 360, height: 640 }, { nama: 'hp-lanskap', width: 740, height: 360 }]) {
    const h = await bukaHalaman(browser, { width: u.width, height: u.height }, galat);
    await keLevel(h, 150);
    const luar = await h.evaluate((w, t) => [...document.querySelectorAll('.slot, .sedia, #tombol-kunci, .tombol-item')].filter((e) => {
      const q = e.getBoundingClientRect();
      return q.left < -0.5 || q.top < -0.5 || q.right > w + 0.5 || q.bottom > t + 0.5;
    }).length, u.width, u.height);
    cek(u.nama + ': level 150 muat di layar', luar === 0, 'keluar ' + luar);
    await h.screenshot({ path: path.join(FOTO, 'chapter-150-' + u.nama + '.png') });
    await h.close();
  }
}

async function ujiPeta(browser, galat) {
  console.log('== Peta level ==');
  const page = await bukaHalaman(browser, { width: 390, height: 844 }, galat, { bukaSemua: false });
  page.on('dialog', (d) => d.accept());
  await bukaPeta(page);
  await tidur(500);
  await page.screenshot({ path: path.join(FOTO, 'peta-awal.png') });
  const peta = () => page.evaluate(() => ({
    terkunci: document.querySelectorAll('.tombol-level.terkunci').length,
    nyawa: document.getElementById('stat-nyawa').textContent,
    pulih: document.getElementById('stat-pulih').textContent,
    wallet: document.getElementById('stat-wallet').textContent,
    total: document.getElementById('stat-total').textContent,
    maks: document.getElementById('stat-maks').textContent,
  }));
  let s = await peta();
  cek('progres kosong: hanya level 1 terbuka', s.terkunci === 149, 'terkunci=' + s.terkunci);
  cek('peta menampilkan nyawa, Wallet, dan Total Stars', s.nyawa === '5/5' && s.pulih === 'Penuh' && s.wallet === '0 ⭐' && s.total === '0 ⭐' && s.maks === 'Dari 450 ⭐', JSON.stringify(s));

  // Level terkunci menjelaskan caranya, tanpa membuka dialog.
  await page.evaluate(() => document.querySelectorAll('.tombol-level')[4].click());
  await tidur(250);
  const tolak = await page.evaluate(() => ({
    dialog: document.getElementById('dialog-mode').hidden,
    teks: document.getElementById('keterangan-peta').textContent,
    merah: document.getElementById('keterangan-peta').classList.contains('peringatan'),
    label: document.querySelectorAll('.tombol-level')[4].getAttribute('aria-label'),
  }));
  await page.screenshot({ path: path.join(FOTO, 'peta-tolak.png') });
  cek('K-3: level terkunci menjelaskan cara membukanya, tanpa dialog', tolak.dialog && tolak.merah && tolak.teks.includes('level 4') && tolak.label === 'Level 5, terkunci', JSON.stringify(tolak));

  // Practice tidak membuka level, dan langsung menawarkan Tantangan.
  await pilihLevel(page, 1);
  await klik(page, 'tombol-mode-practice');
  await tidur(800);
  await isiPractice(page, 1);
  await klik(page, 'tombol-kunci');
  await adaHasil(page);
  await tidur(400);
  const tawaran = await teksDi(page, 'tombol-level-lanjut');
  await page.screenshot({ path: path.join(FOTO, 'peta-tawaran.png') });
  cek('Practice dengan level berikutnya terkunci menawarkan Tantangan', tawaran === 'Main Tantangan', tawaran);
  await klik(page, 'tombol-level-lanjut');
  await tidur(800);
  const p = await progresDi(page);
  const main = await page.evaluate(() => document.getElementById('layar-solo').classList.contains('ranked'));
  cek('tawaran itu benar-benar memulai Tantangan', main && p.berjalan === 1 && p.nyawa === 4);

  // Menang: level berikutnya terbuka dan Stars tampil di peta.
  await isiRanked(page, 1);
  await klik(page, 'tombol-kunci');
  await adaHasil(page);
  await tidur(400);
  await klik(page, 'tombol-level-peta');
  await tidur(120);
  const sesudah = await page.evaluate(() => {
    const b = document.querySelectorAll('.tombol-level');
    return {
      bawah: b[0].querySelector('.bawah').textContent,
      label: b[0].getAttribute('aria-label'),
      efekStars: b[0].classList.contains('baru-selesai'),
      efekBuka: b[1].classList.contains('baru-terbuka'),
      terkunci2: b[1].classList.contains('terkunci'),
      terkunci: document.querySelectorAll('.tombol-level.terkunci').length,
    };
  });
  await tidur(700);
  await page.screenshot({ path: path.join(FOTO, 'peta-menang.png') });
  cek('P-06: menang membuka level berikutnya dengan efek', !sesudah.terkunci2 && sesudah.terkunci === 148 && sesudah.efekBuka, JSON.stringify(sesudah));
  cek('S-09: Stars per level tampil di peta', sesudah.bawah === '⭐⭐⭐' && sesudah.label === 'Level 1, 3 Stars' && sesudah.efekStars, sesudah.label);
  s = await peta();
  cek('status peta mengikuti hasil', s.nyawa === '5/5' && s.wallet === '3 ⭐' && s.total === '3 ⭐', JSON.stringify(s));

  // Practice sesudah level berikutnya terbuka menawarkan level berikutnya.
  await pilihLevel(page, 1);
  await klik(page, 'tombol-mode-practice');
  await tidur(800);
  await isiPractice(page, 1);
  await klik(page, 'tombol-kunci');
  await adaHasil(page);
  await tidur(300);
  cek('Practice dengan level berikutnya terbuka menawarkan level berikutnya', (await teksDi(page, 'tombol-level-lanjut')) === 'Level berikutnya');
  await klik(page, 'tombol-level-peta');
  await tidur(700);

  // Hitung mundur nyawa di peta.
  await isiProgres(page, { nyawa: 2, pulihSejak: Date.now() - 60000, rekor: { 1: 2 }, wallet: 2, totalStars: 2 });
  await bukaPeta(page);
  s = await peta();
  const pulih1 = s.pulih;
  await tidur(2200);
  s = await peta();
  await page.screenshot({ path: path.join(FOTO, 'peta-pulih.png') });
  cek('peta menampilkan hitung mundur nyawa yang berjalan', s.nyawa === '2/5' && /^\+1 dalam 18:\d\d$/.test(s.pulih) && s.pulih !== pulih1, pulih1 + ' -> ' + s.pulih);

  // Nyawa pulih saat peta terbuka.
  await isiProgres(page, { nyawa: 2, pulihSejak: Date.now() - 20 * 60000 + 1500 });
  await bukaPeta(page);
  await tidur(2300);
  s = await peta();
  cek('nyawa bertambah sendiri saat peta terbuka', s.nyawa === '3/5', s.nyawa);

  // Saklar uji main.
  await isiProgres(page, {});
  await bukaPeta(page);
  await klik(page, 'tombol-buka-semua');
  await tidur(150);
  s = await peta();
  cek('Buka semua level: semua terbuka untuk uji main', s.terkunci === 0 && (await teksDi(page, 'tombol-buka-semua')).includes('nyala'));
  await pilihLevel(page, 5);
  const pilih = await page.evaluate(() => ({
    ranked: document.getElementById('tombol-mode-ranked').disabled,
    practice: document.getElementById('tombol-mode-practice').disabled,
    alasan: document.getElementById('alasan-mode').textContent,
  }));
  await page.screenshot({ path: path.join(FOTO, 'peta-buka-semua.png') });
  cek('Buka semua level: hanya Practice, Tantangan tetap terkunci', pilih.ranked && !pilih.practice && pilih.alasan.includes('level 4'), pilih.alasan);
  await klik(page, 'tombol-mode-batal');
  await tidur(500);
  await klik(page, 'tombol-reset-progres');
  await tidur(150);
  await page.reload();
  await tidur(500);
  await bukaPeta(page);
  s = await peta();
  cek('Buka semua level bertahan setelah reset progres dan muat ulang', s.terkunci === 0);
  await klik(page, 'tombol-buka-semua');
  await tidur(150);
  s = await peta();
  cek('Buka semua level bisa dimatikan', s.terkunci === 149);
  await page.close();

  // Ukuran layar.
  for (const u of [{ nama: 'hp-kecil', width: 360, height: 640 }, { nama: 'hp-lanskap', width: 740, height: 360 }, { nama: 'tablet', width: 1024, height: 768 }]) {
    const hal = await bukaHalaman(browser, { width: u.width, height: u.height }, galat, { bukaSemua: false });
    const r = {};
    for (let n = 1; n <= 12; n++) r[n] = (n % 3) + 1;
    await isiProgres(hal, { rekor: r, nyawa: 3, nyawaMaks: 6, pulihSejak: Date.now(), wallet: 123, totalStars: 123 });
    await bukaPeta(hal);
    await tidur(500);
    const luar = await hal.evaluate((w) => {
      const hasil = [];
      const aktif = document.querySelector('.titik[aria-selected="true"]').getAttribute('aria-controls');
      document.querySelectorAll('.stat, .stat b, .stat small, .tombol-level, .tombol-level .bawah').forEach((e) => {
        const halaman = e.closest('.halaman-chapter');
        if (halaman && halaman.id !== aktif) return;
        const q = e.getBoundingClientRect();
        const induk = (e.closest('.stat') || e.closest('.tombol-level')).getBoundingClientRect();
        if (q.left < -0.5 || q.right > w + 0.5 || q.left < induk.left - 0.5 || q.right > induk.right + 0.5) hasil.push(e.className || e.id || e.tagName);
      });
      return hasil;
    }, u.width);
    cek(u.nama + ': status dan Stars di peta muat', luar.length === 0, luar.slice(0, 4).join(' | '));
    await hal.screenshot({ path: path.join(FOTO, 'peta-' + u.nama + '.png') });
    await hal.close();
  }
}

async function ujiRanked(browser, galat) {
  console.log('\n== Tantangan ==');
  const page = await bukaHalaman(browser, { width: 1024, height: 768 }, galat, { bukaSemua: false });
  await bukaPeta(page);

  // Pilih Mode.
  await pilihLevel(page, 1);
  await page.keyboard.press('Escape');
  await tidur(600);
  cek('Pilih Mode: Esc menutup dialog', await page.evaluate(() => document.getElementById('dialog-mode').hidden));

  await pilihLevel(page, 1);
  await page.screenshot({ path: path.join(FOTO, 'ranked-pilih.png') });
  const info = await teksDi(page, 'info-mode');
  const sub = await teksDi(page, 'sub-ranked');
  cek('Pilih Mode: kesulitan, nyawa, dan durasi tampil', info.includes('Nyawa 5/5') && sub.includes('3:00'), `${info} | ${sub}`);
  await page.mouse.click(8, 8);
  await tidur(600);
  cek('Pilih Mode: menekan latar menutup dialog', await page.evaluate(() => document.getElementById('dialog-mode').hidden));

  // Mulai.
  await mainRanked(page, 1);
  let p = await progresDi(page);
  cek('mulai Ranked: nyawa dipotong dan langsung tersimpan', p.nyawa === 4 && p.berjalan === 1, `nyawa=${p.nyawa}, berjalan=${p.berjalan}`);
  const puzzleBenar = await page.evaluate(() => {
    const k = DataLevel[0].ranked.papan.findIndex((x) => x !== null);
    const k2 = Puzzle.DEK[DataLevel[0].ranked.papan[k]];
    return document.querySelectorAll('.slot')[k].getAttribute('aria-label').includes(`${['bintang', 'bulan sabit', 'planet'][k2.bentuk]} ${['emas', 'biru es', 'koral'][k2.warna]}`);
  });
  cek('mulai Ranked: memakai puzzle Ranked, bukan Practice', puzzleBenar);
  const t0 = await detikTimer(page);
  const timerTampil = await page.evaluate(() => !document.getElementById('timer-solo').hidden);
  await tidur(1300);
  const t1 = await detikTimer(page);
  cek('timer tampil dan berjalan', timerTampil && t0 <= 180 && t0 >= 175 && t1 < t0, `${t0} -> ${t1}`);
  await page.screenshot({ path: path.join(FOTO, 'ranked-main.png') });

  // Kunci saat belum penuh tidak kena penalti.
  await klik(page, 'tombol-kunci');
  const t2 = await detikTimer(page);
  cek('kunci saat papan belum penuh: tanpa penalti', t1 - t2 < 3 && (await teksDi(page, 'pesan-solo')).includes('Isi semua'), `${t1} -> ${t2}`);

  // Kunci salah.
  const kosong = await isiRanked(page, 1, { tukar: true });
  const t3 = await detikTimer(page);
  await klik(page, 'tombol-kunci');
  await tidur(120);
  const salah = await page.evaluate(() => ({
    pesan: document.getElementById('pesan-solo').textContent,
    merah: document.getElementById('pesan-solo').classList.contains('salah'),
    garis: document.querySelectorAll('.garis-sorot').length,
    gagal: document.querySelectorAll('.slot.gagal').length,
    penalti: document.querySelectorAll('.toast.penalti').length,
  }));
  const t4 = await detikTimer(page);
  await page.screenshot({ path: path.join(FOTO, 'ranked-salah.png') });
  cek('G-09: kunci salah memotong 15 detik', t3 - t4 >= 15 && t3 - t4 <= 17 && salah.penalti === 1, `${t3} -> ${t4}`);
  cek('kunci salah: letak kesalahan tidak ditunjukkan', salah.pesan === 'Jawaban belum benar.' && salah.merah && salah.garis === 0 && salah.gagal === 0, JSON.stringify(salah));

  // Papan berubah: pesan hilang. Lalu jawaban dibetulkan.
  await seret(page, await tengah(page, '.slot', kosong[kosong.length - 1]), await tengah(page, '.slot', kosong[kosong.length - 2]), { langkah: 4 });
  await tenang(page);
  cek('pesan salah hilang saat papan berubah', (await teksDi(page, 'pesan-solo')) === 'Susun papan sebelum waktu habis.');

  // Menang.
  await klik(page, 'tombol-kunci');
  await tidur(200);
  p = await progresDi(page);
  cek('menang: hasil langsung tersimpan sebelum animasi selesai', p.berjalan === null && p.nyawa === 5 && p.rekor[1] === 3, JSON.stringify({ nyawa: p.nyawa, rekor: p.rekor }));
  const tBeku = await detikTimer(page);
  await tidur(1200);
  cek('menang: timer berhenti', (await detikTimer(page)) === tBeku);
  await adaHasil(page);
  await tidur(500);
  await page.screenshot({ path: path.join(FOTO, 'ranked-menang.png') });
  const menang = await page.evaluate(() => ({
    stars: document.querySelectorAll('#stars-hasil .dapat').length,
    hadiah: document.getElementById('hadiah-hasil').textContent,
    detail: document.getElementById('detail-hasil').textContent,
    lanjut: !document.getElementById('tombol-level-lanjut').hidden,
    uji: JSON.parse(localStorage.getItem('setdoku-uji') || '[]').length,
  }));
  p = await progresDi(page);
  cek('S-09: layar hasil menampilkan 3 Stars dan tambahannya', menang.stars === 3 && menang.hadiah.startsWith('+3\u00a0⭐') && menang.detail.includes('Kunci salah 1 kali'), `${menang.hadiah} | ${menang.detail}`);
  cek('P-02: Total Stars dan Wallet naik bersama', p.totalStars === 3 && p.wallet === 3);
  cek('Ranked tidak masuk data uji main dan daftar latihan', menang.uji === 0 && p.latihan.length === 0);

  // Ulangi: tanpa tambahan Stars.
  await klik(page, 'tombol-level-ulang');
  await tidur(800);
  p = await progresDi(page);
  cek('ulangi Ranked memotong nyawa lagi', p.nyawa === 4 && p.berjalan === 1);
  await isiRanked(page, 1);
  await klik(page, 'tombol-kunci');
  await adaHasil(page);
  await tidur(300);
  p = await progresDi(page);
  const ulangan = await teksDi(page, 'hadiah-hasil');
  cek('rekor sama tidak menambah Stars, dan nyawa kembali', p.totalStars === 3 && p.wallet === 3 && p.nyawa === 5 && ulangan === 'Rekor tetap ⭐⭐⭐', ulangan);

  // Level berikutnya lewat Pilih Mode.
  await klik(page, 'tombol-level-lanjut');
  await tidur(700);
  const lanjut = await page.evaluate(() => ({
    peta: !document.getElementById('layar-peta').hidden,
    judul: document.getElementById('judul-mode').textContent,
    dialog: !document.getElementById('dialog-mode').hidden,
    ranked: document.getElementById('tombol-mode-ranked').disabled,
  }));
  cek('P-06: level berikutnya terbuka dan muncul lewat Pilih Mode', lanjut.peta && lanjut.dialog && lanjut.judul === 'Level 2' && !lanjut.ranked, JSON.stringify(lanjut));
  await page.keyboard.press('Escape');
  await tidur(500);

  // Keluar.
  await mainRanked(page, 2);
  await klik(page, 'tombol-solo-keluar');
  await tidur(450);
  await page.screenshot({ path: path.join(FOTO, 'ranked-keluar.png') });
  const dialog = await teksDi(page, 'teks-keluar');
  cek('keluar: dialog memperingatkan nyawa hilang', dialog.includes('1 nyawa tidak kembali'), dialog);
  await page.keyboard.press('Escape');
  await tidur(600);
  const masihMain = await page.evaluate(() => !document.getElementById('layar-solo').hidden && document.getElementById('dialog-keluar').hidden);
  const tJalan1 = await detikTimer(page);
  await tidur(1200);
  cek('keluar: batal melanjutkan permainan dan timer tidak berhenti', masihMain && (await detikTimer(page)) < tJalan1);
  await klik(page, 'tombol-solo-keluar');
  await tidur(300);
  await klik(page, 'tombol-yakin-keluar');
  await page.waitForFunction(() => document.getElementById('layar-solo').hidden, { timeout: 3000 }).catch(() => {});
  p = await progresDi(page);
  const diPeta = await page.evaluate(() => !document.getElementById('layar-peta').hidden);
  cek('G-10: keluar menghitung gagal dan nyawa tidak kembali', diPeta && p.nyawa === 4 && p.berjalan === null, `nyawa=${p.nyawa}`);

  // Dialog Duel tetap memakai teks Duel.
  await page.evaluate(() => document.getElementById('tombol-peta-keluar').click());
  await tidur(600);
  await klik(page, 'tombol-mulai');
  await tidur(500);
  await klik(page, 'tombol-keluar');
  await tidur(200);
  cek('dialog keluar Duel tetap memakai teks Duel', (await teksDi(page, 'teks-keluar')).includes('Skor'));
  await page.keyboard.press('Escape');
  await tidur(500);
  await klik(page, 'tombol-keluar');
  await tidur(200);
  await klik(page, 'tombol-yakin-keluar');
  await tidur(800);

  // Muat ulang saat bermain.
  await bukaPeta(page);
  await mainRanked(page, 2);
  p = await progresDi(page);
  const nyawaSebelum = p.nyawa;
  await page.reload();
  await tidur(500);
  p = await progresDi(page);
  cek('G-10: muat ulang tidak mengembalikan nyawa', p.nyawa === nyawaSebelum && p.berjalan === null, `nyawa=${p.nyawa}`);
  await bukaPeta(page);
  const peringatan = await page.$eval('#keterangan-peta', (e) => ({ teks: e.textContent, merah: e.classList.contains('peringatan') }));
  await page.screenshot({ path: path.join(FOTO, 'ranked-muat-ulang.png') });
  cek('muat ulang: peta memberi tahu percobaan dihitung gagal', peringatan.merah && peringatan.teks.includes('level 2'), peringatan.teks);
  await page.close();

  // Waktu habis, sambil kartu sedang diseret.
  const habis = await bukaHalaman(browser, { width: 1024, height: 768 }, galat, { bukaSemua: false });
  await bukaPeta(habis);
  await habis.evaluate(() => { Progres.DURASI_MS.easy = 1800; });
  await mainRanked(habis, 1);
  const s0 = await tengah(habis, '.sedia', 0);
  await habis.mouse.move(s0.x, s0.y);
  await habis.mouse.down();
  await habis.mouse.move(s0.x - 80, s0.y - 60, { steps: 5 });
  await adaHasil(habis);
  await habis.mouse.up();
  await tidur(700);
  await habis.screenshot({ path: path.join(FOTO, 'ranked-habis.png') });
  const gagal = await habis.evaluate(() => ({
    judul: document.getElementById('judul-hasil').textContent,
    merah: document.getElementById('judul-hasil').classList.contains('gagal'),
    detail: document.getElementById('detail-hasil').textContent,
    lanjut: document.getElementById('tombol-level-lanjut').hidden,
    ulang: document.getElementById('tombol-level-ulang').textContent,
    practice: !document.getElementById('tombol-level-practice').hidden,
    benar: document.querySelectorAll('.slot.benar').length,
    aktif: document.querySelectorAll('.slot:not(:disabled), .sedia:not(:disabled)').length,
    hantu: document.querySelectorAll('#lapisan-seret .hantu').length,
    stars: document.getElementById('stars-hasil').hidden,
  }));
  p = await progresDi(habis);
  cek('waktu habis: layar gagal, nyawa berkurang, papan terkunci', gagal.judul === 'Waktu habis' && gagal.merah && p.nyawa === 4 && p.berjalan === null && gagal.benar === 0 && gagal.aktif === 0, JSON.stringify(gagal));
  cek('waktu habis saat menyeret: kartu kembali tanpa sisa', gagal.hantu === 0);
  cek('waktu habis: pilihan coba lagi dan latihan, tanpa Stars dan tanpa lanjut', gagal.lanjut && gagal.ulang === 'Coba lagi' && gagal.practice && gagal.stars);

  await habis.evaluate(() => { Progres.DURASI_MS.easy = 180000; });
  await klik(habis, 'tombol-level-practice');
  await tidur(800);
  const latihan = await habis.evaluate(() => ({
    timer: document.getElementById('timer-solo').hidden,
    kelas: document.getElementById('layar-solo').classList.contains('ranked'),
    judul: document.getElementById('judul-level').textContent,
  }));
  cek('dari gagal bisa langsung Practice, tanpa timer', latihan.timer && !latihan.kelas && latihan.judul === 'Level 1', JSON.stringify(latihan));
  await selesaikanLevel(habis, 1);
  p = await progresDi(habis);
  cek('Practice sesudah Ranked tetap memakai aturan Practice', p.latihan.join() === '1' && p.nyawa === 4 && p.totalStars === 0 && !p.rekor[1]);
  await habis.close();

  // Penalti menghabiskan waktu.
  const penalti = await bukaHalaman(browser, { width: 1024, height: 768 }, galat, { bukaSemua: false });
  await bukaPeta(penalti);
  await penalti.evaluate(() => { Progres.DURASI_MS.easy = 9000; });
  await mainRanked(penalti, 1);
  const tandaSorot = await penalti.evaluate(() => ({ hampir: document.getElementById('timer-solo').classList.contains('hampir'), gawat: document.getElementById('timer-solo').classList.contains('gawat') }));
  cek('waktu sedikit: bar waktu memberi peringatan', tandaSorot.hampir && tandaSorot.gawat, JSON.stringify(tandaSorot));
  await isiRanked(penalti, 1, { tukar: true });
  await klik(penalti, 'tombol-kunci');
  await adaHasil(penalti);
  cek('penalti yang menghabiskan waktu dihitung gagal', (await teksDi(penalti, 'judul-hasil')) === 'Waktu habis');
  await penalti.close();

  // Nyawa terakhir habis.
  const akhir = await bukaHalaman(browser, { width: 1024, height: 768 }, galat, { bukaSemua: false });
  await isiProgres(akhir, { nyawa: 1, pulihSejak: Date.now() });
  await bukaPeta(akhir);
  await akhir.evaluate(() => { Progres.DURASI_MS.easy = 1500; });
  await mainRanked(akhir, 1);
  await adaHasil(akhir);
  await tidur(500);
  await akhir.screenshot({ path: path.join(FOTO, 'ranked-nyawa-habis.png') });
  const kosongNyawa = await akhir.evaluate(() => ({
    detail: document.getElementById('detail-hasil').textContent,
    ulang: document.getElementById('tombol-level-ulang').hidden,
    utama: document.getElementById('tombol-level-practice').classList.contains('utama'),
  }));
  cek('nyawa habis: tanpa coba lagi, Practice jadi pilihan utama', kosongNyawa.ulang && kosongNyawa.utama && kosongNyawa.detail.includes('Nyawa habis'), kosongNyawa.detail);

  await klik(akhir, 'tombol-level-peta');
  await tidur(700);
  await pilihLevel(akhir, 1);
  const pilihHabis = await akhir.evaluate(() => ({
    ranked: document.getElementById('tombol-mode-ranked').disabled,
    practice: document.getElementById('tombol-mode-practice').disabled,
    alasan: document.getElementById('alasan-mode').textContent,
  }));
  await akhir.screenshot({ path: path.join(FOTO, 'ranked-pilih-habis.png') });
  cek('nyawa habis: Ranked ditolak dengan hitung mundur, Practice tetap bisa', pilihHabis.ranked && !pilihHabis.practice && /pulih dalam \d+:\d\d/.test(pilihHabis.alasan), pilihHabis.alasan);
  const a1 = pilihHabis.alasan;
  await tidur(2200);
  cek('hitung mundur nyawa berjalan', (await teksDi(akhir, 'alasan-mode')) !== a1);

  // Nyawa pulih setelah 20 menit.
  await isiProgres(akhir, { nyawa: 0, pulihSejak: Date.now() - 20 * 60000 - 1000 });
  await bukaPeta(akhir);
  await pilihLevel(akhir, 1);
  const pulih = await akhir.evaluate(() => ({ ranked: document.getElementById('tombol-mode-ranked').disabled, info: document.getElementById('info-mode').textContent }));
  cek('P-01: nyawa pulih setelah 20 menit dan Ranked terbuka lagi', !pulih.ranked && pulih.info.includes('Nyawa 1/5'), pulih.info);
  await akhir.close();
}

async function ujiRanked20(browser, galat) {
  console.log('\n== 150 level Tantangan dari progres kosong ==');
  const page = await bukaHalaman(browser, { width: 1024, height: 768 }, galat, { bukaSemua: false });
  await bukaPeta(page);
  let lolos = 0;
  for (let n = 1; n <= 150; n++) {
    if (n === 1) await pilihLevel(page, 1);
    else {
      await klik(page, 'tombol-level-lanjut');
      await tidur(450);
    }
    await klik(page, 'tombol-mode-ranked');
    await tidur(650);
    await isiBenar(page, n, 'ranked');
    await klik(page, 'tombol-kunci');
    try {
      await adaHasil(page);
    } catch (e) {
      // Menyebut level dan keadaan papan, supaya kegagalan bisa ditelusuri.
      const keadaan = await page.evaluate(() => ({ pesan: document.getElementById('pesan-solo').textContent, slot: [...document.querySelectorAll('.slot')].map((b) => b.getAttribute('aria-label')) }));
      throw new Error(`level ${n}: ${JSON.stringify(keadaan)}`);
    }
    await tidur(450);
    const p = await progresDi(page);
    if (p.rekor[n] === 3 && p.totalStars === n * 3 && p.nyawa === 5) lolos++;
    else console.log('   level', n, JSON.stringify({ rekor: p.rekor[n], total: p.totalStars, nyawa: p.nyawa }));
  }
  const p = await progresDi(page);
  cek('150 level Tantangan berurutan sampai 450 Stars', lolos === 150 && p.totalStars === 450 && p.wallet === 450, `${lolos}/150, total ${p.totalStars}, wallet ${p.wallet}`);
  cek('150 level Tantangan: nyawa tetap penuh, dan level terakhir tanpa tombol lanjut', p.nyawa === 5 && await page.evaluate(() => document.getElementById('tombol-level-lanjut').hidden));
  await page.close();
}

async function ujiUkuranRanked(browser, galat) {
  console.log('\n== Ukuran layar Ranked ==');
  const rekor = {};
  for (let n = 1; n <= 49; n++) rekor[n] = 1;
  const ukuran = [
    { nama: 'hp-kecil', width: 360, height: 640 },
    { nama: 'hp', width: 390, height: 844 },
    { nama: 'hp-lanskap', width: 740, height: 360 },
    { nama: 'tablet', width: 1024, height: 768 },
  ];
  for (const u of ukuran) {
    const page = await bukaHalaman(browser, { width: u.width, height: u.height }, galat, { bukaSemua: false });
    await isiProgres(page, { rekor });
    const tampung = async (label, selektor) => {
      const r = await page.evaluate((sel, w, h) => {
        const luar = [];
        document.querySelectorAll(sel).forEach((e) => {
          if (e.closest('[hidden]') || e.hidden) return;
          const q = e.getBoundingClientRect();
          if (!q.width) return;
          if (q.left < -0.5 || q.top < -0.5 || q.right > w + 0.5 || q.bottom > h + 0.5) luar.push(`${e.id || e.className} ${Math.round(q.left)},${Math.round(q.top)},${Math.round(q.right)},${Math.round(q.bottom)}`);
        });
        return luar;
      }, selektor, u.width, u.height);
      cek(`${u.nama}: ${label} muat`, r.length === 0, r.slice(0, 3).join(' | '));
    };
    const lebarSlot = () => page.$eval('.slot', (e) => e.offsetWidth);
    await bukaPeta(page);
    await pilihLevel(page, 50);
    await tidur(300);
    await tampung('Pilih Mode', '#dialog-mode .kotak-dialog, #dialog-mode button');
    await page.screenshot({ path: path.join(FOTO, `ranked-${u.nama}-pilih.png`) });
    await klik(page, 'tombol-mode-practice');
    await tidur(900);
    const lebarPractice = await lebarSlot();
    await klik(page, 'tombol-solo-keluar');
    await tidur(700);
    await page.evaluate(() => { Progres.DURASI_MS.hard = 2500; });
    await pilihLevel(page, 50);
    await klik(page, 'tombol-mode-ranked');
    await tidur(1000);
    const lebarRanked = await lebarSlot();
    await tampung('papan Ranked level 50', '.slot, .sedia, #tombol-kunci, .bar-solo .ikon, #timer-solo, #judul-level');
    const judul = await page.$eval('#judul-level', (e) => {
      const r = document.createRange();
      r.selectNodeContents(e);
      return { teks: r.getBoundingClientRect().width, kotak: e.parentElement.getBoundingClientRect().width };
    });
    cek(`${u.nama}: papan Ranked sama besar dengan Practice, dan judul muat`, lebarPractice === lebarRanked && judul.teks <= judul.kotak, `slot ${lebarPractice} vs ${lebarRanked}, judul ${Math.round(judul.teks)}/${Math.round(judul.kotak)}`);
    await page.screenshot({ path: path.join(FOTO, `ranked-${u.nama}-main.png`) });
    await adaHasil(page);
    await tidur(600);
    await tampung('layar gagal', '.kotak-kaca, .kotak-kaca button');
    await page.screenshot({ path: path.join(FOTO, `ranked-${u.nama}-gagal.png`) });
    await page.close();
  }
}

async function ujiSemuaLevel(browser, galat) {
  console.log('\n== 150 level lewat seret ==');
  const page = await bukaHalaman(browser, { width: 1024, height: 768 }, galat);
  await page.evaluate(() => document.getElementById('tombol-solo').click());
  await tidur(400);
  let lolos = 0;
  for (let n = 1; n <= 150; n++) {
    if (n === 1) {
      await page.evaluate(() => { document.querySelectorAll('.tombol-level')[0].click(); document.getElementById('tombol-mode-practice').click(); });
    } else {
      await page.evaluate(() => document.getElementById('tombol-level-lanjut').click());
    }
    await tidur(650);
    await isiBenar(page, n, 'practice');
    const k = await tengah(page, '#tombol-kunci');
    await page.mouse.click(k.x, k.y);
    await page.waitForSelector('#layar-hasil:not([hidden])', { timeout: 4000 });
    await tidur(500);
    const judul = await page.$eval('#judul-hasil', (e) => e.textContent);
    if (judul === `Level ${n} selesai!`) lolos++;
    else console.log('   level', n, judul);
  }
  cek('150 level selesai lewat seret', lolos === 150, `${lolos}/150`);
  const uji = await page.evaluate(() => JSON.parse(localStorage.getItem('setdoku-uji')));
  const format = uji.every((c) => Number.isInteger(c.level) && Number.isInteger(c.detik) && c.kunciSalah === 0 && typeof c.waktu === 'string');
  cek('data uji main: 150 catatan dengan format sama', uji.length === 150 && format, `${uji.length} catatan`);
  const lanjutTersembunyi = await page.evaluate(() => document.getElementById('tombol-level-lanjut').hidden);
  cek('level terakhir tidak punya tombol lanjut', lanjutTersembunyi);
  await page.close();
}

async function ujiUkuran(browser, galat) {
  console.log('\n== Ukuran layar ==');
  const ukuran = [
    { nama: 'hp-kecil', width: 360, height: 640 },
    { nama: 'hp', width: 390, height: 844 },
    { nama: 'hp-lanskap', width: 740, height: 360 },
    { nama: 'tablet', width: 1024, height: 768 },
  ];
  for (const u of ukuran) {
    const page = await bukaHalaman(browser, { width: u.width, height: u.height }, galat);
    const tampung = async (label, selektor) => {
      const r = await page.evaluate((sel, w, h) => {
        const luar = [];
        document.querySelectorAll(sel).forEach((e) => {
          if (e.closest('[hidden]') || e.hidden) return;
          const q = e.getBoundingClientRect();
          if (!q.width) return;
          if (q.left < -0.5 || q.top < -0.5 || q.right > w + 0.5 || q.bottom > h + 0.5) luar.push(`${e.id || e.className} ${Math.round(q.left)},${Math.round(q.top)},${Math.round(q.right)},${Math.round(q.bottom)}`);
        });
        return luar;
      }, selektor, u.width, u.height);
      cek(`${u.nama}: ${label} muat`, r.length === 0, r.slice(0, 3).join(' | '));
    };
    await tampung('menu', '#layar-menu button, #layar-menu h1');
    await page.screenshot({ path: path.join(FOTO, `ukuran-${u.nama}-menu.png`) });
    await page.evaluate(() => document.getElementById('tombol-solo').click());
    await tidur(400);
    await page.evaluate(() => { document.querySelectorAll('.tombol-level')[49].click(); document.getElementById('tombol-mode-practice').click(); });
    await tidur(1100);
    await tampung('papan (level 50)', '.slot, .sedia, #tombol-kunci, .bar-solo .ikon');
    await page.screenshot({ path: path.join(FOTO, `ukuran-${u.nama}-solo.png`) });

    // Hasil level.
    const { solusi, tersedia, papanAwal } = await page.evaluate(() => ({
      solusi: Puzzle.cariSolusi(DataLevel[49].practice)[0],
      tersedia: DataLevel[49].practice.tersedia,
      papanAwal: DataLevel[49].practice.papan,
    }));
    for (let i = 0; i < 9; i++) {
      if (papanAwal[i] !== null) continue;
      await seret(page, await tengah(page, '.sedia', tersedia.indexOf(solusi[i])), await tengah(page, '.slot', i), { langkah: 3 });
      await tenang(page);
    }
    await page.evaluate(() => document.getElementById('tombol-kunci').click());
    await page.waitForSelector('#layar-hasil:not([hidden])', { timeout: 4000 });
    await tidur(800);
    await tampung('kotak hasil', '.kotak-kaca');
    await page.screenshot({ path: path.join(FOTO, `ukuran-${u.nama}-hasil.png`) });
    await page.evaluate(() => document.getElementById('tombol-level-peta').click());
    await tidur(700);
    await page.evaluate(() => document.getElementById('tombol-peta-keluar').click());
    await tidur(700);
    await page.evaluate(() => document.getElementById('tombol-mulai').click());
    await tidur(900);
    await tampung('meja duel', '.kartu, .tombol-rebut, .tombol-tukar');
    await page.screenshot({ path: path.join(FOTO, `ukuran-${u.nama}-duel.png`) });
    await page.close();
  }
}

async function ujiSentuh(browser, galat) {
  console.log('\n== Sentuh (HP 390x844) ==');
  const page = await bukaHalaman(browser, { width: 390, height: 844, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, galat);
  await page.evaluate(() => document.getElementById('tombol-solo').click());
  await tidur(400);
  await page.evaluate(() => { document.querySelectorAll('.tombol-level')[4].click(); document.getElementById('tombol-mode-practice').click(); });
  await tidur(900);
  const level = await page.evaluate(() => DataLevel[4].practice);
  const a = level.papan.indexOf(null);
  const nA = await namaKartu(page, level.tersedia[0]);
  const klien = await page.target().createCDPSession();
  const sentuh = (type, pts) => klien.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const dari = await tengah(page, '.sedia', 0);
  const ke = await tengah(page, '.slot', a);
  let dibatalkan = false;
  await page.exposeFunction('tandaBatal', () => { dibatalkan = true; });
  await page.evaluate(() => document.addEventListener('pointercancel', () => window.tandaBatal(), true));
  await sentuh('touchStart', [{ x: dari.x, y: dari.y }]);
  for (let i = 1; i <= 12; i++) {
    const t = i / 12;
    await sentuh('touchMove', [{ x: dari.x + (ke.x - dari.x) * t, y: dari.y + (ke.y - dari.y) * t }]);
    await tidur(16);
  }
  await tidur(120);
  const sedang = await page.evaluate(() => ({
    hantu: document.querySelectorAll('.hantu.diseret').length,
    gulir: document.scrollingElement.scrollTop,
  }));
  await page.screenshot({ path: path.join(FOTO, 'sentuh-seret.png') });
  await sentuh('touchEnd', []);
  await tenang(page);
  const isi = await papan(page);
  cek('sentuh: seret mengisi slot tanpa pointercancel dan tanpa gulir', isi[a] === nA && !dibatalkan && sedang.hantu === 1 && sedang.gulir === 0, JSON.stringify({ ...sedang, dibatalkan }));

  // Ketuk dengan sentuhan.
  await page.evaluate(() => document.getElementById('tombol-kosongkan').click());
  await tenang(page);
  const sedia = await tengah(page, '.sedia', 0);
  await page.touchscreen.tap(sedia.x, sedia.y);
  await tidur(120);
  const pilih = await page.evaluate(() => document.querySelectorAll('.sedia.dipilih').length);
  const slot = await tengah(page, '.slot', a);
  await page.touchscreen.tap(slot.x, slot.y);
  await tenang(page);
  cek('sentuh: ketuk lalu ketuk', pilih === 1 && (await papan(page))[a] === nA);
  await page.close();
}

async function ujiGerakDikurangi(browser, galat) {
  console.log('\n== Gerak dikurangi ==');
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 768 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-reduced-transparency', value: 'reduce' }]);
  page.on('pageerror', (e) => galat.push('pageerror: ' + e.message));
  await page.goto(HALAMAN);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await tidur(400);
  await keLevel(page, 1);
  const level = await page.evaluate(() => DataLevel[0].practice);
  const solusi = await page.evaluate(() => Puzzle.cariSolusi(DataLevel[0].practice)[0]);
  for (let i = 0; i < 9; i++) {
    if (level.papan[i] !== null) continue;
    await seret(page, await tengah(page, '.sedia', level.tersedia.indexOf(solusi[i])), await tengah(page, '.slot', i), { langkah: 4 });
    await tenang(page);
  }
  const isi = await papan(page);
  cek('gerak dikurangi: seret tetap berfungsi', !isi.includes('kosong'));
  await page.evaluate(() => document.getElementById('tombol-kunci').click());
  await tidur(200);
  const kanvas = await page.evaluate(() => !!document.getElementById('kanvas-efek'));
  cek('gerak dikurangi: tidak ada konfeti', !kanvas);
  await page.waitForSelector('#layar-hasil:not([hidden])', { timeout: 3000 });
  await tidur(350);
  await page.screenshot({ path: path.join(FOTO, 'kurang-hasil.png') });
  const detail = await page.$eval('#detail-hasil', (e) => e.textContent);
  cek('gerak dikurangi: hasil langsung tampil', /Waktu \d+:\d\d, kunci salah 0 kali/.test(detail), detail);
  const kaca = await page.evaluate(() => getComputedStyle(document.getElementById('layar-hasil')).backdropFilter);
  cek('transparansi dikurangi: overlay tanpa blur', kaca === 'none', kaca);
  await page.close();
}

async function ukurSeret(browser, galat) {
  const page = await bukaHalaman(browser, { width: 1280, height: 800 }, galat);
  await keLevel(page, 50);
  await page.evaluate(() => {
    window.__bingkai = [];
    let lalu = performance.now();
    const f = (t) => { window.__bingkai.push(t - lalu); lalu = t; window.__id = requestAnimationFrame(f); };
    window.__id = requestAnimationFrame(f);
  });
  const dari = await tengah(page, '.sedia', 0);
  const ke = await tengah(page, '.slot', 0);
  await page.mouse.move(dari.x, dari.y);
  await page.mouse.down();
  for (let i = 1; i <= 90; i++) {
    const t = (Math.sin((i / 90) * Math.PI * 4 - Math.PI / 2) + 1) / 2;
    await page.mouse.move(dari.x + (ke.x - dari.x) * t, dari.y + (ke.y - dari.y) * t);
    await tidur(10);
  }
  await page.mouse.up();
  await tenang(page);
  const b = await page.evaluate(() => { cancelAnimationFrame(window.__id); return window.__bingkai; });
  await page.close();
  const urut = b.slice(2).sort((x, y) => x - y);
  return {
    median: urut[Math.floor(urut.length / 2)],
    p95: urut[Math.floor(urut.length * 0.95)],
    maks: urut[urut.length - 1],
    jumlah: urut.length,
  };
}

// Edge tanpa layar kadang terkunci di 30 fps, termasuk pada versi lama yang lolos.
// Regresi sungguhan gagal di semua percobaan, jadi pengukuran diulang sampai tiga kali.
async function ujiKelancaran(browser, galat) {
  console.log('\n== Kelancaran ==');
  let hasil = null;
  let percobaan = 0;
  do {
    percobaan += 1;
    hasil = await ukurSeret(browser, galat);
  } while (percobaan < 3 && !(hasil.median < 20 && hasil.p95 < 34));
  cek('bingkai saat menyeret stabil', hasil.median < 20 && hasil.p95 < 34, `median ${hasil.median.toFixed(1)} ms, p95 ${hasil.p95.toFixed(1)} ms, maks ${hasil.maks.toFixed(1)} ms, ${hasil.jumlah} bingkai, percobaan ke-${percobaan}`);
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--mute-audio'] });
  const galat = [];
  const pilihan = process.argv[2];
  const daftar = { chapter: ujiChapter, nada: ujiNada, klikDuel: ujiKlikDuel, rilis: ujiRilis, akhir: ujiAkhirTahap2, profil: ujiProfil, skin: ujiSkin, cara: ujiCara, toko: ujiToko, hasil: ujiHasil, toast: ujiToast, peta: ujiPeta, ranked: ujiRanked, ranked20: ujiRanked20, ukuranRanked: ujiUkuranRanked, progres: ujiProgres, tombol: ujiTombol, seret: ujiSeret, duel: ujiDuel, level: ujiSemuaLevel, ukuran: ujiUkuran, sentuh: ujiSentuh, kurang: ujiGerakDikurangi, lancar: ujiKelancaran };
  for (const [nama, fungsi] of Object.entries(daftar)) {
    if (pilihan && pilihan !== nama) continue;
    try {
      await fungsi(browser, galat);
    } catch (e) {
      cek(`${nama}: berjalan sampai selesai`, false, e.message);
    }
  }
  cek('tidak ada galat halaman atau console', galat.length === 0, galat.slice(0, 5).join(' | '));
  await browser.close();
  const gagal = hasil.filter((h) => !h.lolos);
  console.log(`\n${hasil.length - gagal.length}/${hasil.length} lolos`);
  gagal.forEach((g) => console.log('  GAGAL: ' + g.nama));
  process.exit(gagal.length ? 1 : 0);
})();
