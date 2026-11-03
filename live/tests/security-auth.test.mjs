// Tests for Local Admin Auth & Session Cookie — TikTok LIVE Arcade (v1.1)
// Covers: SEC-02, SEC-03

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';

const TEST_PORT = 3105;
let serverProc = null;
let bootstrapToken = null;

function request(pathStr, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path: pathStr,
        method: 'GET',
        headers: {
          Host: `127.0.0.1:${TEST_PORT}`,
          ...headers,
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

test('SEC-02 & SEC-03: Local Admin Bootstrap Token, HttpOnly Cookie & WS Auth', async (t) => {
  // 1. Khởi động server và bắt bootstrap token từ console output
  await new Promise((resolve, reject) => {
    serverProc = spawn('node', ['server.mjs'], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(TEST_PORT), HOST: '127.0.0.1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    serverProc.stdout.on('data', (d) => {
      const msg = d.toString();
      const match = msg.match(/token=([a-f0-9]{64})/);
      if (match) {
        bootstrapToken = match[1];
        resolve();
      }
    });

    serverProc.stderr.on('data', (d) => console.error(d.toString()));
    serverProc.on('error', reject);
  });

  t.after(() => {
    if (serverProc) serverProc.kill();
  });

  assert.ok(bootstrapToken, 'Server phải sinh bootstrap token 256-bit');

  let sessionCookie = null;

  await t.test('1. Truy cập control.html không có token/cookie -> Bị chặn 403 Forbidden', async () => {
    const res = await request('/live/control.html');
    assert.strictEqual(res.status, 403);
    assert.ok(res.body.includes('Yêu cầu xác thực Admin'));
  });

  await t.test('2. Truy cập với token sai -> Bị chặn 403 Forbidden', async () => {
    const res = await request('/live/control.html?token=invalid_token_123');
    assert.strictEqual(res.status, 403);
  });

  await t.test('3. Truy cập với bootstrap token đúng -> 303 Redirect + Set-Cookie HttpOnly Strict (SEC-03)', async () => {
    const res = await request(`/live/control.html?token=${bootstrapToken}`);
    assert.strictEqual(res.status, 303);
    assert.strictEqual(res.headers.location, '/live/control.html', 'Phải redirect về URL sạch');

    const setCookie = res.headers['set-cookie']?.[0] || '';
    assert.ok(setCookie.includes('arcade_session='), 'Phải set cookie arcade_session');
    assert.ok(setCookie.includes('HttpOnly'), 'Cookie phải có cờ HttpOnly');
    assert.ok(setCookie.includes('SameSite=Strict'), 'Cookie phải có cờ SameSite=Strict');

    const cookieMatch = setCookie.match(/arcade_session=([a-f0-9]{64})/);
    assert.ok(cookieMatch);
    sessionCookie = cookieMatch[0];
  });

  await t.test('4. Token bootstrap bị vô hiệu ngay sau 1 lần dùng (Single-use token) (SEC-03)', async () => {
    const res = await request(`/live/control.html?token=${bootstrapToken}`);
    assert.strictEqual(res.status, 403, 'Tái sử dụng token đã dùng phải trả 403');
  });

  await t.test('5. Truy cập control.html với Cookie session hợp lệ -> 200 OK', async () => {
    const res = await request('/live/control.html', {
      Cookie: sessionCookie,
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.includes('Bảng điều khiển'));
  });

  await t.test('6. Giả mạo WS role=control không có Cookie session -> Bị từ chối 401 (SEC-02)', async () => {
    await new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}/ws?role=control`);
      ws.on('error', (err) => {
        assert.ok(err.message.includes('401') || err.message.includes('Unexpected server response'));
        resolve();
      });
      ws.on('open', () => {
        assert.fail('Không được phép mở WS control khi thiếu Cookie');
      });
    });
  });

  await t.test('7. Kết nối WS role=control kèm Cookie session hợp lệ -> Cho phép kết nối (SEC-02)', async () => {
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}/ws?role=control`, {
        headers: {
          Cookie: sessionCookie,
        },
      });
      ws.on('open', () => {
        ws.close();
        resolve();
      });
      ws.on('error', reject);
    });
  });
});
