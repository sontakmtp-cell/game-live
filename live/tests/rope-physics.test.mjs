// Tests for RopePhysics — TikTok LIVE Arcade
// Covers: PHYS-01, PHYS-02, PHYS-03, PHYS-06

import test from 'node:test';
import assert from 'node:assert/strict';
import { RopePhysics } from '../src/core/rope-physics.mjs';
import { PHYSICS_CONFIG, blenderToThree, threeToBlender } from '../src/shared/config.mjs';

test('PHYS-01: Idle 120s — angle & velocity are continuous, anchor does not drift', () => {
  const sim = new RopePhysics({
    ropeLengthMeters: 0.65,
    anchor: { x: 0, y: 1.25, z: 0 },
  });

  const totalSteps = 120 * 120; // 120s * 120 steps/s = 14400 steps
  const dt = 1 / 120;
  let maxAngle = 0;

  for (let i = 0; i < totalSteps; i++) {
    sim.fixedStep(dt);

    const transform = sim.getPhoneTransform();
    assert.strictEqual(transform.z, 0, 'Z coordinate must strictly remain 0 in Three.js plane');

    // Anchor check
    assert.strictEqual(sim.anchor.x, 0);
    assert.strictEqual(sim.anchor.y, 1.25);
    assert.strictEqual(sim.anchor.z, 0);

    const angle = sim.totalAngle;
    assert.ok(!Number.isNaN(angle), 'Angle must not be NaN');
    assert.ok(Number.isFinite(angle), 'Angle must be finite');

    if (Math.abs(angle) > maxAngle) {
      maxAngle = Math.abs(angle);
    }
  }

  // Idle amplitude is 1.5 deg = ~0.02618 rad
  assert.ok(
    maxAngle <= PHYSICS_CONFIG.idleAmplitudeRad + 0.001,
    `Max idle angle (${maxAngle}) should not exceed idle amplitude (${PHYSICS_CONFIG.idleAmplitudeRad})`
  );
  assert.ok(maxAngle > 0.02, 'Pendulum should be oscillating during idle');
});

test('PHYS-02: Double touch — second impulse during recovery adds without teleport', () => {
  const sim = new RopePhysics({
    ropeLengthMeters: 0.65,
    dampingRatio: 0.18,
  });

  const dt = 1 / 120;

  // Run idle for 1.0s
  for (let i = 0; i < 120; i++) sim.fixedStep(dt);

  // Ghi nhận góc trước khi hit 1
  const angleBeforeHit1 = sim.totalAngle;
  const velBeforeHit1 = sim.deltaAngularVelocity;

  // Hit 1: Touch left (+0.65 rad/s)
  sim.applyImpulse(0.65, 2);

  // Vị trí KHÔNG được nhảy (no teleport)
  assert.strictEqual(
    sim.totalAngle,
    angleBeforeHit1,
    'Angle must not jump immediately after impulse'
  );
  assert.strictEqual(
    sim.deltaAngularVelocity,
    velBeforeHit1 + 0.65,
    'Angular velocity must increase exactly by impulse'
  );
  assert.strictEqual(sim.wear, 2, 'Rope wear should increase by 2');

  // Chạy tiếp 2.0s (240 steps) trong trạng thái hồi phục (recovering)
  for (let i = 0; i < 240; i++) sim.fixedStep(dt);

  // Khi đang hồi phục, phần dư δθ và δθ' vẫn chưa về hẳn 0
  const angleBeforeHit2 = sim.totalAngle;
  const velBeforeHit2 = sim.deltaAngularVelocity;
  assert.notStrictEqual(
    velBeforeHit2,
    0,
    'Pendulum should still be swinging/recovering before hit 2'
  );

  // Hit 2: Touch right (-0.65 rad/s) khi đang hồi phục
  sim.applyImpulse(-0.65, 3);

  // Tiếp tục kiểm tra: vị trí không nhảy vọt
  assert.strictEqual(
    sim.totalAngle,
    angleBeforeHit2,
    'Angle must not jump when receiving second hit during recovery'
  );
  assert.strictEqual(
    sim.deltaAngularVelocity,
    velBeforeHit2 - 0.65,
    'Angular velocity must cleanly combine with second impulse'
  );
  assert.strictEqual(sim.wear, 5, 'Rope wear total should be 2 + 3 = 5');

  // Chạy thêm 5.0s: dao động tắt dần về idle
  for (let i = 0; i < 600; i++) sim.fixedStep(dt);
  assert.ok(
    Math.abs(sim.deltaAngle) < 0.005,
    `Residual disturbance deltaAngle (${sim.deltaAngle}) should damp out near 0`
  );
});

test('PHYS-03: Miss event — does not add impulse, does not increase wear', () => {
  const sim = new RopePhysics({ ropeLengthMeters: 0.65 });
  const dt = 1 / 120;

  for (let i = 0; i < 60; i++) sim.fixedStep(dt);

  const initialWear = sim.wear;
  const initialVel = sim.deltaAngularVelocity;

  // Khi miss: wearDelta = 0, impulse = 0
  sim.applyImpulse(0, 0);

  assert.strictEqual(sim.wear, initialWear, 'Miss must not increase rope wear');
  assert.strictEqual(
    sim.deltaAngularVelocity,
    initialVel,
    'Miss must not add angular impulse'
  );
});

test('PHYS-06: Coordinate conversion Blender +Z to Three.js +Y, X–Y oscillation', () => {
  // 1. Kiểm thử chuyển đổi hệ trục
  const blenderCoord = { x: 1.5, y: -2.0, z: 3.5 };
  const threeCoord = blenderToThree(blenderCoord);

  // Blender: (x, y, z) -> Three.js: (x, z, -y)
  assert.strictEqual(threeCoord.x, 1.5);
  assert.strictEqual(threeCoord.y, 3.5, 'Blender +Z must become Three.js +Y');
  assert.strictEqual(threeCoord.z, 2.0, 'Blender +Y must map to Three.js -Z');

  // Chuyển ngược lại
  const restoredBlender = threeToBlender(threeCoord);
  assert.deepStrictEqual(restoredBlender, blenderCoord);

  // 2. Kiểm thử mặt phẳng dao động Three.js: strictly X–Y
  const sim = new RopePhysics({
    ropeLengthMeters: 0.65,
    anchor: { x: 0, y: 1.25, z: 0 },
  });

  sim.applyImpulse(1.0); // Tạo dao động mạnh

  for (let i = 0; i < 240; i++) {
    sim.fixedStep(1 / 120);
    const pos = sim.getPhoneTransform();

    // Điểm treo và điện thoại phải có Z không đổi
    assert.strictEqual(pos.z, 0, 'Z must not deviate from anchor Z');

    // Tọa độ X và Y phải tuân theo công thức:
    // xPhone = xAnchor + L * sin(theta)
    // yPhone = yAnchor - L * cos(theta)
    const expectedX = 0 + 0.65 * Math.sin(pos.theta);
    const expectedY = 1.25 - 0.65 * Math.cos(pos.theta);

    assert.ok(Math.abs(pos.x - expectedX) < 1e-6, `X mismatch: ${pos.x} vs ${expectedX}`);
    assert.ok(Math.abs(pos.y - expectedY) < 1e-6, `Y mismatch: ${pos.y} vs ${expectedY}`);
    assert.strictEqual(pos.rotationZ, pos.theta, 'Phone rotation around Z must match rope angle theta');
  }

  // 3. Kiểm thử rope points
  const points = sim.getRopePoints(10);
  assert.strictEqual(points.length, 11);
  assert.strictEqual(points[0].x, 0);
  assert.strictEqual(points[0].y, 1.25);
  assert.strictEqual(points[0].z, 0);
});
