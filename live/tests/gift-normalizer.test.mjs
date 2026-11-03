// Tests for GiftNormalizer — TikTok LIVE Arcade (v1.1)
// Covers: EVT-01

import test from 'node:test';
import assert from 'node:assert/strict';
import { GiftNormalizer } from '../src/core/gift-normalizer.mjs';

test('EVT-01: Gift streak 1, 2, 3, final — only records 1 combo with total count 3', () => {
  const normalizer = new GiftNormalizer();
  const emitted = [];
  normalizer.onActionReady = (act) => emitted.push(act);

  const userId = 'user_99';
  const giftId = 'rose';

  // Sự kiện streak 1 (repeatEnd: false)
  const res1 = normalizer.processGiftEvent({
    userId,
    giftId,
    giftName: 'Hoa hồng',
    giftType: 1, // streak
    repeatCount: 1,
    repeatEnd: false,
    diamondCount: 1,
  });
  assert.strictEqual(res1, null, 'Chưa xong streak thì không emit');
  assert.strictEqual(emitted.length, 0);

  // Sự kiện streak 2 (repeatEnd: false)
  const res2 = normalizer.processGiftEvent({
    userId,
    giftId,
    giftName: 'Hoa hồng',
    giftType: 1,
    repeatCount: 2,
    repeatEnd: false,
    diamondCount: 1,
  });
  assert.strictEqual(res2, null);
  assert.strictEqual(emitted.length, 0);

  // Sự kiện streak 3 kết thúc (repeatEnd: true)
  const res3 = normalizer.processGiftEvent({
    userId,
    giftId,
    giftName: 'Hoa hồng',
    giftType: 1,
    repeatCount: 3,
    repeatEnd: true,
    diamondCount: 1,
  });

  assert.notStrictEqual(res3, null, 'Khi repeatEnd=true phải xuất action');
  assert.strictEqual(emitted.length, 1, 'Chỉ được xuất ĐÚNG 1 combo action duy nhất');
  assert.strictEqual(emitted[0].count, 3, 'Tổng số quà ghi nhận phải là 3 (không phải 1+2+3=6)');
  assert.strictEqual(emitted[0].isStreak, true);
});

test('EVT-01: Non-streak gift x5 emits exactly 1 event', () => {
  const normalizer = new GiftNormalizer();
  const emitted = [];
  normalizer.onActionReady = (act) => emitted.push(act);

  normalizer.processGiftEvent({
    userId: 'user_456',
    giftId: 'corgi',
    giftName: 'Chú chó Corgi',
    giftType: 2, // non-streak
    count: 5,
    diamondCount: 10,
    msgId: 'tx_001',
  });

  assert.strictEqual(emitted.length, 1);
  assert.strictEqual(emitted[0].count, 5);
  assert.strictEqual(emitted[0].isStreak, false);

  // Gửi lại cùng msgId -> Phải bị dedup chặn
  normalizer.processGiftEvent({
    userId: 'user_456',
    giftId: 'corgi',
    giftName: 'Chú chó Corgi',
    giftType: 2,
    count: 5,
    diamondCount: 10,
    msgId: 'tx_001',
  });

  assert.strictEqual(emitted.length, 1, 'Duplicate msgId must be ignored');
});
