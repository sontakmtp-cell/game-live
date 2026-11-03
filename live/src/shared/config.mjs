// TikTok LIVE Arcade — Configuration & Physics Constants
// Spec: TECHNICAL_SPEC.md v1.1, Section 5

export const PHYSICS_CONFIG = {
  // Dây dài L = 0.65m
  ropeLengthMeters: 0.65,

  // Gia tốc trọng trường g = 9.81 m/s²
  gravity: 9.81,

  // Dao động nền (idle): biên độ A = 1.5° = ~0.02618 rad, chu kỳ T = 2.0s
  idleAmplitudeRad: (1.5 * Math.PI) / 180,
  idlePeriodSec: 2.0,
  get idleOmega() {
    return (2 * Math.PI) / this.idlePeriodSec;
  },

  // Tần số dao động tự nhiên ω_n = sqrt(g / L) ≈ 3.885 rad/s
  get naturalOmega() {
    return Math.sqrt(this.gravity / this.ropeLengthMeters);
  },

  // Hệ số tắt dần ζ (damping ratio) ≈ 0.18 để dao động tắt êm sau va chạm
  dampingRatio: 0.18,

  // Bước tích phân cố định: 1/120 giây (~8.333ms)
  fixedTimestep: 1 / 120,

  // Xung lực va chạm mặc định (rad/s)
  defaultImpulseRadPerSec: 0.65,

  // Điểm neo mặc định trong Three.js (+Y-up)
  defaultAnchor: { x: 0.0, y: 1.25, z: 0.0 },

  // Giới hạn an toàn
  maxAngleRad: (65 * Math.PI) / 180, // Giới hạn góc tối đa 65°
};

export const CAMERA_CONFIG = {
  id: 'CAMERA_MAIN',
  resolution: [1080, 1920],
  fps: 30,
  fovDeg: 40,
  near: 0.1,
  far: 100,
  // Tọa độ Three.js +Y-up (sau khi đổi từ Blender +Z-up)
  position: [0.0, 1.2, 3.2],
  target: [0.0, 0.6, 0.0],
  up: [0.0, 1.0, 0.0],
};

/**
 * Chuyển đổi tọa độ Blender (+Z up, +Y forward) sang Three.js (+Y up, -Z forward)
 * @param {{ x: number, y: number, z: number }} b Tọa độ Blender
 * @returns {{ x: number, y: number, z: number }} Tọa độ Three.js
 */
export function blenderToThree(b) {
  return {
    x: Number(b.x || 0),
    y: Number(b.z || 0),
    z: -Number(b.y || 0),
  };
}

/**
 * Chuyển đổi tọa độ Three.js sang Blender
 * @param {{ x: number, y: number, z: number }} t Tọa độ Three.js
 * @returns {{ x: number, y: number, z: number }} Tọa độ Blender
 */
export function threeToBlender(t) {
  return {
    x: Number(t.x || 0),
    y: -Number(t.z || 0),
    z: Number(t.y || 0),
  };
}
