/**
 * AutoScribe Automated MySQL/MariaDB Setup Script
 * Downloads and configures a portable, zero-admin MySQL-compatible database server.
 * 
 * Run with: node scripts/install-mysql-portable.js
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');

const rootDir = path.join(__dirname, '..');
const serverDir = path.join(rootDir, 'mysql-server');
const zipPath = path.join(rootDir, 'mysql-portable.zip');
const downloadUrl = 'https://archive.mariadb.org/mariadb-10.11.8/winx64-packages/mariadb-10.11.8-winx64.zip';

async function checkPort3306() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port: 3306, host: '127.0.0.1' }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });
}

async function main() {
  console.log("=== AUTOSCRIBE AUTOMATED DATABASE INSTALLER ===\n");

  const alreadyOpen = await checkPort3306();
  if (alreadyOpen) {
    console.log("✅ Port 3306 is already active and listening!");
    return;
  }

  const binDir = path.join(serverDir, 'bin');
  const daemonExe = path.join(binDir, 'mariadbd.exe');
  const installDbExe = path.join(binDir, 'mariadb-install-db.exe');
  const dataDir = path.join(serverDir, 'data');

  if (!fs.existsSync(daemonExe)) {
    console.log(`[1/4] Downloading MySQL Server package (~89 MB)...`);
    if (!fs.existsSync(serverDir)) {
      fs.mkdirSync(serverDir, { recursive: true });
    }

    // Use built-in Windows curl.exe with progress indicator
    execSync(`curl.exe -L -o "${zipPath}" "${downloadUrl}"`, { stdio: 'inherit' });

    console.log(`\n[2/4] Extracting database server files...`);
    execSync(`tar.exe -xf "${zipPath}" --strip-components=1 -C "${serverDir}"`, { stdio: 'inherit' });

    // Clean up zip
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }
    console.log(`✅ Extracted successfully to: ${serverDir}`);
  } else {
    console.log(`✅ MySQL Server binaries already present at: ${serverDir}`);
  }

  // Initialize data directory if not yet initialized
  if (!fs.existsSync(dataDir) || fs.readdirSync(dataDir).length === 0) {
    console.log(`\n[3/4] Initializing database data directory...`);
    execSync(`"${installDbExe}" --datadir="${dataDir}"`, { stdio: 'inherit' });
    console.log(`✅ Data directory initialized.`);
  }

  console.log(`\n[4/4] Starting MySQL Server process on port 3306...`);
  const logFile = path.join(serverDir, 'mysql.log');
  const out = fs.openSync(logFile, 'a');
  const err = fs.openSync(logFile, 'a');

  const serverProc = spawn(daemonExe, [`--datadir=${dataDir}`, '--port=3306', '--console'], {
    detached: true,
    stdio: ['ignore', out, err]
  });
  serverProc.unref();

  console.log(`[AutoScribe Installer] Process spawned (PID: ${serverProc.pid}). Waiting for port 3306...`);

  // Poll for connection readiness
  let ready = false;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 1000));
    ready = await checkPort3306();
    if (ready) break;
    process.stdout.write('.');
  }

  if (ready) {
    console.log(`\n\n🎉 SUCCESS: MySQL Server is now running and accepting connections on localhost:3306!`);
  } else {
    console.error(`\n❌ Timed out waiting for port 3306. Check ${logFile} for details.`);
  }
}

main().catch(err => {
  console.error("Installation failed:", err.message);
  process.exit(1);
});
