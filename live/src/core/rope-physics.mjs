// TikTok LIVE Arcade — Rope & Pendulum Physics Engine
// Spec: TECHNICAL_SPEC.md v1.1, Section 5
// Coordinates: Three.js world +Y-up, oscillation strictly in X–Y plane.

import { PHYSICS_CONFIG } from '../shared/config.mjs';

export class RopePhysics {
  /**
   * @param {Object} options
   * @param {number} [options.ropeLengthMeters] Chiều dài dây L (mặc định 0.65m)
   * @param {number} [options.gravity] Gia tốc trọng trường (mặc định 9.81)
   * @param {number} [options.idleAmplitudeRad] Biên độ nền (rad)
   * @param {number} [options.idlePeriodSec] Chu kỳ nền (s)
   * @param {number} [options.dampingRatio] Hệ số tắt dần zeta
   * @param {{x: number, y: number, z: number}} [options.anchor] Điểm neo (+Y up)
   * @param {number} [options.seed] Seed pha ban đầu
   */
  constructor(options = {}) {
    this.length = options.ropeLengthMeters ?? PHYSICS_CONFIG.ropeLengthMeters;
    this.gravity = options.gravity ?? PHYSICS_CONFIG.gravity;
    this.idleAmplitude = options.idleAmplitudeRad ?? PHYSICS_CONFIG.idleAmplitudeRad;
    this.idlePeriod = options.idlePeriodSec ?? PHYSICS_CONFIG.idlePeriodSec;
    this.idleOmega = (2 * Math.PI) / this.idlePeriod;

    // Tần số dao động riêng ω_n = sqrt(g / L)
    this.naturalOmega = Math.sqrt(this.gravity / this.length);
    this.dampingRatio = options.dampingRatio ?? PHYSICS_CONFIG.dampingRatio;

    // Điểm neo trong Three.js (+Y up)
    this.anchor = options.anchor
      ? { ...options.anchor }
      : { ...PHYSICS_CONFIG.defaultAnchor };

    // Pha ban đầu
    this.initialPhase = options.seed ? (options.seed % 1000) * 0.00628 : 0.0;

    // Trạng thái mô phỏng
    this.simTime = 0.0;
    this.simTick = 0;

    // Trạng thái dao động dư do tác động bên ngoài (disturbance)
    this.deltaAngle = 0.0; // δθ (rad)
    this.deltaAngularVelocity = 0.0; // δθ' (rad/s)

    // Trạng thái trước (dùng để nội suy mượt giữa 2 tick)
    this.prevDeltaAngle = 0.0;
    this.prevDeltaAngularVelocity = 0.0;

    // Biến dạng sóng cục bộ trên thân dây khi chạm (rope wave mode)
    this.waveAmplitude = 0.0;
    this.wavePhase = 0.0;

    // Độ sờn dây (rope wear, 0 -> 100)
    this.wear = 0;
  }

  /**
   * Tính góc dao động nền (idle) tại thời điểm t
   * @param {number} t Thời gian mô phỏng (giây)
   * @returns {number} Góc idle (rad)
   */
  getIdleAngle(t = this.simTime) {
    return this.idleAmplitude * Math.sin(this.idleOmega * t + this.initialPhase);
  }

  /**
   * Tính vận tốc góc dao động nền (idle) tại thời điểm t
   * @param {number} t Thời gian mô phỏng (giây)
   * @returns {number} Vận tốc góc idle (rad/s)
   */
  getIdleAngularVelocity(t = this.simTime) {
    return this.idleAmplitude * this.idleOmega * Math.cos(this.idleOmega * t + this.initialPhase);
  }

  /**
   * Tổng góc hiển thị hiện tại: θ_display = θ_idle + δθ
   * @returns {number} Tổng góc (rad)
   */
  get totalAngle() {
    return this.getIdleAngle() + this.deltaAngle;
  }

  /**
   * Tổng vận tốc góc hiện tại: θ'_display = θ'_idle + δθ'
   * @returns {number} Tổng vận tốc góc (rad/s)
   */
  get totalAngularVelocity() {
    return this.getIdleAngularVelocity() + this.deltaAngularVelocity;
  }

  /**
   * Thực hiện 1 bước tích phân fixed-timestep (Semi-implicit Euler / Symplectic)
   * Phương trình dao động tắt dần: δθ'' + 2*ζ*ω_n*δθ' + ω_n²*δθ = 0
   * @param {number} dt Bước thời gian (mặc định 1/120s)
   */
  fixedStep(dt = PHYSICS_CONFIG.fixedTimestep) {
    // Lưu lại trạng thái trước
    this.prevDeltaAngle = this.deltaAngle;
    this.prevDeltaAngularVelocity = this.deltaAngularVelocity;

    // Gia tốc góc của phần dư
    const acceleration =
      -2.0 * this.dampingRatio * this.naturalOmega * this.deltaAngularVelocity -
      this.naturalOmega * this.naturalOmega * this.deltaAngle;

    // Tích phân Symplectic Euler (bảo toàn năng lượng và ổn định số học cao)
    this.deltaAngularVelocity += acceleration * dt;
    this.deltaAngle += this.deltaAngularVelocity * dt;

    // Giới hạn góc an toàn
    const maxA = PHYSICS_CONFIG.maxAngleRad;
    if (this.deltaAngle > maxA) {
      this.deltaAngle = maxA;
      if (this.deltaAngularVelocity > 0) this.deltaAngularVelocity = 0;
    } else if (this.deltaAngle < -maxA) {
      this.deltaAngle = -maxA;
      if (this.deltaAngularVelocity < 0) this.deltaAngularVelocity = 0;
    }

    // Tắt dần sóng dây cục bộ
    this.waveAmplitude *= Math.exp(-8.0 * dt);
    this.wavePhase += 24.0 * dt;
    if (Math.abs(this.waveAmplitude) < 0.0001) {
      this.waveAmplitude = 0;
    }

    // Cập nhật đồng hồ mô phỏng
    this.simTime += dt;
    this.simTick += 1;
  }

  /**
   * Cập nhật mô phỏng với thời gian delta tùy ý (dùng bộ tích lũy fixed-timestep)
   * @param {number} elapsedSec Thời gian trôi qua thực tế
   * @param {number} [fixedDt] Bước tích phân chuẩn (1/120s)
   */
  update(elapsedSec, fixedDt = PHYSICS_CONFIG.fixedTimestep) {
    // Giới hạn catch-up tránh vòng lặp treo khi tab bị inactive
    const clampedElapsed = Math.min(elapsedSec, 0.1);
    let remaining = clampedElapsed;
    while (remaining >= fixedDt) {
      this.fixedStep(fixedDt);
      remaining -= fixedDt;
    }
  }

  /**
   * Tác động xung lực va chạm (impulse) lên vận tốc góc.
   * QUY TẮC BẮT BUỘC: Góc vị trí δθ không bị thay đổi (không teleport).
   * Vận tốc δθ' thay đổi đột biến bởi signedImpulse.
   * @param {number} signedImpulseRadPerSec Xung lực vận tốc góc (rad/s, dương = sang phải, âm = sang trái)
   * @param {number} [wearDelta=0] Độ sờn tăng thêm
   * @param {number} [contactFraction=0.5] Vị trí tiếp xúc trên dây (0 = neo, 1 = điện thoại)
   */
  applyImpulse(signedImpulseRadPerSec, wearDelta = 0, contactFraction = 0.5) {
    this.deltaAngularVelocity += signedImpulseRadPerSec;
    this.wear = Math.min(100, Math.max(0, this.wear + (wearDelta || 0)));

    // Kích thích biến dạng sóng dây cục bộ (ripple)
    this.waveAmplitude += signedImpulseRadPerSec * 0.025;
    this.contactFraction = contactFraction;
  }

  /**
   * Vị trí điện thoại trong hệ tọa độ Three.js (+Y up, dao động trong mặt phẳng X–Y):
   *   xPhone = xAnchor + L * sin(θ)
   *   yPhone = yAnchor - L * cos(θ)
   *   zPhone = zAnchor (P0: không dao động theo chiều sâu)
   * @param {number} [alpha=1.0] Hệ số nội suy giữa prev và current (0..1)
   * @returns {{x: number, y: number, z: number, theta: number}}
   */
  getPhoneTransform(alpha = 1.0) {
    // Nội suy mượt giữa 2 tick nếu renderer chạy tốc độ khung hình khác
    const interpolatedDelta =
      this.prevDeltaAngle * (1 - alpha) + this.deltaAngle * alpha;
    const theta = this.getIdleAngle() + interpolatedDelta;

    const x = this.anchor.x + this.length * Math.sin(theta);
    const y = this.anchor.y - this.length * Math.cos(theta);
    const z = this.anchor.z;

    return {
      x,
      y,
      z,
      theta,
      // Góc quay Z của điện thoại ăn khớp hoàn hảo với góc nghiêng của dây
      rotationZ: theta,
    };
  }

  /**
   * Tạo các điểm đốt trên thân dây (dùng vẽ Line / Spline / Cylinder chuỗi)
   * Có hỗ trợ chế độ sóng uốn cục bộ (waveMode) khi va chạm.
   * @param {number} [segments=16] Số phân đoạn dây
   * @param {number} [alpha=1.0] Nội suy
   * @returns {Array<{x: number, y: number, z: number}>}
   */
  getRopePoints(segments = 16, alpha = 1.0) {
    const phone = this.getPhoneTransform(alpha);
    const points = [];

    // Hướng tiếp tuyến thẳng của dây
    const theta = phone.theta;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);

    // Vector pháp tuyến ngang của dây (vuông góc với trục dây trong mặt phẳng X-Y)
    const normX = cosT;
    const normY = sinT;

    for (let i = 0; i <= segments; i++) {
      const s = i / segments; // 0 = anchor, 1 = phone

      // Vị trí thẳng cơ bản
      let px = this.anchor.x + s * this.length * sinT;
      let py = this.anchor.y - s * this.length * cosT;
      const pz = this.anchor.z;

      // Cộng biến dạng sóng cục bộ (đầu trên s=0 và đầu dưới s=1 cố định ở 0)
      if (this.waveAmplitude !== 0) {
        const shape = Math.sin(Math.PI * s); // Điểm giữa uốn lớn nhất, 2 đầu = 0
        const wave = this.waveAmplitude * shape * Math.cos(this.wavePhase);
        px += wave * normX;
        py += wave * normY;
      }

      points.push({ x: px, y: py, z: pz });
    }

    return points;
  }

  /**
   * Reset trạng thái dao động
   * @param {boolean} [soft=false] Nếu true: giảm nhanh về 0 mà không giật cục
   */
  reset(soft = false) {
    if (soft) {
      this.deltaAngularVelocity *= 0.1;
      this.deltaAngle *= 0.1;
    } else {
      this.deltaAngle = 0.0;
      this.deltaAngularVelocity = 0.0;
      this.prevDeltaAngle = 0.0;
      this.prevDeltaAngularVelocity = 0.0;
    }
    this.waveAmplitude = 0.0;
  }

  /**
   * Lấy snapshot trạng thái
   */
  getSnapshot() {
    return {
      simTick: this.simTick,
      simTime: this.simTime,
      deltaAngleRad: this.deltaAngle,
      deltaAngularVelocityRadPerSec: this.deltaAngularVelocity,
      idleAngleRad: this.getIdleAngle(),
      idleVelocityRadPerSec: this.getIdleAngularVelocity(),
      totalAngleRad: this.totalAngle,
      totalAngularVelocityRadPerSec: this.totalAngularVelocity,
      wear: this.wear,
      anchor: { ...this.anchor },
      length: this.length,
    };
  }

  /**
   * Khôi phục snapshot
   * @param {Object} snap
   */
  restoreSnapshot(snap) {
    if (!snap) return;
    if (typeof snap.simTick === 'number') this.simTick = snap.simTick;
    if (typeof snap.simTime === 'number') this.simTime = snap.simTime;
    if (typeof snap.deltaAngleRad === 'number') {
      this.deltaAngle = snap.deltaAngleRad;
      this.prevDeltaAngle = snap.deltaAngleRad;
    }
    if (typeof snap.deltaAngularVelocityRadPerSec === 'number') {
      this.deltaAngularVelocity = snap.deltaAngularVelocityRadPerSec;
      this.prevDeltaAngularVelocity = snap.deltaAngularVelocityRadPerSec;
    }
    if (typeof snap.wear === 'number') this.wear = snap.wear;
  }
}
