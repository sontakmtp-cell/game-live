// Client bundle of RopePhysics for TikTok LIVE Arcade
// Coordinates: Three.js world +Y-up, oscillation strictly in X–Y plane.

export const PHYSICS_CONFIG = {
  ropeLengthMeters: 0.65,
  gravity: 9.81,
  idleAmplitudeRad: (1.5 * Math.PI) / 180,
  idlePeriodSec: 2.0,
  get idleOmega() {
    return (2 * Math.PI) / this.idlePeriodSec;
  },
  get naturalOmega() {
    return Math.sqrt(this.gravity / this.ropeLengthMeters);
  },
  dampingRatio: 0.18,
  fixedTimestep: 1 / 120,
  defaultImpulseRadPerSec: 0.65,
  defaultAnchor: { x: 0.0, y: 1.25, z: 0.0 },
  maxAngleRad: (65 * Math.PI) / 180,
};

export class RopePhysics {
  constructor(options = {}) {
    this.length = options.ropeLengthMeters ?? PHYSICS_CONFIG.ropeLengthMeters;
    this.gravity = options.gravity ?? PHYSICS_CONFIG.gravity;
    this.idleAmplitude = options.idleAmplitudeRad ?? PHYSICS_CONFIG.idleAmplitudeRad;
    this.idlePeriod = options.idlePeriodSec ?? PHYSICS_CONFIG.idlePeriodSec;
    this.idleOmega = (2 * Math.PI) / this.idlePeriod;

    this.naturalOmega = Math.sqrt(this.gravity / this.length);
    this.dampingRatio = options.dampingRatio ?? PHYSICS_CONFIG.dampingRatio;

    this.anchor = options.anchor
      ? { ...options.anchor }
      : { ...PHYSICS_CONFIG.defaultAnchor };

    this.initialPhase = options.seed ? (options.seed % 1000) * 0.00628 : 0.0;
    this.simTime = 0.0;
    this.simTick = 0;

    this.deltaAngle = 0.0;
    this.deltaAngularVelocity = 0.0;
    this.prevDeltaAngle = 0.0;
    this.prevDeltaAngularVelocity = 0.0;

    this.waveAmplitude = 0.0;
    this.wavePhase = 0.0;
    this.wear = 0;
  }

  getIdleAngle(t = this.simTime) {
    return this.idleAmplitude * Math.sin(this.idleOmega * t + this.initialPhase);
  }

  getIdleAngularVelocity(t = this.simTime) {
    return this.idleAmplitude * this.idleOmega * Math.cos(this.idleOmega * t + this.initialPhase);
  }

  get totalAngle() {
    return this.getIdleAngle() + this.deltaAngle;
  }

  get totalAngularVelocity() {
    return this.getIdleAngularVelocity() + this.deltaAngularVelocity;
  }

  fixedStep(dt = PHYSICS_CONFIG.fixedTimestep) {
    this.prevDeltaAngle = this.deltaAngle;
    this.prevDeltaAngularVelocity = this.deltaAngularVelocity;

    const acceleration =
      -2.0 * this.dampingRatio * this.naturalOmega * this.deltaAngularVelocity -
      this.naturalOmega * this.naturalOmega * this.deltaAngle;

    this.deltaAngularVelocity += acceleration * dt;
    this.deltaAngle += this.deltaAngularVelocity * dt;

    const maxA = PHYSICS_CONFIG.maxAngleRad;
    if (this.deltaAngle > maxA) {
      this.deltaAngle = maxA;
      if (this.deltaAngularVelocity > 0) this.deltaAngularVelocity = 0;
    } else if (this.deltaAngle < -maxA) {
      this.deltaAngle = -maxA;
      if (this.deltaAngularVelocity < 0) this.deltaAngularVelocity = 0;
    }

    this.waveAmplitude *= Math.exp(-8.0 * dt);
    this.wavePhase += 24.0 * dt;
    if (Math.abs(this.waveAmplitude) < 0.0001) {
      this.waveAmplitude = 0;
    }

    this.simTime += dt;
    this.simTick += 1;
  }

  update(elapsedSec, fixedDt = PHYSICS_CONFIG.fixedTimestep) {
    const clampedElapsed = Math.min(elapsedSec, 0.1);
    let remaining = clampedElapsed;
    while (remaining >= fixedDt) {
      this.fixedStep(fixedDt);
      remaining -= fixedDt;
    }
  }

  applyImpulse(signedImpulseRadPerSec, wearDelta = 0, contactFraction = 0.5) {
    this.deltaAngularVelocity += signedImpulseRadPerSec;
    this.wear = Math.min(100, Math.max(0, this.wear + (wearDelta || 0)));
    this.waveAmplitude += signedImpulseRadPerSec * 0.025;
    this.contactFraction = contactFraction;
  }

  getPhoneTransform(alpha = 1.0) {
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
      rotationZ: theta,
    };
  }

  getRopePoints(segments = 16, alpha = 1.0) {
    const phone = this.getPhoneTransform(alpha);
    const points = [];
    const theta = phone.theta;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    const normX = cosT;
    const normY = sinT;

    for (let i = 0; i <= segments; i++) {
      const s = i / segments;
      let px = this.anchor.x + s * this.length * sinT;
      let py = this.anchor.y - s * this.length * cosT;
      const pz = this.anchor.z;

      if (this.waveAmplitude !== 0) {
        const shape = Math.sin(Math.PI * s);
        const wave = this.waveAmplitude * shape * Math.cos(this.wavePhase);
        px += wave * normX;
        py += wave * normY;
      }

      points.push({ x: px, y: py, z: pz });
    }

    return points;
  }

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
