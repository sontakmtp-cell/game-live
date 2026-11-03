// WebSocket Protocol v1.1 — TikTok LIVE Arcade
// Spec: TECHNICAL_SPEC.md v1.1, Section 8

export const PROTOCOL_VERSION = 1;

export const MESSAGE_TYPES = {
  // Server -> Overlay (Two-phase handshake)
  ATTACK_SCHEDULED: 'attack:scheduled',
  ATTACK_ARMED: 'attack:armed',
  ATTACK_CONTACT: 'attack:contact',
  ATTACK_MISS: 'attack:miss',
  ATTACK_ABORTED: 'attack:aborted',
  ATTACK_VISUAL_FAULT: 'attack:visual_fault',

  // Overlay -> Server (Telemetry)
  OVERLAY_PREPARED: 'overlay:prepared',
  OVERLAY_ATTACK_ACK: 'overlay:attack_ack',
  OVERLAY_DRIFT_ABORT: 'overlay:drift_abort',

  // State Sync
  GAME_SNAPSHOT: 'game:snapshot',

  // Control commands
  CONTROL_ACTION: 'ctl:action',
  CONTROL_QUEUE: 'ctl:queue',
};

/**
 * Kiểm tra tính hợp lệ của thông điệp từ Client gửi lên Server
 * @param {Object} msg
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateClientMessage(msg) {
  if (!msg || typeof msg !== 'object') {
    return { valid: false, error: 'Thông điệp phải là object' };
  }

  // Lệnh điều khiển legacy hoặc admin
  if (msg.t === 'ctl') {
    if (!msg.cmd || typeof msg.cmd !== 'string') {
      return { valid: false, error: 'Thiếu cmd trong ctl' };
    }
    return { valid: true };
  }

  const { type, rendererId, requestId, roundId } = msg;

  if (!type || typeof type !== 'string') {
    return { valid: false, error: 'Thiếu trường type' };
  }

  // Overlay Telemetry Messages
  switch (type) {
    case MESSAGE_TYPES.OVERLAY_PREPARED: {
      if (!rendererId || typeof rendererId !== 'string') return { valid: false, error: 'Thiếu rendererId' };
      if (!requestId || typeof requestId !== 'string') return { valid: false, error: 'Thiếu requestId' };
      if (typeof roundId !== 'number') return { valid: false, error: 'Thiếu roundId hợp lệ' };
      if (!['ready', 'error'].includes(msg.status)) return { valid: false, error: 'status phải là ready hoặc error' };
      return { valid: true };
    }

    case MESSAGE_TYPES.OVERLAY_ATTACK_ACK: {
      if (!rendererId || typeof rendererId !== 'string') return { valid: false, error: 'Thiếu rendererId' };
      if (!requestId || typeof requestId !== 'string') return { valid: false, error: 'Thiếu requestId' };
      if (typeof roundId !== 'number') return { valid: false, error: 'Thiếu roundId' };
      if (typeof msg.mediaTimeMs !== 'number') return { valid: false, error: 'mediaTimeMs phải là number' };
      if (typeof msg.mediaDriftMs !== 'number') return { valid: false, error: 'mediaDriftMs phải là number' };
      return { valid: true };
    }

    case MESSAGE_TYPES.OVERLAY_DRIFT_ABORT: {
      if (!rendererId || typeof rendererId !== 'string') return { valid: false, error: 'Thiếu rendererId' };
      if (!requestId || typeof requestId !== 'string') return { valid: false, error: 'Thiếu requestId' };
      if (!msg.reason || typeof msg.reason !== 'string') return { valid: false, error: 'Thiếu lý do abort' };
      return { valid: true };
    }

    default:
      return { valid: false, error: `Loại thông điệp client không hỗ trợ: ${type}` };
  }
}

/**
 * Helper tạo thông điệp chuẩn Server -> Overlay
 */
export const Protocol = {
  createScheduled({ requestId, roundId, clipId, toolId, contactMs, durationMs, rendererId, viewer, side = 'left' }) {
    return {
      type: MESSAGE_TYPES.ATTACK_SCHEDULED,
      v: PROTOCOL_VERSION,
      requestId,
      roundId,
      clipId: clipId || `${toolId}-touch`,
      toolId: toolId || 'knife_left',
      side,
      activeStartMs: 0,
      contactMs: contactMs || 800,
      durationMs: durationMs || 2400,
      rendererId,
      viewer: viewer || { id: 'sim-user', displayName: 'Người chơi' },
    };
  },

  createArmed({ requestId, roundId, rendererId, serverStartAtMs, contactMs = 800 }) {
    return {
      type: MESSAGE_TYPES.ATTACK_ARMED,
      v: PROTOCOL_VERSION,
      rendererId,
      requestId,
      roundId,
      serverStartAtMs,
      expectedContactAtMs: serverStartAtMs + contactMs,
      timebase: 'server_wall_millis',
    };
  },

  createContact({ requestId, roundId, simTick, result = 'touch', impactSide = 'left', angularImpulseRadPerSec = 0.65, ropeWearDelta = 2, ropeWearTotal = 0 }) {
    return {
      type: MESSAGE_TYPES.ATTACK_CONTACT,
      v: PROTOCOL_VERSION,
      requestId,
      roundId,
      simTick,
      result,
      impactSide,
      angularImpulseRadPerSec,
      ropeWearDelta,
      ropeWearTotal,
    };
  },

  createMiss({ requestId, roundId, simTick, impactSide = 'left' }) {
    return {
      type: MESSAGE_TYPES.ATTACK_MISS,
      v: PROTOCOL_VERSION,
      requestId,
      roundId,
      simTick,
      result: 'miss',
      impactSide,
      angularImpulseRadPerSec: 0.0,
      ropeWearDelta: 0,
    };
  },

  createAborted({ requestId, roundId, reason = 'media_not_ready' }) {
    return {
      type: MESSAGE_TYPES.ATTACK_ABORTED,
      v: PROTOCOL_VERSION,
      requestId,
      roundId,
      reason,
      angularImpulseRadPerSec: 0.0,
      ropeWearDelta: 0,
    };
  },

  createVisualFault({ requestId, roundId, reason = 'late_stall' }) {
    return {
      type: MESSAGE_TYPES.ATTACK_VISUAL_FAULT,
      v: PROTOCOL_VERSION,
      requestId,
      roundId,
      reason,
    };
  },

  createSnapshot({ roundId, phase, simTick, seed, physics, ropeWear, queueLength, activeAttack = null }) {
    return {
      type: MESSAGE_TYPES.GAME_SNAPSHOT,
      v: PROTOCOL_VERSION,
      roundId,
      phase,
      simTick,
      seed,
      physics: physics || { deltaAngleRad: 0, deltaAngularVelocityRadPerSec: 0 },
      ropeWear,
      queueLength,
      activeAttack,
      clipManifestVersion: 'v1.1',
    };
  },
};
