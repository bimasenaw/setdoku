/*
 * SETDOKU: supaya game tetap jalan tanpa internet (G-08).
 * Selalu mencoba jaringan dulu, jadi perubahan setelah deploy langsung terlihat.
 * Salinan di perangkat hanya dipakai kalau jaringan gagal.
 */
const CACHE = 'setdoku-1';
const FILE = [
  './',
  'index.html',
  'logika.js',
  'puzzle.js',
  'level.js',
  'progres.js',
  'gerak.js',
  'efek.js',
  'manifest.webmanifest',
  'ikon/ikon.svg',
  'ikon/ikon-192.png',
  'ikon/ikon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((semua) => Promise.all(semua.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(request)
      .then((jawaban) => {
        if (jawaban.ok) {
          const salinan = jawaban.clone();
          caches.open(CACHE).then((c) => c.put(request, salinan));
        }
        return jawaban;
      })
      .catch(async () => {
        // Alamat seperti ./?uji memakai salinan halaman yang sama.
        const ada = await caches.match(request, { ignoreSearch: true });
        if (ada) return ada;
        if (request.mode === 'navigate') {
          const halaman = await caches.match('./', { ignoreSearch: true });
          if (halaman) return halaman;
        }
        return Response.error();
      }),
  );
});
