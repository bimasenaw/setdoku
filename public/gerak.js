/*
 * SETDOKU: mesin gerak pegas, tanpa dependensi.
 * Parameternya mengikuti cara Apple: redaman (1 = tanpa pantulan, < 1 = memantul)
 * dan respons (detik, makin kecil makin gesit).
 * Setiap gerakan berangkat dari nilai di layar saat itu, jadi bisa dipotong kapan saja.
 * Dimuat oleh browser (window.Gerak) dan Node (require) supaya hitungannya bisa dites.
 */
(function (root, buat) {
  const api = buat(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Gerak = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  const LANGKAH_S = 1 / 240;
  const DT_MAKS_S = 1 / 30;

  // Ambang diam tiap saluran. Satuannya mengikuti saluran: px, derajat, atau rasio.
  const SALURAN = {
    x: { awal: 0, ambang: 0.05 },
    y: { awal: 0, ambang: 0.05 },
    skala: { awal: 1, ambang: 0.0005 },
    sx: { awal: 1, ambang: 0.0005 },
    sy: { awal: 1, ambang: 0.0005 },
    putar: { awal: 0, ambang: 0.02 },
    buram: { awal: 1, ambang: 0.002 },
  };
  const PEGAS_FADE = { redaman: 1, respons: 0.15 };

  /* Hitungan murni */

  function buatPegas({ redaman = 1, respons = 0.35 } = {}) {
    return {
      kaku: (2 * Math.PI / respons) ** 2,
      gesek: 4 * Math.PI * redaman / respons,
    };
  }

  // k = { nilai, kec, target }. Langkah waktunya tetap kecil supaya stabil.
  function majukan(pegas, k, dt) {
    let sisa = dt;
    while (sisa > 1e-9) {
      const h = Math.min(sisa, LANGKAH_S);
      k.kec += (-pegas.kaku * (k.nilai - k.target) - pegas.gesek * k.kec) * h;
      k.nilai += k.kec * h;
      sisa -= h;
    }
    return k;
  }

  function sudahDiam(k, ambang) {
    return Math.abs(k.nilai - k.target) < ambang && Math.abs(k.kec) < ambang * 10;
  }

  // Titik berhenti kalau gerakan dibiarkan melambat seperti gulir: rumus dari Apple.
  function proyeksi(kecepatan, perlambatan = 0.998) {
    return (kecepatan / 1000) * perlambatan / (1 - perlambatan);
  }

  // Makin jauh melewati batas, makin kecil elemennya mengikuti.
  function karet(lewat, ukuran, c = 0.55) {
    return (lewat * ukuran * c) / (ukuran + c * Math.abs(lewat));
  }

  // riwayat = [{ x, y, t }]. Kalau jari sudah diam sebelum diangkat, kecepatannya nol.
  function kecepatan(riwayat, sekarang, jendelaMs = 100) {
    const nol = { x: 0, y: 0 };
    if (riwayat.length < 2) return nol;
    const akhir = riwayat[riwayat.length - 1];
    if (sekarang - akhir.t > 60) return nol;
    let awal = akhir;
    for (let i = riwayat.length - 2; i >= 0; i--) {
      if (akhir.t - riwayat[i].t > jendelaMs) break;
      awal = riwayat[i];
    }
    const dt = (akhir.t - awal.t) / 1000;
    if (dt <= 0) return nol;
    return { x: (akhir.x - awal.x) / dt, y: (akhir.y - awal.y) / dt };
  }

  // Kurva CSS linear() dari pegas yang sama, untuk tombol yang cukup dengan transition.
  function kurvaCss(param) {
    const pegas = buatPegas(param);
    const k = { nilai: 0, kec: 0, target: 1 };
    const titik = [0];
    const langkah = 1 / 60;
    let waktu = 0;
    while (!sudahDiam(k, 0.002) && waktu < 3) {
      majukan(pegas, k, langkah);
      waktu += langkah;
      titik.push(Number(k.nilai.toFixed(3)));
    }
    titik[titik.length - 1] = 1;
    return { kurva: `linear(${titik.join(', ')})`, durasiMs: Math.round(waktu * 1000) };
  }

  /* Penggerak elemen (browser) */

  const pakaiPropertiTerpisah = !!(root.CSS && root.CSS.supports && root.CSS.supports('translate', '1px'));
  const aktif = new Set();
  const peta = new WeakMap();
  let idBingkai = null;
  let waktuLalu = 0;

  function kurangi() {
    return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function bingkai(t) {
    const dt = Math.min(Math.max(t - waktuLalu, 0) / 1000, DT_MAKS_S);
    waktuLalu = t;
    const selesai = [];
    for (const g of aktif) if (g._maju(dt)) selesai.push(g);
    for (const g of selesai) {
      aktif.delete(g);
      const f = g.saatDiam;
      g.saatDiam = null;
      if (f) f();
    }
    idBingkai = aktif.size ? root.requestAnimationFrame(bingkai) : null;
  }

  function jadwalkan(g) {
    aktif.add(g);
    if (idBingkai === null) {
      waktuLalu = root.performance.now();
      idBingkai = root.requestAnimationFrame(bingkai);
    }
  }

  function buatGerak(el) {
    const saluran = {};
    for (const [nama, a] of Object.entries(SALURAN)) {
      saluran[nama] = { nilai: a.awal, kec: 0, target: a.awal, pegas: null, diam: true, ambang: a.ambang };
    }
    const tunda = new Set();

    // Nilai identitas menghapus properti, supaya elemen yang diam tidak membuat
    // lapisan atau konteks tumpukan baru.
    function tulis() {
      const { x, y, skala, sx, sy, putar, buram } = saluran;
      const gaya = el.style;
      const sX = skala.nilai * sx.nilai;
      const sY = skala.nilai * sy.nilai;
      const geser = x.nilai || y.nilai ? `${x.nilai.toFixed(2)}px ${y.nilai.toFixed(2)}px` : '';
      const putaran = putar.nilai ? `${putar.nilai.toFixed(2)}deg` : '';
      const ukuran = sX !== 1 || sY !== 1 ? `${sX.toFixed(4)} ${sY.toFixed(4)}` : '';
      if (pakaiPropertiTerpisah) {
        gaya.translate = geser;
        gaya.rotate = putaran;
        gaya.scale = ukuran;
      } else {
        gaya.transform = [
          geser && `translate(${geser.replace(' ', ', ')})`,
          putaran && `rotate(${putaran})`,
          ukuran && `scale(${ukuran.replace(' ', ', ')})`,
        ].filter(Boolean).join(' ');
      }
      gaya.opacity = buram.nilai === 1 ? '' : String(Math.max(0, Math.min(1, buram.nilai)).toFixed(3));
    }

    const g = {
      el,
      saatDiam: null,
      saatLangkah: null,
      nilai: (nama) => saluran[nama].nilai,
      target: (nama) => saluran[nama].target,

      // Langsung menaruh nilai, tanpa gerak dan tanpa sisa kecepatan.
      set(nilai) {
        for (const [nama, v] of Object.entries(nilai)) {
          const k = saluran[nama];
          k.nilai = v;
          k.target = v;
          k.kec = 0;
          k.diam = true;
        }
        tulis();
        return g;
      },

      // opsi: redaman, respons, kecepatan { saluran: per detik }, tunda (ms), selesai (fungsi).
      ke(target, opsi = {}) {
        if (opsi.tunda) {
          const id = setTimeout(() => {
            tunda.delete(id);
            g.ke(target, { ...opsi, tunda: 0 });
          }, opsi.tunda);
          tunda.add(id);
          return g;
        }
        if (opsi.selesai !== undefined) g.saatDiam = opsi.selesai;
        const hemat = kurangi();
        const pegas = buatPegas(opsi);
        for (const [nama, v] of Object.entries(target)) {
          const k = saluran[nama];
          k.target = v;
          if (hemat && nama !== 'buram') {
            k.nilai = v;
            k.kec = 0;
            k.diam = true;
            continue;
          }
          k.pegas = hemat ? buatPegas(PEGAS_FADE) : pegas;
          if (opsi.kecepatan && opsi.kecepatan[nama] !== undefined) k.kec = opsi.kecepatan[nama];
          k.diam = sudahDiam(k, k.ambang);
        }
        if (hemat) tulis();
        jadwalkan(g);
        return g;
      },

      // Impuls: menambah kecepatan tanpa mengubah target. Dimatikan kalau gerak dikurangi.
      dorong(kec, opsi = {}) {
        if (kurangi()) return g;
        const pegas = buatPegas(opsi);
        for (const [nama, v] of Object.entries(kec)) {
          const k = saluran[nama];
          k.pegas = pegas;
          k.kec += v;
          k.diam = false;
        }
        jadwalkan(g);
        return g;
      },

      batalSelesai() {
        g.saatDiam = null;
        tunda.forEach(clearTimeout);
        tunda.clear();
        return g;
      },

      henti() {
        g.batalSelesai();
        g.saatLangkah = null;
        aktif.delete(g);
        for (const k of Object.values(saluran)) {
          k.target = k.nilai;
          k.kec = 0;
          k.diam = true;
        }
        return g;
      },

      _maju(dt) {
        for (const k of Object.values(saluran)) {
          if (k.diam) continue;
          majukan(k.pegas, k, dt);
          if (sudahDiam(k, k.ambang)) {
            k.nilai = k.target;
            k.kec = 0;
            k.diam = true;
          }
        }
        tulis();
        if (g.saatLangkah) g.saatLangkah(g);
        // Dicek setelah saatLangkah, karena fungsi itu boleh memberi dorongan baru.
        return Object.values(saluran).every((k) => k.diam);
      },
    };
    return g;
  }

  // Satu elemen selalu punya satu penggerak, jadi semua gerakannya saling menyambung.
  function gerakkan(el) {
    let g = peta.get(el);
    if (!g) {
      g = buatGerak(el);
      peta.set(el, g);
    }
    return g;
  }

  return { buatPegas, majukan, sudahDiam, proyeksi, karet, kecepatan, kurvaCss, gerakkan, kurangi };
});
