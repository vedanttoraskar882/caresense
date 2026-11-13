const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const PORT = 9222;
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
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.callbacks = new Map();
    this.events = [];
    this.networkRequests = [];
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        if (data.method === 'Network.requestWillBeSent') {
          this.networkRequests.push(data.params.request.url);
        }
        if (data.id && this.callbacks.has(data.id)) {
          const cb = this.callbacks.get(data.id);
          this.callbacks.delete(data.id);
          if (data.error) {
            cb.reject(new Error(data.error.message));
          } else {
            cb.resolve(data.result);
          }
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

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result?.value;
  }

  close() {
    this.ws.close();
  }
}

async function runTests() {
  console.log('Launching browser for verification...');
  const tempDir = path.join(__dirname, '.temp_browser_profile');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

  const browserProc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${tempDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
  ]);

  let connected = false;
  let targetWsUrl = null;

  for (let i = 0; i < 20; i++) {
    await sleep(500);
    try {
      const targets = await fetchJson(`http://127.0.0.1:${PORT}/json`);
      if (targets && targets.length > 0) {
        targetWsUrl = targets[0].webSocketDebuggerUrl;
        connected = true;
        break;
      }
    } catch (e) {
      // wait for browser ready
    }
  }

  if (!connected || !targetWsUrl) {
    console.error('Failed to connect to browser CDP.');
    browserProc.kill();
    process.exit(1);
  }

  const client = new CDPClient(targetWsUrl);
  await client.connect();

  await client.send('Page.enable');
  await client.send('DOM.enable');
  await client.send('Network.enable');

  console.log('Navigating to', TEST_URL);
  await client.send('Page.navigate', { url: TEST_URL });
  await sleep(1500);

  const results = [];
  function assert(cond, msg) {
    if (cond) {
      console.log('PASS: ' + msg);
      results.push({ pass: true, msg });
    } else {
      console.error('FAIL: ' + msg);
      results.push({ pass: false, msg });
    }
  }

  // --- Test Viewports ---
  console.log('\n--- Checking Viewports & Responsiveness ---');
  for (const width of [360, 768, 1280]) {
    await client.send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 800,
      deviceScaleFactor: 1,
      mobile: width < 992,
    });
    await sleep(300);

    const docWidth = await client.eval('document.documentElement.scrollWidth');
    assert(docWidth <= width, `Viewport ${width}px has no horizontal overflow (scrollWidth = ${docWidth})`);

    // Verify pricing elements are readable
    const pricingVisible = await client.eval(`(() => {
      const cards = document.querySelectorAll('.pricing-card');
      return Array.from(cards).every(c => {
        const rect = c.getBoundingClientRect();
        return rect.width > 0 && rect.width <= window.innerWidth;
      });
    })()`);
    assert(pricingVisible, `Pricing cards render within viewport at ${width}px`);
  }

  // Reset viewport to desktop
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await sleep(300);

  // --- Test Mobile Menu on 360px ---
  console.log('\n--- Checking Mobile Navigation Menu ---');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 360,
    height: 640,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await sleep(200);

  const menuToggle = await client.eval(`(() => {
    const btn = document.getElementById('mobile-menu-toggle');
    const nav = document.getElementById('mobile-nav');
    btn.click();
    const openState = btn.getAttribute('aria-expanded') === 'true' && !nav.hasAttribute('hidden');
    // Click a link inside
    const link = nav.querySelector('a[href="#how-it-works"]');
    link.click();
    const closedState = btn.getAttribute('aria-expanded') === 'false' && nav.hasAttribute('hidden');
    return { openState, closedState };
  })()`);

  assert(menuToggle.openState, 'Mobile menu toggle opens menu and updates aria-expanded to true');
  assert(menuToggle.closedState, 'Clicking a link inside mobile menu closes it and sets aria-expanded to false');

  // Test Escape key closes menu
  const escTest = await client.eval(`(() => {
    const btn = document.getElementById('mobile-menu-toggle');
    const nav = document.getElementById('mobile-nav');
    btn.click(); // open
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return btn.getAttribute('aria-expanded') === 'false' && nav.hasAttribute('hidden');
  })()`);
  assert(escTest, 'Escape key closes mobile menu');

  // Reset to Desktop width
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await sleep(200);

  // --- Test FAQ Accordion ---
  console.log('\n--- Checking FAQ Accordion ---');
  const faqTest = await client.eval(`(() => {
    const items = document.querySelectorAll('.faq-item');
    if (items.length !== 7) return { count: items.length, toggled: false };
    const first = items[0];
    const summary = first.querySelector('summary');
    summary.click();
    const isOpen = first.hasAttribute('open');
    summary.click();
    const isClosed = !first.hasAttribute('open');
    return { count: items.length, toggled: isOpen && isClosed };
  })()`);
  assert(faqTest.count === 7, `FAQ has exactly 7 items (found ${faqTest.count})`);
  assert(faqTest.toggled, 'FAQ details/summary elements toggle properly on interaction');

  // --- Test LocalStorage Pilot Form on Clean Origin ---
  console.log('\n--- Checking Request a Pilot Form & LocalStorage ---');
  await client.eval('localStorage.clear();');

  // Clear tracked network requests
  client.networkRequests = [];

  // Submission 1
  const sub1 = await client.eval(`(async () => {
    const form = document.getElementById('pilot-form');
    form.elements.namedItem('fullName').value = 'Sarah Jenkins';
    form.elements.namedItem('phoneNumber').value = '+44 7700 900077';
    form.elements.namedItem('emailAddress').value = 's.jenkins@oakwoodcare.co.uk';
    form.elements.namedItem('organisationName').value = 'Oakwood Residential Care';

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.click();
    
    // wait for async lock and save
    await new Promise(r => setTimeout(r, 200));
    const status = document.getElementById('pilot-status').textContent;
    return status;
  })()`);

  assert(sub1 === 'Your pilot request has been saved in this browser.', `Submission 1 success message displayed: "${sub1}"`);
  
  // Verify network requests during submission
  const postRequests = client.networkRequests.filter(u => !u.includes('localhost:8085') && !u.includes('fonts.'));
  assert(postRequests.length === 0, `No external network requests sent during submission (requests: ${postRequests.length})`);

  // Refresh page and make Submission 2
  await client.send('Page.reload');
  await sleep(1000);

  const sub2 = await client.eval(`(async () => {
    const form = document.getElementById('pilot-form');
    form.elements.namedItem('fullName').value = 'David Miller';
    form.elements.namedItem('phoneNumber').value = '0121 496 0123';
    form.elements.namedItem('emailAddress').value = 'dmiller@meadowviewnursing.co.uk';
    form.elements.namedItem('organisationName').value = 'Meadow View Nursing Home';

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.click();
    
    await new Promise(r => setTimeout(r, 200));
    const status = document.getElementById('pilot-status').textContent;
    return status;
  })()`);

  assert(sub2 === 'Your pilot request has been saved in this browser.', `Submission 2 success message displayed: "${sub2}"`);

  // Inspect localStorage
  const storedData = await client.eval(`(() => {
    const raw = localStorage.getItem('careSense360PilotRequests');
    return JSON.parse(raw);
  })()`);

  assert(Array.isArray(storedData), 'careSense360PilotRequests is a JSON array');
  assert(storedData.length === 2, `Array contains exactly 2 records (found ${storedData.length})`);

  const rec1 = storedData[0];
  assert(
    rec1.fullName === 'Sarah Jenkins' &&
    rec1.phoneNumber === '+44 7700 900077' &&
    rec1.emailAddress === 's.jenkins@oakwoodcare.co.uk' &&
    rec1.organisationName === 'Oakwood Residential Care' &&
    Boolean(rec1.submissionDateTime),
    'Record 1 contains all 5 required fields and preserved phone number string "+44 7700 900077"'
  );

  const rec2 = storedData[1];
  assert(
    rec2.fullName === 'David Miller' &&
    rec2.phoneNumber === '0121 496 0123' &&
    rec2.emailAddress === 'dmiller@meadowviewnursing.co.uk' &&
    rec2.organisationName === 'Meadow View Nursing Home' &&
    Boolean(rec2.submissionDateTime),
    'Record 2 contains all 5 required fields and preserved leading zero "0121 496 0123"'
  );

  // Test invalid submission: missing field
  console.log('\n--- Checking Validation & Error Resilience ---');
  const invalidTest = await client.eval(`(async () => {
    const form = document.getElementById('pilot-form');
    form.reset();
    form.elements.namedItem('fullName').value = 'Incomplete User';
    // leave other fields empty
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.click();
    await new Promise(r => setTimeout(r, 100));
    const raw = localStorage.getItem('careSense360PilotRequests');
    return JSON.parse(raw).length;
  })()`);
  assert(invalidTest === 2, 'Invalid submission adds no record to storage');

  // Test corrupted / malformed JSON in localStorage
  const malformedTest = await client.eval(`(async () => {
    const form = document.getElementById('pilot-form');
    // Inject corrupt JSON into storage
    localStorage.setItem('careSense360PilotRequests', '{ corrupt json');
    
    // Fill out form
    form.elements.namedItem('fullName').value = 'Alice Cooper';
    form.elements.namedItem('phoneNumber').value = '07111222333';
    form.elements.namedItem('emailAddress').value = 'alice@example.com';
    form.elements.namedItem('organisationName').value = 'Care First';

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.click();
    await new Promise(r => setTimeout(r, 200));

    const status = document.getElementById('pilot-status').textContent;
    const preservedStorage = localStorage.getItem('careSense360PilotRequests');
    const inputsRetained = form.elements.namedItem('fullName').value === 'Alice Cooper' &&
                           form.elements.namedItem('organisationName').value === 'Care First';

    return {
      status,
      preservedStorage,
      inputsRetained
    };
  })()`);

  assert(malformedTest.status === 'Your request could not be saved in this browser. Your entries are still in the form.',
    'Error message shown on corrupted storage');
  assert(malformedTest.preservedStorage === '{ corrupt json', 'Corrupted storage was preserved and not overwritten');
  assert(malformedTest.inputsRetained, 'Form inputs were retained on storage failure');

  // Clean up test data from test environment
  await client.eval('localStorage.clear();');
  console.log('Cleaned up test environment storage.');

  // Close browser and exit
  client.close();
  browserProc.kill();

  const failed = results.filter(r => !r.pass);
  if (failed.length === 0) {
    console.log('\nALL CDP BROWSER VERIFICATION TESTS PASSED SUCCESSFULLY!');
  } else {
    console.error(`\n${failed.length} BROWSER TESTS FAILED!`);
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
