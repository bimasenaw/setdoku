// Menyalakan Firebase Emulator, menjalankan uji-emulator.js di dalamnya, lalu mematikannya lagi.
// Jalankan: npm run uji:emulator. firebase-tools diambil lewat npx, jadi tidak masuk package.json.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// firebase-tools terbaru butuh Java 21. Versi 10 adalah yang terakhir menerima Java 8.
const UNTUK_JAVA_BARU = '15.35.0';
const UNTUK_JAVA_LAMA = '10.9.2';

function versiJava(perintah) {
  const r = spawnSync(perintah, ['-version'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  const m = /version "(\d+)(?:\.(\d+))?/.exec(`${r.stderr}${r.stdout}`);
  if (!m) return null;
  return Number(m[1]) === 1 ? Number(m[2]) : Number(m[1]); // "1.8.0" berarti Java 8
}

// Terminal yang dibuka sebelum Java dipasang belum mengenalnya, jadi folder pemasangannya dicari juga.
function cariJava() {
  const calon = [null];
  for (const akar of [process.env.JAVA_HOME && path.dirname(process.env.JAVA_HOME), 'C:/Program Files/Java', 'C:/Program Files/Eclipse Adoptium', 'C:/Program Files/Microsoft']) {
    if (!akar || !fs.existsSync(akar)) continue;
    for (const nama of fs.readdirSync(akar)) {
      const bin = path.join(akar, nama, 'bin');
      if (fs.existsSync(path.join(bin, 'java.exe'))) calon.push(bin);
    }
  }
  let terbaik = null;
  for (const bin of calon) {
    const versi = versiJava(bin ? path.join(bin, 'java.exe') : 'java');
    if (versi && (!terbaik || versi > terbaik.versi)) terbaik = { bin, versi };
  }
  return terbaik;
}

const java = cariJava();
if (!java) {
  console.error('Java tidak ditemukan. Pasang dulu, misalnya: winget install EclipseAdoptium.Temurin.21.JRE');
  process.exit(2);
}
const alat = `firebase-tools@${java.versi >= 21 ? UNTUK_JAVA_BARU : UNTUK_JAVA_LAMA}`;
console.log(`Java ${java.versi}, ${alat}`);

const env = { ...process.env };
if (java.bin) {
  const kunci = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'PATH';
  env[kunci] = `${java.bin}${path.delimiter}${env[kunci] || ''}`;
}
const kelompok = process.argv.slice(2).filter((a) => /^[a-z]+$/.test(a)).join(' ');
const perintah = `npx -y ${alat} emulators:exec --only auth,database --project demo-setdoku "node tes-browser/uji-emulator.js ${kelompok}"`;
const r = spawnSync(perintah, { cwd: path.join(__dirname, '..'), env, stdio: 'inherit', shell: true });
process.exit(r.status === null ? 1 : r.status);
