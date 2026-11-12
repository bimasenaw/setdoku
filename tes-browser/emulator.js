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
// firebase-tools versi lama kadang meninggalkan emulator database tetap hidup di Windows,
// lalu uji berikutnya gagal karena port-nya masih dipakai. Yang dimatikan hanya proses
// Java yang memang menjalankan emulator itu.
function matikanEmulatorSisa() {
  if (process.platform !== 'win32') return;
  const cari = spawnSync('powershell', ['-NoProfile', '-Command',
    "Get-CimInstance Win32_Process -Filter \"Name='java.exe'\" | Where-Object { $_.CommandLine -like '*firebase-database-emulator*' } | ForEach-Object { $_.ProcessId }"], { encoding: 'utf8' });
  for (const pid of String(cari.stdout || '').split(/\s+/).filter((x) => /^\d+$/.test(x))) {
    spawnSync('taskkill', ['/PID', pid, '/F'], { stdio: 'ignore' });
    console.log(`Emulator database yang tertinggal (PID ${pid}) dimatikan.`);
  }
}

matikanEmulatorSisa();
const r = spawnSync(perintah, { cwd: path.join(__dirname, '..'), env, stdio: 'inherit', shell: true });
matikanEmulatorSisa();
try { fs.unlinkSync(path.join(__dirname, '..', 'database-debug.log')); } catch (e) {}
process.exit(r.status === null ? 1 : r.status);
