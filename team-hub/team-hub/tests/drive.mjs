// Minimal Chrome DevTools driver: node drive.mjs steps.json
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Suites were written against /home/claude/teamapp-test/; point them at this folder instead.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'file://' + HERE + '/';
const steps = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const OUT = path.join(HERE, 'out'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn(process.env.CHROME || 'google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(OUT, 'profile-' + PORT), '--window-size=1280,900', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(); const errors = [];
async function connect() {
  for (let i = 0; i < 50; i++) { try { const r = await fetch('http://127.0.0.1:' + PORT + '/json'); const j = await r.json(); const p = j.find(t => t.type === 'page'); if (p) return p.webSocketDebuggerUrl; } catch (e) {} await sleep(200); }
  throw new Error('no chrome');
}
function send(method, params = {}) { return new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); }); }
const url = await connect();
ws = new WebSocket(url);
await new Promise(r => ws.onopen = r);
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result || d); pending.delete(d.id); }
  if (d.method === 'Runtime.exceptionThrown') errors.push('EXC ' + JSON.stringify(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
  if (d.method === 'Runtime.consoleAPICalled' && (d.params.type === 'error' || d.params.type === 'warning')) errors.push('CONSOLE ' + d.params.args.map(a => a.value || a.description).join(' ')); };
await send('Runtime.enable'); await send('Page.enable');
for (const s of steps) {
  if (s.go) { await send('Page.navigate', { url: s.go.replace('file:///home/claude/teamapp-test/', BASE) }); await sleep(s.wait || 900); }
  if (s.size) await send('Emulation.setDeviceMetricsOverride', { width: s.size[0], height: s.size[1], deviceScaleFactor: 1, mobile: s.size[0] < 600 });
  if (s.js) { const r = await send('Runtime.evaluate', { expression: s.js, awaitPromise: true, returnByValue: true }); if (s.print) console.log('JS>', JSON.stringify(r.result?.value ?? r.exceptionDetails?.exception?.description)); await sleep(s.wait || 500); }
  if (s.shot) { const h = s.full ? await send('Runtime.evaluate', { expression: 'document.documentElement.scrollHeight', returnByValue: true }) : null;
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!s.full, clip: s.full ? { x: 0, y: 0, width: s.size ? s.size[0] : 1280, height: Math.min(h.result.value, 4000), scale: 1 } : undefined });
    fs.writeFileSync(path.join(OUT, path.basename(s.shot)), Buffer.from(r.data, 'base64')); }
}
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
ws.close(); chrome.kill();
process.exit(0);
