// Tests for AttackScheduler — TikTok LIVE Arcade (v1.1)
// Covers: EVT-05, EVT-06, EVT-07

import test from 'node:test';
import assert from 'node:assert/strict';
import { AttackScheduler } from '../src/core/attack-scheduler.mjs';
import { GameState } from '../src/core/game-state.mjs';
import { MESSAGE_TYPES } from '../src/core/protocol.mjs';

test('EVT-05: Missing ACK before deadline -> attack:aborted, does not increase wear', async () => {
  const gameState = new GameState();
  const broadcastMessages = [];
  const scheduler = new AttackScheduler({
    gameState,
    prepareTimeoutMs: 1000,
    ackDeadlineBeforeContactMs: 150,
    broadcast: (msg) => broadcastMessages.push(msg),
  });

  scheduler.setPrimaryRenderer('rend-001');

  // Enqueue 1 action
  scheduler.enqueue({
    requestId: 'req-evt05',
    user: { id: 'u1', displayName: 'Viewer 1' },
    action: { toolId: 'knife_left', side: 'left', contactMs: 400, durationMs: 1000, impulseRadPerSec: 0.65, wearDelta: 2 },
  });

  // 1. Nhận scheduled
  const scheduled = broadcastMessages.find(m => m.type === MESSAGE_TYPES.ATTACK_SCHEDULED);
  assert.ok(scheduled);

  // 2. Gửi overlay:prepared
  scheduler.handleOverlayPrepared({
    type: MESSAGE_TYPES.OVERLAY_PREPARED,
    rendererId: 'rend-001',
    requestId: 'req-evt05',
    roundId: 1,
    status: 'ready',
  });

  const armed = broadcastMessages.find(m => m.type === MESSAGE_TYPES.ATTACK_ARMED);
  assert.ok(armed);

  // 3. KHÔNG GỬI ACK -> Chờ quá deadline (leadTime 300 + contact 400 = 700ms; deadline tại 700 - 150 = 550ms)
  await new Promise(r => setTimeout(r, 650));

  // Kiểm tra: Phải nhận thông điệp abort
  const aborted = broadcastMessages.find(m => m.type === MESSAGE_TYPES.ATTACK_ABORTED);
  assert.ok(aborted, 'Phải có thông điệp attack:aborted khi thiếu ACK');
  assert.ok(aborted.reason.includes('ack_timeout') || aborted.reason.includes('missing_ack'));

  // Độ sờn dây KHÔNG được tăng!
  assert.strictEqual(gameState.ropeWear, 0, 'Rope wear must remain 0 when aborted');
});

test('EVT-06: Commit-once rule — duplicate or late ACK does not rollback contact', async () => {
  const gameState = new GameState();
  const broadcastMessages = [];
  const scheduler = new AttackScheduler({
    gameState,
    broadcast: (msg) => broadcastMessages.push(msg),
  });

  scheduler.setPrimaryRenderer('rend-002');

  scheduler.enqueue({
    requestId: 'req-evt06',
    user: { id: 'u2', displayName: 'Viewer 2' },
    action: { toolId: 'knife_left', side: 'left', contactMs: 300, durationMs: 800, impulseRadPerSec: 0.65, wearDelta: 2 },
  });

  // Prepared
  scheduler.handleOverlayPrepared({
    type: MESSAGE_TYPES.OVERLAY_PREPARED,
    rendererId: 'rend-002',
    requestId: 'req-evt06',
    roundId: 1,
    status: 'ready',
  });

  // Gửi ACK hợp lệ đúng hạn
  scheduler.handleAttackAck({
    type: MESSAGE_TYPES.OVERLAY_ATTACK_ACK,
    rendererId: 'rend-002',
    requestId: 'req-evt06',
    roundId: 1,
    mediaTimeMs: 200,
    mediaDriftMs: 5,
  });

  // Chờ contact tick xảy ra (lead 300 + contact 300 = 600ms)
  await new Promise(r => setTimeout(r, 650));

  const contact = broadcastMessages.find(m => m.type === MESSAGE_TYPES.ATTACK_CONTACT);
  assert.ok(contact, 'Phải commit contact đúng hạn');
  assert.strictEqual(gameState.ropeWear, 2, 'Rope wear phải tăng thành 2');

  // Gửi tiếp một duplicate/late ACK sau khi đã commit
  scheduler.handleAttackAck({
    type: MESSAGE_TYPES.OVERLAY_ATTACK_ACK,
    rendererId: 'rend-002',
    requestId: 'req-evt06',
    roundId: 1,
    mediaTimeMs: 220,
    mediaDriftMs: 8,
  });

  // Kết quả wear vẫn là 2, không bị rollback hay nhân đôi!
  assert.strictEqual(gameState.ropeWear, 2, 'Rope wear must stay 2, never rolled back');
});

test('EVT-07: Primary renderer disconnects after prepare -> aborts pending action', async () => {
  const gameState = new GameState();
  const broadcastMessages = [];
  const scheduler = new AttackScheduler({
    gameState,
    broadcast: (msg) => broadcastMessages.push(msg),
  });

  scheduler.setPrimaryRenderer('rend-003');

  scheduler.enqueue({
    requestId: 'req-evt07',
    user: { id: 'u3', displayName: 'Viewer 3' },
    action: { toolId: 'knife_left', side: 'left', contactMs: 500, durationMs: 1200, impulseRadPerSec: 0.65, wearDelta: 2 },
  });

  // Prepared
  scheduler.handleOverlayPrepared({
    type: MESSAGE_TYPES.OVERLAY_PREPARED,
    rendererId: 'rend-003',
    requestId: 'req-evt07',
    roundId: 1,
    status: 'ready',
  });

  // Giả lập: Renderer chính bị disconnect đột ngột trước khi commit
  scheduler.handleRendererDisconnect('rend-003');

  const aborted = broadcastMessages.find(m => m.type === MESSAGE_TYPES.ATTACK_ABORTED);
  assert.ok(aborted, 'Phải abort khi primary renderer bị ngắt kết nối');
  assert.strictEqual(aborted.reason, 'renderer_disconnected');
  assert.strictEqual(gameState.ropeWear, 0, 'Rope wear không được tăng');
});
