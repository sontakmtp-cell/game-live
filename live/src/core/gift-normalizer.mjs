// Gift Normalizer & Streak Aggregator — TikTok LIVE Arcade (v1.1)
// Spec: TECHNICAL_SPEC.md v1.1, Section 7.1 & QA EVT-01
// Enforces: 1 combo action for entire streak (no 1+2+3+3 double counting), dedup with TTL.

import { resolveGiftAction } from './gift-map.mjs';

export class GiftNormalizer {
  /**
   * @param {Object} options
   * @param {number} [options.streakTimeoutMs=6000] Thời gian chờ tối đa nếu mất gói repeatEnd
   * @param {number} [options.dedupTtlMs=10000] Thời gian ghi nhớ dedup
   */
  constructor(options = {}) {
    this.streakTimeoutMs = options.streakTimeoutMs || 6000;
    this.dedupTtlMs = options.dedupTtlMs || 10000;

    // Map theo dõi chuỗi đang chạy: streakKey -> { user, gift, maxCount, diamonds, timer }
    this.activeStreaks = new Map();

    // Map chống nhận trùng: txId -> timestamp
    this.processedTxIds = new Map();

    // Callback khi có action chuẩn hóa hoàn tất
    this.onActionReady = null;
  }

  /**
   * Tạo transaction ID hoặc streak key
   */
  getStreakKey(userId, giftId, groupId = '') {
    return `${userId || 'anon'}_${giftId || 'gift'}_${groupId || ''}`;
  }

  /**
   * Dọn dẹp dedup cũ
   */
  pruneDedup(now = Date.now()) {
    for (const [txId, ts] of this.processedTxIds.entries()) {
      if (now - ts > this.dedupTtlMs) {
        this.processedTxIds.delete(txId);
      }
    }
  }

  /**
   * Tiếp nhận một sự kiện Gift từ TikTok connector hoặc Simulator
   * @param {Object} rawEvent
   * @returns {Object|null} Trả về action nếu đã chuẩn hóa xong, null nếu đang chờ streak tích lũy
   */
  processGiftEvent(rawEvent) {
    const now = Date.now();
    this.pruneDedup(now);

    const user = {
      id: String(rawEvent.userId || rawEvent.uniqueId || 'sim-user').slice(0, 32),
      displayName: String(rawEvent.nickname || rawEvent.uniqueId || 'Người chơi').slice(0, 24),
    };

    const giftId = String(rawEvent.giftId || rawEvent.giftName || 'rose');
    const giftName = String(rawEvent.giftName || 'Hoa hồng').slice(0, 30);
    const diamonds = Math.max(1, Number(rawEvent.diamondCount || rawEvent.diamonds || 1));
    const repeatCount = Math.max(1, Number(rawEvent.repeatCount || rawEvent.count || 1));
    const repeatEnd = Boolean(rawEvent.repeatEnd);
    const giftType = Number(rawEvent.giftType ?? 1); // 1 = streak gift, khác 1 = non-streak

    const streakKey = this.getStreakKey(user.id, giftId, rawEvent.groupId);

    // Trường hợp 1: Quà KHÔNG PHẢI STREAK (Non-streak) -> Xuất ngay 1 action
    if (giftType !== 1) {
      const txId = rawEvent.msgId || `${streakKey}_${now}`;
      if (this.processedTxIds.has(txId)) return null;
      this.processedTxIds.set(txId, now);

      const action = resolveGiftAction(giftName, diamonds, repeatCount);
      const normalized = {
        requestId: `req_${now}_${Math.random().toString(36).substring(2, 7)}`,
        user,
        giftName,
        count: repeatCount,
        diamonds,
        action,
        isStreak: false,
        receivedAt: now,
      };

      if (this.onActionReady) this.onActionReady(normalized);
      return normalized;
    }

    // Trường hợp 2: Quà STREAK (Loại 1)
    let streak = this.activeStreaks.get(streakKey);

    if (!streak) {
      streak = {
        user,
        giftName,
        giftId,
        diamonds,
        maxCount: repeatCount,
        startTime: now,
        timer: null,
      };
      this.activeStreaks.set(streakKey, streak);
    } else {
      // Cập nhật số đếm lũy kế lớn nhất
      streak.maxCount = Math.max(streak.maxCount, repeatCount);
    }

    // Xóa timer cũ nếu có
    if (streak.timer) clearTimeout(streak.timer);

    // Nếu đã có cờ repeatEnd -> Chuỗi hoàn tất!
    if (repeatEnd) {
      this.activeStreaks.delete(streakKey);
      return this._emitStreakAction(streak, now);
    }

    // Nếu chưa có repeatEnd: Đặt timeout bảo vệ (phòng trường hợp mất gói tin mạng)
    streak.timer = setTimeout(() => {
      if (this.activeStreaks.has(streakKey)) {
        this.activeStreaks.delete(streakKey);
        this._emitStreakAction(streak, Date.now());
      }
    }, this.streakTimeoutMs);

    return null;
  }

  _emitStreakAction(streak, now) {
    const finalCount = streak.maxCount;
    const action = resolveGiftAction(streak.giftName, streak.diamonds, finalCount);

    const normalized = {
      requestId: `req_streak_${now}_${Math.random().toString(36).substring(2, 7)}`,
      user: streak.user,
      giftName: streak.giftName,
      count: finalCount,
      diamonds: streak.diamonds,
      action,
      isStreak: true,
      receivedAt: now,
    };

    if (this.onActionReady) this.onActionReady(normalized);
    return normalized;
  }

  /**
   * Reset toàn bộ trạng thái streak đang chờ
   */
  clear() {
    for (const streak of this.activeStreaks.values()) {
      if (streak.timer) clearTimeout(streak.timer);
    }
    this.activeStreaks.clear();
    this.processedTxIds.clear();
  }
}
