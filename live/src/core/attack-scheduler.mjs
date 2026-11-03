// Attack Scheduler & Two-Phase Handshake Orchestrator — TikTok LIVE Arcade (v1.1)
// Spec: TECHNICAL_SPEC.md v1.1, Section 6.1, 7.2, 8 & QA EVT-02, EVT-05, EVT-06, EVT-07
// Enforces: Bounded queue, precontact ACK deadline, single-commit rule, late-ACK rejection.

import { Protocol, MESSAGE_TYPES } from './protocol.mjs';

export const HANDSHAKE_STATE = {
  IDLE: 'IDLE',
  PREPARING: 'PREPARING',
  ARMED: 'ARMED',
  PLAYING: 'PLAYING',
  COMMITTED: 'COMMITTED',
  ABORTED: 'ABORTED',
};

export class AttackScheduler {
  /**
   * @param {Object} options
   * @param {GameState} options.gameState Instance quản lý trạng thái trò chơi
   * @param {number} [options.maxQueue=30] Kích thước hàng đợi tối đa
   * @param {number} [options.prepareTimeoutMs=1200] Timeout chờ overlay:prepared
   * @param {number} [options.ackDeadlineBeforeContactMs=150] Deadline nhận ACK trước contact
   * @param {Function} [options.broadcast] Hàm broadcast thông điệp tới client
   */
  constructor(options = {}) {
    this.gameState = options.gameState;
    this.maxQueue = options.maxQueue || 30;
    this.prepareTimeoutMs = options.prepareTimeoutMs || 1200;
    this.ackDeadlineBeforeContactMs = options.ackDeadlineBeforeContactMs || 150;
    this.broadcast = options.broadcast || (() => {});

    // Hàng đợi yêu cầu
    this.queue = [];
    this.isPaused = false;

    // Renderer chính (Primary Renderer)
    this.primaryRendererId = null;

    // Trạng thái hành động hiện tại
    this.activeTask = null; // { request, state, contactTimer, deadlineTimer, armTimer, hasAcked, committed }
    this.handshakeState = HANDSHAKE_STATE.IDLE;

    // Lịch sử requestId đã commit để chặn duplicate/late commit
    this.committedRequests = new Set();
  }

  /**
   * Gán Primary Renderer ID
   * @param {string} rendererId
   */
  setPrimaryRenderer(rendererId) {
    this.primaryRendererId = rendererId;
  }

  /**
   * Xử lý khi Primary Renderer mất kết nối (EVT-07)
   */
  handleRendererDisconnect(rendererId) {
    if (this.primaryRendererId === rendererId) {
      this.primaryRendererId = null;

      // Nếu đang có hành động dở dang và CHƯA COMMIT -> ABORT ngay lập tức!
      if (this.activeTask && !this.activeTask.committed) {
        this._abortCurrentTask('renderer_disconnected');
      }
    }
  }

  /**
   * Thêm yêu cầu quà vào hàng đợi
   * @param {Object} normalizedAction
   * @returns {boolean} Thành công hay không
   */
  enqueue(normalizedAction) {
    if (!normalizedAction) return false;

    // Nếu hàng đợi đầy, gộp vào combo cuối thay vì âm thầm vứt bỏ (no silent drop)
    if (this.queue.length >= this.maxQueue) {
      const last = this.queue[this.queue.length - 1];
      if (last) {
        last.count += normalizedAction.count || 1;
        last.diamonds += normalizedAction.diamonds || 1;
        return true;
      }
    }

    this.queue.push({
      ...normalizedAction,
      queuedAt: Date.now(),
    });

    this.pump();
    return true;
  }

  /**
   * Bộ điều phối vòng lặp hàng đợi
   */
  pump() {
    if (this.isPaused) return;
    if (this.activeTask || this.handshakeState !== HANDSHAKE_STATE.IDLE) return;
    if (this.queue.length === 0) return;

    // Bắt đầu xử lý yêu cầu tiếp theo
    const request = this.queue.shift();
    this._startTask(request);
  }

  /**
   * Bắt đầu lượt xử lý 2 pha (Pha 1: PREPARE)
   */
  _startTask(request) {
    const roundId = this.gameState.roundId;
    const requestId = request.requestId;
    const action = request.action;

    this.handshakeState = HANDSHAKE_STATE.PREPARING;
    this.activeTask = {
      request,
      roundId,
      requestId,
      action,
      hasAcked: false,
      committed: false,
      timers: [],
    };

    // 1. Gửi thông điệp attack:scheduled
    const scheduledMsg = Protocol.createScheduled({
      requestId,
      roundId,
      toolId: action.toolId,
      side: action.side,
      contactMs: action.contactMs,
      durationMs: action.durationMs,
      rendererId: this.primaryRendererId || 'default-renderer',
      viewer: request.user,
    });

    this.broadcast(scheduledMsg);

    // 2. Đặt timeout PREPARE (EVT-05 / EVT-07)
    const prepareTimer = setTimeout(() => {
      if (this.handshakeState === HANDSHAKE_STATE.PREPARING && this.activeTask?.requestId === requestId) {
        // Hết hạn prepare mà renderer không trả lời -> Abort!
        this._abortCurrentTask('media_not_ready');
      }
    }, this.prepareTimeoutMs);

    this.activeTask.timers.push(prepareTimer);
  }

  /**
   * Tiếp nhận phản hồi overlay:prepared từ Overlay
   */
  handleOverlayPrepared(msg) {
    if (!this.activeTask || this.handshakeState !== HANDSHAKE_STATE.PREPARING) return;
    if (this.activeTask.requestId !== msg.requestId || this.activeTask.roundId !== msg.roundId) return;

    // Kiểm tra rendererId
    if (this.primaryRendererId && msg.rendererId !== this.primaryRendererId) return;

    if (msg.status !== 'ready') {
      this._abortCurrentTask('media_error');
      return;
    }

    // Xóa timer prepare
    this._clearTaskTimers();

    // Pha 2: Chuyển sang ARMED & Lên lịch bắt đầu
    this.handshakeState = HANDSHAKE_STATE.ARMED;
    const leadTimeMs = 300; // Thời gian đệm khởi động
    const now = Date.now();
    const serverStartAtMs = now + leadTimeMs;
    const contactMs = this.activeTask.action.contactMs || 800;
    const expectedContactAtMs = serverStartAtMs + contactMs;

    // Gửi thông điệp attack:armed
    const armedMsg = Protocol.createArmed({
      requestId: this.activeTask.requestId,
      roundId: this.activeTask.roundId,
      rendererId: this.primaryRendererId,
      serverStartAtMs,
      contactMs,
    });
    this.broadcast(armedMsg);

    this.gameState.startAttack(this.activeTask.request);

    // Hẹn giờ kích hoạt trạng thái PLAYING
    const playTimer = setTimeout(() => {
      if (this.activeTask && this.handshakeState === HANDSHAKE_STATE.ARMED) {
        this.handshakeState = HANDSHAKE_STATE.PLAYING;
      }
    }, leadTimeMs);
    this.activeTask.timers.push(playTimer);

    // Hẹn giờ deadline kiểm tra ACK (contact - 150ms) (EVT-05)
    const ackDeadlineMs = Math.max(50, leadTimeMs + contactMs - this.ackDeadlineBeforeContactMs);
    const deadlineTimer = setTimeout(() => {
      if (this.activeTask && !this.activeTask.hasAcked && !this.activeTask.committed) {
        // Chưa nhận được ACK trước deadline -> Huỷ bỏ trước va chạm!
        this._abortCurrentTask('ack_timeout_before_contact');
      }
    }, ackDeadlineMs);
    this.activeTask.timers.push(deadlineTimer);

    // Hẹn giờ thời điểm va chạm (Contact Tick)
    const contactDelayMs = leadTimeMs + contactMs;
    const contactTimer = setTimeout(() => {
      this._commitContactAtTick();
    }, contactDelayMs);
    this.activeTask.timers.push(contactTimer);
  }

  /**
   * Tiếp nhận phản hồi overlay:attack_ack (Precontact ACK)
   */
  handleAttackAck(msg) {
    if (!this.activeTask) return;
    if (this.activeTask.requestId !== msg.requestId || this.activeTask.roundId !== msg.roundId) return;

    // EVT-06: Nếu đã commit rồi thì bỏ qua late ACK và log (Commit-once rule)
    if (this.activeTask.committed || this.committedRequests.has(msg.requestId)) {
      console.log(`[Scheduler] Bỏ qua late/duplicate ACK cho requestId: ${msg.requestId}`);
      return;
    }

    // Kiểm tra độ trôi mediaDriftMs
    if (Math.abs(msg.mediaDriftMs || 0) > 250) {
      this._abortCurrentTask('excessive_media_drift');
      return;
    }

    // Đã nhận ACK hợp lệ và đúng hạn!
    this.activeTask.hasAcked = true;
  }

  /**
   * Tiếp nhận overlay:drift_abort từ Overlay
   */
  handleDriftAbort(msg) {
    if (!this.activeTask || this.activeTask.requestId !== msg.requestId) return;

    // EVT-06: Chỉ được phép abort khi CHƯA commit!
    if (!this.activeTask.committed) {
      this._abortCurrentTask(msg.reason || 'client_drift_abort');
    } else {
      // Nếu đã commit rồi, ghi nhận visual_fault, tuyệt đối không rollback wear
      this.broadcast(Protocol.createVisualFault({
        requestId: this.activeTask.requestId,
        roundId: this.activeTask.roundId,
        reason: msg.reason || 'drift_after_commit',
      }));
    }
  }

  /**
   * Thời điểm Server phán quyết va chạm (Single Commit)
   */
  _commitContactAtTick() {
    if (!this.activeTask || this.activeTask.committed) return;

    const task = this.activeTask;

    // EVT-05: Bắt buộc phải có ACK trước contact deadline
    if (!task.hasAcked) {
      this._abortCurrentTask('missing_ack_at_contact_tick');
      return;
    }

    // Khóa commit (Commit Once)
    task.committed = true;
    this.committedRequests.add(task.requestId);
    this.handshakeState = HANDSHAKE_STATE.COMMITTED;

    const action = task.action;
    const side = action.side || 'left';
    const impulse = action.impulseRadPerSec || 0.65;
    const wearDelta = action.wearDelta || 2;
    const simTick = this.gameState.physics.simTick;

    if (action.variant === 'miss') {
      this.gameState.commitMiss();
      this.broadcast(Protocol.createMiss({
        requestId: task.requestId,
        roundId: task.roundId,
        simTick,
        impactSide: side,
      }));
    } else {
      const { newWear } = this.gameState.commitContact(wearDelta, impulse, side);
      this.broadcast(Protocol.createContact({
        requestId: task.requestId,
        roundId: task.roundId,
        simTick,
        result: 'touch',
        impactSide: side,
        angularImpulseRadPerSec: impulse,
        ropeWearDelta: wearDelta,
        ropeWearTotal: newWear,
      }));
    }

    // Chờ hết thời lượng action rồi chuyển sang yêu cầu tiếp theo
    const remainingDuration = Math.max(300, (action.durationMs || 2400) - (action.contactMs || 800));
    setTimeout(() => {
      this._finishCurrentTask();
    }, remainingDuration);
  }

  /**
   * Hủy bỏ lượt hiện tại (Abort)
   */
  _abortCurrentTask(reason) {
    if (!this.activeTask || this.activeTask.committed) return;

    const task = this.activeTask;
    this._clearTaskTimers();

    this.handshakeState = HANDSHAKE_STATE.ABORTED;
    this.broadcast(Protocol.createAborted({
      requestId: task.requestId,
      roundId: task.roundId,
      reason,
    }));

    this.gameState.finishAttack();
    this.activeTask = null;
    this.handshakeState = HANDSHAKE_STATE.IDLE;

    // Đẩy tiếp hàng đợi sau 300ms
    setTimeout(() => this.pump(), 300);
  }

  _finishCurrentTask() {
    this._clearTaskTimers();
    this.gameState.finishAttack();
    this.activeTask = null;
    this.handshakeState = HANDSHAKE_STATE.IDLE;

    // Tiếp tục hàng đợi
    this.pump();
  }

  _clearTaskTimers() {
    if (this.activeTask?.timers) {
      for (const t of this.activeTask.timers) clearTimeout(t);
      this.activeTask.timers = [];
    }
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
    this.pump();
  }

  clearQueue() {
    this.queue = [];
  }
}
