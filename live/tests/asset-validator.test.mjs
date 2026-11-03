// Tests for Asset Validator — TikTok LIVE Arcade
// Covers: VIDEO-01, VIDEO-02, VIDEO-04

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateVideoAsset } from '../src/core/asset-validator.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

test('VIDEO-01: Cleanplate loop video validator', async () => {
  const cleanplatePath = path.join(ROOT, 'public/assets/video/grinder-clean-plate.mp4');
  const res = await validateVideoAsset(cleanplatePath, {
    expectedDurationMs: 10000,
    expectedFps: 30,
    requireFirstFrameKeyframe: true,
  });

  assert.strictEqual(res.valid, true, `Cleanplate video must be valid. Errors: ${res.errors.join(', ')}`);
  assert.strictEqual(res.metadata.firstPacketIsKeyframe, true, 'Cleanplate must start with a keyframe');
  assert.ok(Math.abs(res.metadata.durationMs - 10000) < 150, 'Duration should be ~10s');
});

test('VIDEO-02: Action clip trim validation — start at t=0, keyframe at frame 0, contact 800ms', async () => {
  const actionClipPath = path.join(ROOT, 'public/assets/video/knife-left-touch.mp4');
  const res = await validateVideoAsset(actionClipPath, {
    expectedDurationMs: 2400,
    expectedFps: 30,
    requireFirstFrameKeyframe: true,
    maxPtsStartMs: 35,
  });

  assert.strictEqual(res.valid, true, `Action clip must be valid. Errors: ${res.errors.join(', ')}`);
  assert.strictEqual(res.metadata.firstPacketIsKeyframe, true, 'First frame must be keyframe');
  assert.ok(res.metadata.firstPacketPtsSec <= 0.035, 'Start PTS must begin at t=0');
  assert.ok(Math.abs(res.metadata.durationMs - 2400) < 150, 'Duration must be ~2400ms');
});

test('VIDEO-04: Validator strictly rejects invalid assets (missing file or PTS out of spec)', async () => {
  // 1. File không tồn tại
  const badPath = path.join(ROOT, 'public/assets/video/non-existent-clip.mp4');
  const res1 = await validateVideoAsset(badPath);
  assert.strictEqual(res1.valid, false);
  assert.ok(res1.errors[0].includes('File không tồn tại'));

  // 2. Clip bị lệch FPS kỳ vọng
  const actionClipPath = path.join(ROOT, 'public/assets/video/knife-left-touch.mp4');
  const res2 = await validateVideoAsset(actionClipPath, {
    expectedFps: 60, // Đòi 60fps trong khi file là 30fps
  });
  assert.strictEqual(res2.valid, false);
  assert.ok(res2.errors.some(e => e.includes('FPS không đạt')));

  // 3. Clip đòi hỏi PTS chặt chẽ 0ms nhưng đặt ngưỡng khắt khe âm
  const res3 = await validateVideoAsset(actionClipPath, {
    maxPtsStartMs: -1, // Sẽ fail vì PTS thực tế >= 0
  });
  assert.strictEqual(res3.valid, false);
  assert.ok(res3.errors.some(e => e.includes('PTS bắt đầu')));
});
