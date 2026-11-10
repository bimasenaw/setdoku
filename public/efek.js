/*
 * SETDOKU: partikel, konfeti, guncangan, dan getar. Hanya untuk browser.
 * Semua efek gerak mati kalau pemain memilih gerak dikurangi.
 */
(function (root) {
  const G = root.Gerak;
  const MAKS_PARTIKEL = 150;
  const GRAVITASI = 900;

  let kanvas = null;
  let ctx = null;
  let idBingkai = null;
  let waktuLalu = 0;
  const partikel = [];

  function ukurKanvas() {
    const dpr = Math.min(root.devicePixelRatio || 1, 2);
    kanvas.width = Math.round(root.innerWidth * dpr);
    kanvas.height = Math.round(root.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function siapkan() {
    if (kanvas) return;
    kanvas = document.createElement('canvas');
    kanvas.id = 'kanvas-efek';
    kanvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(kanvas);
    ctx = kanvas.getContext('2d');
    ukurKanvas();
    root.addEventListener('resize', ukurKanvas);
  }

  function gambar(p) {
    const sisa = 1 - p.umur / p.umurMaks;
    ctx.globalAlpha = Math.min(1, sisa * 2);
    ctx.fillStyle = p.warna;
    if (p.kertas) {
      // Lebarnya mengikuti putaran, supaya kertas tampak berkibar.
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.putar);
      ctx.fillRect(-p.ukuran / 2, -p.ukuran * 0.3, p.ukuran * Math.cos(p.kibar), p.ukuran * 0.6);
      ctx.restore();
      return;
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.ukuran * Math.max(sisa, 0.2), 0, Math.PI * 2);
    ctx.fill();
  }

  function bingkai(t) {
    const dt = Math.min((t - waktuLalu) / 1000, 1 / 30);
    waktuLalu = t;
    ctx.clearRect(0, 0, root.innerWidth, root.innerHeight);
    for (let i = partikel.length - 1; i >= 0; i--) {
      const p = partikel[i];
      p.umur += dt;
      if (p.umur >= p.umurMaks) {
        partikel.splice(i, 1);
        continue;
      }
      const hambat = Math.exp(-p.hambat * dt);
      p.vx *= hambat;
      p.vy = p.vy * hambat + p.gravitasi * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.putar += p.vPutar * dt;
      p.kibar += p.vKibar * dt;
      gambar(p);
    }
    ctx.globalAlpha = 1;
    idBingkai = partikel.length ? root.requestAnimationFrame(bingkai) : null;
  }

  function tambah(baru) {
    if (G.kurangi()) return;
    siapkan();
    for (const p of baru) {
      if (partikel.length >= MAKS_PARTIKEL) partikel.shift();
      partikel.push(p);
    }
    if (idBingkai === null) {
      waktuLalu = root.performance.now();
      idBingkai = root.requestAnimationFrame(bingkai);
    }
  }

  const acak = (a, b) => a + Math.random() * (b - a);
  const pilih = (daftar) => daftar[Math.floor(Math.random() * daftar.length)];

  function semburan(x, y, { warna = ['#ffffff'], jumlah = 12, laju = 300, ukuran = 3.4, umur = 0.5 } = {}) {
    const baru = [];
    for (let i = 0; i < jumlah; i++) {
      const sudut = (i / jumlah) * Math.PI * 2 + acak(-0.25, 0.25);
      const v = laju * acak(0.55, 1.1);
      baru.push({
        x, y,
        vx: Math.cos(sudut) * v,
        vy: Math.sin(sudut) * v,
        ukuran: ukuran * acak(0.7, 1.2),
        warna: pilih(warna),
        gravitasi: GRAVITASI * 0.5,
        hambat: 4,
        umur: 0,
        umurMaks: umur * acak(0.7, 1.15),
        putar: 0, vPutar: 0, kibar: 0, vKibar: 0,
        kertas: false,
      });
    }
    tambah(baru);
  }

  // Dua semburan dari sudut bawah layar, lalu kertasnya jatuh pelan.
  function konfeti(warna, { jumlah = 120 } = {}) {
    const lebar = root.innerWidth;
    const tinggi = root.innerHeight;
    const baru = [];
    for (let i = 0; i < jumlah; i++) {
      const kiri = i % 2 === 0;
      const sudut = (kiri ? -65 : -115) * Math.PI / 180 + acak(-0.4, 0.4);
      const v = Math.max(tinggi, 520) * acak(1.1, 2.3);
      baru.push({
        x: kiri ? -8 : lebar + 8,
        y: tinggi * 0.92,
        vx: Math.cos(sudut) * v,
        vy: Math.sin(sudut) * v,
        ukuran: acak(7, 12),
        warna: pilih(warna),
        gravitasi: GRAVITASI,
        hambat: 1.7,
        umur: 0,
        umurMaks: acak(1.7, 2.8),
        putar: acak(0, Math.PI),
        vPutar: acak(-5, 5),
        kibar: acak(0, Math.PI),
        vKibar: acak(5, 13),
        kertas: true,
      });
    }
    tambah(baru);
  }

  function guncang(el, kekuatan = 420) {
    G.gerakkan(el).dorong({ x: kekuatan }, { redaman: 0.25, respons: 0.3 });
  }

  function getar(pola) {
    try {
      if (root.navigator && root.navigator.vibrate) root.navigator.vibrate(pola);
    } catch (e) {}
  }

  root.Efek = { semburan, konfeti, guncang, getar };
})(self);
