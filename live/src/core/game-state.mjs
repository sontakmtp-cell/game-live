// Game State Machine & Round Manager — TikTok LIVE Arcade (v1.1)
// Spec: TECHNICAL_SPEC.md v1.1, Section 5.4, 7.2 & Protocol Section 8

import { RopePhysics } from './rope-physics.mjs';

export const GAME_PHASES = {
  IDLE: 'IDLE',
  ACTION_PENDING: 'ACTION_PENDING',
  ATTACK_PLAYING: 'ATTACK_PLAYING',
  CONTACT: 'CONTACT',
  RECOVERING: 'RECOVERING',
  BREAKING: 'BREAKING',
  FALLING: 'FALLING',
  CRUSH_SEQUENCE: 'CRUSH_SEQUENCE',
  RESETTING: 'RESETTING',
};

export class GameState {
  /**
   * @param {Object} options
   * @param {number} [options.maxWear=100] Ngưỡng đứt dây
   * @param {number} [options.seed=9981] Seed pha vật lý
   */
  constructor(options = {}) {
    this.maxWear = options.maxWear || 100;
    this.seed = options.seed || Math.floor(Math.random() * 10000);

    this.roundId = 1;
    this.phase = GAME_PHASES.IDLE;
    this.ropeWear = 0;

    // Động cơ vật lý con lắc
    this.physics = new RopePhysics({ seed: this.seed });

    // Hành động đang thực thi
    this.activeAttack = null;

    // Thống kê round
    this.stats = {
      totalAttacks: 0,
      totalHits: 0,
      totalMisses: 0,
      totalBreaks: 0,
    };
  }

  /**
   * Cập nhật tick mô phỏng vật lý
   * @param {number} dt Thời gian (s)
   */
  tick(dt = 1 / 120) {
    this.physics.fixedStep(dt);

    // Chuyển pha tự động nếu đang recovering và dao động đã tắt
    if (this.phase === GAME_PHASES.RECOVERING) {
      if (Math.abs(this.physics.deltaAngle) < 0.002 && Math.abs(this.physics.deltaAngularVelocity) < 0.005) {
        this.phase = GAME_PHASES.IDLE;
      }
    }
  }

  /**
   * Bắt đầu một lượt tấn công (chuyển sang ATTACK_PLAYING)
   * @param {Object} attackInfo
   */
  startAttack(attackInfo) {
    this.activeAttack = attackInfo;
    this.phase = GAME_PHASES.ATTACK_PLAYING;
    this.stats.totalAttacks++;
  }

  /**
   * Thực hiện va chạm (Commit Contact)
   * @param {number} wearDelta Độ sờn cộng thêm
   * @param {number} impulse Xung lực (rad/s)
   * @param {string} side 'left' | 'right'
   * @returns {{ didBreak: boolean, newWear: number }}
   */
  commitContact(wearDelta = 2, impulse = 0.65, side = 'left') {
    this.ropeWear = Math.min(this.maxWear, this.ropeWear + wearDelta);
    this.physics.applyImpulse(impulse, wearDelta);
    this.stats.totalHits++;

    if (this.ropeWear >= this.maxWear) {
      this.phase = GAME_PHASES.BREAKING;
      this.stats.totalBreaks++;
      return { didBreak: true, newWear: this.ropeWear };
    }

    this.phase = GAME_PHASES.RECOVERING;
    return { didBreak: false, newWear: this.ropeWear };
  }

  /**
   * Thực hiện đánh hụt (Commit Miss)
   */
  commitMiss() {
    this.stats.totalMisses++;
    this.phase = Math.abs(this.physics.deltaAngle) > 0.005 ? GAME_PHASES.RECOVERING : GAME_PHASES.IDLE;
  }

  /**
   * Hoàn tất hành động và dọn dẹp activeAttack
   */
  finishAttack() {
    this.activeAttack = null;
    if (this.phase === GAME_PHASES.ATTACK_PLAYING) {
      this.phase = Math.abs(this.physics.deltaAngle) > 0.005 ? GAME_PHASES.RECOVERING : GAME_PHASES.IDLE;
    }
  }

  /**
   * Kích hoạt đứt dây thủ công (Test only)
   */
  forceBreak() {
    this.ropeWear = this.maxWear;
    this.phase = GAME_PHASES.BREAKING;
    this.stats.totalBreaks++;
  }

  /**
   * Đặt lại round mới sau khi rơi điện thoại
   */
  resetRound() {
    this.roundId++;
    this.ropeWear = 0;
    this.phase = GAME_PHASES.IDLE;
    this.activeAttack = null;
    this.physics.reset(false);
  }

  /**
   * Tạo snapshot đồng bộ cho client
   * @param {number} queueLength Độ dài hàng đợi hiện tại
   */
  getSnapshot(queueLength = 0) {
    const physSnap = this.physics.getSnapshot();
    return {
      roundId: this.roundId,
      phase: this.phase,
      simTick: physSnap.simTick,
      seed: this.seed,
      physics: {
        deltaAngleRad: physSnap.deltaAngleRad,
        deltaAngularVelocityRadPerSec: physSnap.deltaAngularVelocityRadPerSec,
        idlePhaseRad: physSnap.idleAngleRad,
      },
      ropeWear: this.ropeWear,
      queueLength,
      activeAttack: this.activeAttack ? { ...this.activeAttack } : null,
      clipManifestVersion: 'v1.1',
    };
  }
}
