/*
 * SETDOKU: konfigurasi web Firebase untuk duel online (tahap 4a).
 * Isi ini memang publik dan boleh ikut ter-deploy. Data dilindungi oleh
 * aturan keamanan Realtime Database, bukan oleh kerahasiaan konfigurasi.
 * Analytics sengaja tidak dipakai, jadi measurementId tidak dicantumkan.
 * Dimuat oleh browser (window.FirebaseConfig) dan Node (require).
 */
(function (root, buat) {
  const api = buat();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FirebaseConfig = api;
})(typeof self !== 'undefined' ? self : this, function () {
  return Object.freeze({
    apiKey: 'AIzaSyCM5TteJcslg-axBxU-cBfoHMbmvE5I5As',
    authDomain: 'setdoku-9b4cb.firebaseapp.com',
    databaseURL: 'https://setdoku-9b4cb-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'setdoku-9b4cb',
    storageBucket: 'setdoku-9b4cb.firebasestorage.app',
    messagingSenderId: '369335682826',
    appId: '1:369335682826:web:814c5fe84734d733df5cf3',
  });
});
