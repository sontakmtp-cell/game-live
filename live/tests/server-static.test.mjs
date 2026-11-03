// Tests for Server Static Routing and Security Allowlist — TikTok LIVE Arcade
// Covers: SEC-01, ASSET-01, VIDEO-01, VIDEO-02

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';

let serverProc = null;
const TEST_PORT = 3099;

function request(pathStr) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path: pathStr,
        method: 'GET',
        headers: {
          Host: `127.0.0.1:${TEST_PORT}`,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

test('Static Routing & Security Allowlist', async (t) => {
  // Start server on TEST_PORT
  await new Promise((resolve, reject) => {
    serverProc = spawn('node', ['server.mjs'], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(TEST_PORT), HOST: '127.0.0.1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    serverProc.stdout.on('data', (d) => {
      const msg = d.toString();
      if (msg.includes('Server chạy tại')) {
        resolve();
      }
    });

    serverProc.on('error', reject);
  });

  t.after(() => {
    if (serverProc) {
      serverProc.kill();
    }
  });

  await t.test('1. Serve overlay.html -> 200 text/html', async () => {
    const res = await request('/live/overlay.html');
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/html'));
    assert.ok(res.body.includes('three-canvas'));
  });

  await t.test('2. Serve control.html -> 200 text/html', async () => {
    const res = await request('/live/control.html');
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/html'));
    assert.ok(res.body.includes('P0A · Điều Khiển Đạo Cụ'));
  });

  await t.test('3. Serve /live/public/asset-manifest.json -> 200 application/json (ASSET-01)', async () => {
    const res = await request('/live/public/asset-manifest.json');
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers['content-type'].includes('application/json'));
    const manifest = JSON.parse(res.body);
    assert.strictEqual(manifest.camera.id, 'CAMERA_MAIN');
    assert.ok(Array.isArray(manifest.camera.position));
  });

  await t.test('4. Serve /live/public/js/overlay-app.mjs -> 200 text/javascript', async () => {
    const res = await request('/live/public/js/overlay-app.mjs');
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/javascript'));
    assert.ok(res.body.includes('OverlayApp'));
  });

  await t.test('5. Serve /live/public/assets/video/grinder-clean-plate.mp4 -> 200 video/mp4 (VIDEO-01)', async () => {
    const res = await request('/live/public/assets/video/grinder-clean-plate.mp4');
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers['content-type'].includes('video/mp4'));
  });

  await t.test('6. Serve /live/public/assets/video/knife-left-touch.mp4 -> 200 video/mp4 (VIDEO-02)', async () => {
    const res = await request('/live/public/assets/video/knife-left-touch.mp4');
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers['content-type'].includes('video/mp4'));
  });

  await t.test('7. Serve /live/public/js/vendor/three.module.js -> 200 text/javascript', async () => {
    const res = await request('/live/public/js/vendor/three.module.js');
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/javascript'));
  });

  await t.test('8. Block server code /live/server.mjs -> 404 (SEC-01)', async () => {
    const res = await request('/live/server.mjs');
    assert.strictEqual(res.status, 404, 'Must return 404 for server source code');
  });

  await t.test('9. Block config file /live/package.json -> 404 (SEC-01)', async () => {
    const res = await request('/live/package.json');
    assert.strictEqual(res.status, 404, 'Must return 404 for package.json');
  });

  await t.test('10. Block path traversal /live/../README.md -> 404 (SEC-01)', async () => {
    const res = await request('/live/../README.md');
    assert.strictEqual(res.status, 404, 'Must return 404 for directory traversal');
  });
});
