const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const PORT = 9224;
const TEST_URL = 'http://localhost:8085/';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.callbacks = new Map();
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        if (data.id && this.callbacks.has(data.id)) {
          const cb = this.callbacks.get(data.id);
          this.callbacks.delete(data.id);
          if (data.error) cb.reject(new Error(data.error.message));
          else cb.resolve(data.result);
        }
      };
    });
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { this.ws.close(); }
}

async function captureFull() {
  const tempDir = path.join(__dirname, '.temp_capture_full');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

  const browserProc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${tempDir}`,
    '--disable-gpu',
    '--no-first-run',
  ]);

  let targetWsUrl = null;
  for (let i = 0; i < 20; i++) {
    await sleep(400);
    try {
      const targets = await fetchJson(`http://127.0.0.1:${PORT}/json`);
      if (targets && targets.length > 0) {
        targetWsUrl = targets[0].webSocketDebuggerUrl;
        break;
      }
    } catch (e) {}
  }

  const client = new CDPClient(targetWsUrl);
  await client.connect();
  await client.send('Page.enable');

  const screenshotsDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir);

  for (const vp of [
    { name: 'full-desktop-1280', width: 1280, height: 800, mobile: false },
    { name: 'full-mobile-360', width: 360, height: 740, mobile: true },
  ]) {
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 1,
      mobile: vp.mobile,
    });
    await client.send('Page.navigate', { url: TEST_URL });
    await sleep(1000);

    // Reveal elements for full-page screenshot
    await client.send('Runtime.evaluate', { 
      expression: "document.querySelectorAll('[data-animate=\"fade-up\"]').forEach(el => el.classList.add('is-animated'))" 
    });
    await sleep(400);

    const shot = await client.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      fromSurface: true
    });
    const buffer = Buffer.from(shot.data, 'base64');
    const filePath = path.join(screenshotsDir, `${vp.name}.png`);
    fs.writeFileSync(filePath, buffer);
    console.log(`Saved full screenshot: ${filePath}`);
  }

  client.close();
  browserProc.kill();
}

captureFull().then(() => console.log('Full screenshots captured.'));
