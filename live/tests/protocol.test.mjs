// Tests for Protocol Validator — TikTok LIVE Arcade (v1.1)

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateClientMessage, Protocol, MESSAGE_TYPES } from '../src/core/protocol.mjs';

test('Protocol: Client Telemetry Validation', () => {
  // 1. Prepared message
  const validPrepared = {
    type: MESSAGE_TYPES.OVERLAY_PREPARED,
    rendererId: 'rend-123',
    requestId: 'req-001',
    roundId: 1,
    status: 'ready',
    firstFrameDecoded: true,
  };
  assert.strictEqual(validateClientMessage(validPrepared).valid, true);

  // Thiếu rendererId
  assert.strictEqual(validateClientMessage({ ...validPrepared, rendererId: '' }).valid, false);

  // Status sai
  assert.strictEqual(validateClientMessage({ ...validPrepared, status: 'unknown' }).valid, false);

  // 2. Attack ACK message
  const validAck = {
    type: MESSAGE_TYPES.OVERLAY_ATTACK_ACK,
    rendererId: 'rend-123',
    requestId: 'req-001',
    roundId: 1,
    mediaTimeMs: 500,
    mediaDriftMs: 12,
  };
  assert.strictEqual(validateClientMessage(validAck).valid, true);

  // Thiếu drift
  assert.strictEqual(validateClientMessage({ ...validAck, mediaDriftMs: null }).valid, false);

  // 3. Drift Abort
  const validAbort = {
    type: MESSAGE_TYPES.OVERLAY_DRIFT_ABORT,
    rendererId: 'rend-123',
    requestId: 'req-001',
    reason: 'decode_stall',
  };
  assert.strictEqual(validateClientMessage(validAbort).valid, true);
});

test('Protocol: Message Creation Helpers', () => {
  const armed = Protocol.createArmed({
    requestId: 'req-1',
    roundId: 2,
    rendererId: 'rend-1',
    serverStartAtMs: 1000,
    contactMs: 800,
  });

  assert.strictEqual(armed.type, MESSAGE_TYPES.ATTACK_ARMED);
  assert.strictEqual(armed.expectedContactAtMs, 1800);
  assert.strictEqual(armed.v, 1);

  const contact = Protocol.createContact({
    requestId: 'req-1',
    roundId: 2,
    simTick: 500,
    result: 'touch',
    angularImpulseRadPerSec: 0.65,
    ropeWearDelta: 2,
    ropeWearTotal: 10,
  });

  assert.strictEqual(contact.type, MESSAGE_TYPES.ATTACK_CONTACT);
  assert.strictEqual(contact.ropeWearTotal, 10);
});
