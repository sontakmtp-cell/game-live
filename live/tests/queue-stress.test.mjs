// Tests for Queue Stress & 100 Gift Simulation — TikTok LIVE Arcade (v1.1)
// Covers: EVT-02

import test from 'node:test';
import assert from 'node:assert/strict';
import { AttackScheduler } from '../src/core/attack-scheduler.mjs';
import { GameState } from '../src/core/game-state.mjs';

test('EVT-02: 100 requests simulation — bounded queue, combo batching, no silent drops', () => {
  const gameState = new GameState();
  const scheduler = new AttackScheduler({
    gameState,
    maxQueue: 20, // Giới hạn hàng đợi 20
  });

  scheduler.pause(); // Tạm dừng pump để dồn hàng đợi kiểm tra

  let totalGiftsPushed = 0;
  for (let i = 0; i < 100; i++) {
    const success = scheduler.enqueue({
      requestId: `req_sim_${i}`,
      user: { id: `user_${i % 10}`, displayName: `Player ${i % 10}` },
      count: 1,
      diamonds: 1,
      action: { toolId: 'knife_left', side: 'left', contactMs: 800, durationMs: 2400 },
    });
    assert.strictEqual(success, true);
    totalGiftsPushed++;
  }

  // Hàng đợi không được vượt quá maxQueue = 20
  assert.strictEqual(scheduler.queue.length, 20);

  // Các sự kiện vượt quá 20 đã được gộp số lượng vào combo item cuối cùng
  const lastItem = scheduler.queue[scheduler.queue.length - 1];
  // 19 items đầu x1 = 19 gifts; item thứ 20 chứa 81 gifts -> Tổng cộng đúng 100 gifts!
  assert.strictEqual(lastItem.count, 81, 'Các quà vượt giới hạn phải được gộp an toàn vào combo, không bị drop');
  assert.strictEqual(lastItem.diamonds, 81);

  // Resume và kiểm tra dọn sạch hàng đợi
  scheduler.clearQueue();
  assert.strictEqual(scheduler.queue.length, 0);
});
