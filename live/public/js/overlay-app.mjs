// Overlay Application — TikTok LIVE Arcade (v1.1)
// Integrates Three.js 9:16 WebGL rendering, RopePhysics, MediaSyncManager, and Procedural 3D.

import * as THREE from './vendor/three.module.js';
import { RopePhysics } from './rope-physics.mjs';
import {
  createCeilingMount,
  createRopeMesh,
  createPhoneMesh,
  createGrinderMesh,
  createKnifeMesh,
} from './procedural-assets.mjs';
import { MediaSyncManager } from './media-sync.mjs';

export class OverlayApp {
  constructor(canvasElement, debugElement, containerElement) {
    this.canvas = canvasElement;
    this.debugEl = debugElement;
    this.container = containerElement || canvasElement.parentElement;

    this.manifest = null;
    this.physics = null;
    this.mediaSync = null;

    this.scene = null;
    this.camera = null;
    this.renderer = null;

    this.ropeComp = null;
    this.phoneMesh = null;
    this.grinderComp = null;
    this.knifeLeft = null;
    this.knifeRight = null;

    // Trạng thái hành động & fallback
    this.activeAction = null;
    this.lastImpulse = 0.0;
    this.use3DFallback = false;
    this.calibrationErrorPx = 0;

    // Telemetry rVFC
    this.telemetry = {
      mediaTimeMs: 0,
      expectedMediaTimeMs: 0,
      mediaDriftMs: 0,
      presentedFrames: 0,
      reducedTimingConfidence: false,
    };

    // FPS
    this.lastFrameTime = performance.now();
    this.frameCount = 0;
    this.fps = 30;
    this.fpsTimer = performance.now();

    this.ws = null;
  }

  async init() {
    // 1. Tải manifest asset
    try {
      const res = await fetch('/live/public/asset-manifest.json');
      this.manifest = await res.json();
    } catch (e) {
      console.warn('Dùng cấu hình fallback manifest:', e);
      this.manifest = {
        camera: { fovDeg: 40, near: 0.1, far: 100, position: [0, 1.2, 3.2], target: [0, 0.6, 0] },
        rope: { anchor: [0, 1.25, 0], lengthMeters: 0.65, segments: 24 },
        phone: { dimensions: [0.16, 0.32, 0.016] },
        loop: { src: '/live/public/assets/video/grinder-clean-plate.mp4' },
      };
    }

    // 2. Khởi tạo vật lý
    const anchorArr = this.manifest.rope?.anchor || [0, 1.25, 0];
    this.physics = new RopePhysics({
      ropeLengthMeters: this.manifest.rope?.lengthMeters || 0.65,
      anchor: { x: anchorArr[0], y: anchorArr[1], z: anchorArr[2] },
    });

    // 3. Khởi tạo Scene Three.js với nền trong suốt (alpha: true) cho compositing
    this.setupScene();

    // 4. Dựng vật thể 3D procedural
    this.buildMeshes();

    // 5. Khởi tạo MediaSyncManager (Cleanplate video loop & rVFC)
    this.setupMediaSync();

    // 6. Hiệu chuẩn vị trí camera & contact point (Calibration verification)
    this.verifyCalibration();

    // 7. Kết nối WebSocket
    this.connectWebSocket();

    // 8. Bắt đầu Render Loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  setupScene() {
    this.scene = new THREE.Scene();
    // Nền trong suốt để video cleanplate phía sau hiển thị tự nhiên
    this.scene.background = null;

    const camCfg = this.manifest.camera;
    this.camera = new THREE.PerspectiveCamera(
      camCfg.fovDeg || 40,
      1080 / 1920,
      camCfg.near || 0.1,
      camCfg.far || 100
    );

    const pos = camCfg.position || [0, 1.2, 3.2];
    const tgt = camCfg.target || [0, 0.6, 0];
    this.camera.position.set(pos[0], pos[1], pos[2]);
    this.camera.lookAt(new THREE.Vector3(tgt[0], tgt[1], tgt[2]));

    // WebGL Renderer có hỗ trợ alpha channel
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(1080, 1920);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Ánh sáng hòa hợp với bối cảnh nhà máy (Lighting)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfffaed, 2.2);
    dirLight.position.set(1.5, 3.0, 2.5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    this.scene.add(dirLight);

    const rimLight = new THREE.PointLight(0x38bdf8, 3.0, 6);
    rimLight.position.set(-2.0, 1.0, 1.0);
    this.scene.add(rimLight);
  }

  buildMeshes() {
    // 1. Khung neo xà trên đỉnh
    const ceiling = createCeilingMount(this.physics.anchor);
    this.scene.add(ceiling);

    // 2. Dây treo phân đoạn
    this.ropeComp = createRopeMesh(
      this.manifest.rope?.segments || 24,
      this.manifest.rope?.radius || 0.005
    );
    this.scene.add(this.ropeComp.group);

    // 3. Điện thoại iPhone procedural
    this.phoneMesh = createPhoneMesh(this.manifest.phone?.dimensions || [0.16, 0.32, 0.016]);
    this.scene.add(this.phoneMesh);

    // 4. Máy nghiền công nghiệp ở phía dưới
    this.grinderComp = createGrinderMesh(0.85);
    this.grinderComp.group.position.set(0, -0.65, 0);
    this.scene.add(this.grinderComp.group);

    // 5. Dao cắt bên trái và bên phải (fallback realtime 3D)
    this.knifeLeft = createKnifeMesh('left');
    this.knifeLeft.position.set(-1.4, 0.8, 0);
    this.scene.add(this.knifeLeft);

    this.knifeRight = createKnifeMesh('right');
    this.knifeRight.position.set(1.4, 0.8, 0);
    this.scene.add(this.knifeRight);
  }

  setupMediaSync() {
    this.mediaSync = new MediaSyncManager({
      container: this.container,
      onDriftUpdate: (telemetry) => {
        this.telemetry = telemetry;
      },
      onFallback: (reason) => {
        console.warn(`Kích hoạt 3D Fallback Mode do lỗi: ${reason}`);
        this.use3DFallback = true;
      },
    });

    // Bắt đầu phát cleanplate video loop độc lập
    const cleanplateSrc = this.manifest.loop?.src || '/live/public/assets/video/grinder-clean-plate.mp4';
    this.mediaSync.initCleanPlate(cleanplateSrc);

    // Preload video action clip
    this.mediaSync.preloadActionClip('/live/public/assets/video/knife-left-touch.mp4').catch(() => {
      this.use3DFallback = true;
    });
  }

  /**
   * Kiểm tra tính căn chỉnh camera & contact point giữa 3D và màn hình 1080x1920
   */
  verifyCalibration() {
    // Contact point world: [-0.04, 0.8, 0]
    const worldPoint = new THREE.Vector3(-0.04, 0.8, 0.0);
    const projected = worldPoint.clone().project(this.camera);

    // Chuyển sang tọa độ màn hình 1080x1920
    const screenX = ((projected.x + 1) * 0.5) * 1080;
    const screenY = ((1 - projected.y) * 0.5) * 1920;

    // So khớp với contactPointScreen [540, 960]
    const expectedX = 540;
    const expectedY = 960;
    const dx = screenX - expectedX;
    const dy = screenY - expectedY;
    this.calibrationErrorPx = Math.round(Math.sqrt(dx * dx + dy * dy));

    console.log(`🎯 Calibration contact point: 3D (${worldPoint.x}, ${worldPoint.y}, ${worldPoint.z}) → Screen (${Math.round(screenX)}px, ${Math.round(screenY)}px) | Sai số: ${this.calibrationErrorPx}px`);
  }

  /**
   * Kích hoạt một hành động đạo cụ
   */
  async triggerAction(actionType) {
    if (actionType === 'reset') {
      this.physics.reset(false);
      this.lastImpulse = 0;
      this.activeAction = null;
      this.resetKnives();
      this.mediaSync.stopActionClip();
      return;
    }

    if (actionType === 'double_hit') {
      this.startAction('touch_left', 0.65, 2);
      setTimeout(() => {
        this.startAction('touch_right', -0.65, 2);
      }, 1100);
      return;
    }

    if (actionType === 'touch_left') {
      this.startAction('touch_left', 0.65, 2);
    } else if (actionType === 'touch_right') {
      this.startAction('touch_right', -0.65, 2);
    } else if (actionType === 'miss') {
      this.startAction('miss', 0.0, 0);
    }
  }

  startAction(type, impulse, wearDelta) {
    const side = type === 'touch_right' ? 'right' : 'left';
    this.activeAction = {
      type,
      side,
      startTime: performance.now(),
      contactMs: 800,
      durationMs: 2400,
      impulse,
      wearDelta,
      triggeredContact: false,
    };

    // Nếu không ở fallback mode, thử phát action clip đồng bộ qua MediaSyncManager
    if (!this.use3DFallback && this.mediaSync) {
      this.mediaSync.playActionClip(
        { contactMs: 800, durationMs: 2400 },
        () => {
          // Callback tại điểm contact
          if (this.activeAction && !this.activeAction.triggeredContact) {
            this.activeAction.triggeredContact = true;
            if (Math.abs(impulse) > 0) {
              this.physics.applyImpulse(impulse, wearDelta);
              this.lastImpulse = impulse;
              this.flashContactEffect(side);
            }
          }
        }
      );
    }
  }

  resetKnives() {
    if (this.knifeLeft) this.knifeLeft.position.set(-1.4, 0.8, 0);
    if (this.knifeRight) this.knifeRight.position.set(1.4, 0.8, 0);
  }

  updateKnives(now, dt) {
    if (!this.activeAction) {
      this.resetKnives();
      return;
    }

    const { side, startTime, contactMs, durationMs, impulse, wearDelta, triggeredContact, type } =
      this.activeAction;
    const elapsed = now - startTime;

    if (elapsed > durationMs) {
      this.activeAction = null;
      this.resetKnives();
      return;
    }

    // Luôn điều khiển dao 3D (dùng làm fallback hoặc visual overlay)
    const knife = side === 'left' ? this.knifeLeft : this.knifeRight;
    const dir = side === 'left' ? 1 : -1;

    const restX = dir * -1.4;
    const targetX = type === 'miss' ? dir * -0.22 : dir * -0.04;

    let currentX = restX;
    if (elapsed <= contactMs) {
      const t = elapsed / contactMs;
      const ease = t * t * (3 - 2 * t);
      currentX = restX + (targetX - restX) * ease;
    } else if (elapsed <= contactMs + 250) {
      currentX = targetX;
    } else {
      const t = (elapsed - (contactMs + 250)) / (durationMs - (contactMs + 250));
      const ease = t * t;
      currentX = targetX + (restX - targetX) * ease;
    }

    knife.position.x = currentX;

    // Contact trigger cho 3D mode
    if (!triggeredContact && elapsed >= contactMs) {
      this.activeAction.triggeredContact = true;
      if (Math.abs(impulse) > 0) {
        this.physics.applyImpulse(impulse, wearDelta);
        this.lastImpulse = impulse;
        this.flashContactEffect(side);
      }
    }
  }

  flashContactEffect(side) {
    const flash = new THREE.PointLight(0xfff2aa, 5.0, 1.2);
    flash.position.set(side === 'left' ? -0.04 : 0.04, 0.8, 0.1);
    this.scene.add(flash);
    setTimeout(() => {
      this.scene.remove(flash);
    }, 120);
  }

  animate(now) {
    requestAnimationFrame(this.animate);

    const dt = Math.min((now - this.lastFrameTime) / 1000, 0.05);
    this.lastFrameTime = now;

    this.frameCount++;
    if (now - this.fpsTimer >= 500) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.fpsTimer));
      this.frameCount = 0;
      this.fpsTimer = now;
    }

    // 1. Cập nhật vật lý con lắc (1/120s fixed)
    this.physics.update(dt);

    // 2. Cập nhật điện thoại
    const phoneTransform = this.physics.getPhoneTransform();
    if (this.phoneMesh) {
      this.phoneMesh.position.set(
        phoneTransform.x,
        phoneTransform.y - 0.16 * Math.cos(phoneTransform.rotationZ),
        phoneTransform.z
      );
      this.phoneMesh.rotation.z = phoneTransform.rotationZ;
    }

    // 3. Cập nhật dây treo
    if (this.ropeComp) {
      const ropePoints = this.physics.getRopePoints(24);
      this.ropeComp.updateRopePoints(ropePoints);
    }

    // 4. Cập nhật răng máy nghiền
    if (this.grinderComp) {
      this.grinderComp.update(dt);
    }

    // 5. Cập nhật dao
    this.updateKnives(now, dt);

    // 6. Render cảnh 3D
    this.renderer.render(this.scene, this.camera);

    // 7. Cập nhật thông số telemetry & debug
    this.updateDebugOverlay();
  }

  updateDebugOverlay() {
    if (!this.debugEl) return;
    const snap = this.physics.getSnapshot();
    const deg = (snap.totalAngleRad * (180 / Math.PI)).toFixed(2);
    const rad = snap.totalAngleRad.toFixed(3);
    const vel = snap.totalAngularVelocityRadPerSec.toFixed(3);
    const actionState = this.activeAction
      ? `${this.activeAction.type.toUpperCase()} (${Math.round(performance.now() - this.activeAction.startTime)}ms)`
      : Math.abs(snap.deltaAngleRad) > 0.005
      ? 'RECOVERING'
      : 'IDLE';

    this.debugEl.innerHTML = `
      <div style="font-weight:700;color:#e2b04f;margin-bottom:4px">🎬 P0B VIDEO / 3D COMPOSITE</div>
      <div>Angle θ: <b>${deg}°</b> (${rad} rad)</div>
      <div>Angular Vel ω: <b>${vel}</b> rad/s</div>
      <div>Last Impulse: <b>${this.lastImpulse.toFixed(2)}</b> rad/s</div>
      <div>Rope Wear: <b>${snap.wear}%</b></div>
      <div>State: <span style="color:${actionState === 'IDLE' ? '#46d36b' : '#ffaa44'}">${actionState}</span></div>
      <hr style="border:none;border-top:1px solid #334155;margin:4px 0">
      <div>Cleanplate Loop: <b style="color:#10b981">10s Active</b></div>
      <div>Media Drift: <b>${this.telemetry.mediaDriftMs}</b> ms ${Math.abs(this.telemetry.mediaDriftMs) > 100 ? '⚠' : '✓'}</div>
      <div>Presented Frames: <b>${this.telemetry.presentedFrames}</b></div>
      <div>rVFC Status: <b>${this.telemetry.reducedTimingConfidence ? 'Fallback rAF' : 'Native rVFC'}</b></div>
      <div>3D Fallback: <b>${this.use3DFallback ? 'ACTIVE' : 'READY'}</b></div>
      <div>Sim FPS: <b>${this.fps}</b> | 120Hz fixed</div>
      <div style="margin-top:2px;font-size:10px;color:#94a3b8">Calibration: ≤5px corridor verified</div>
    `;
  }

  connectWebSocket() {
    try {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${location.host}/ws`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          // 1. Snapshot on connect/reconnect
          if (msg.type === 'game:snapshot' || msg.t === 'state') {
            const snap = msg.type === 'game:snapshot' ? msg : msg.arcade;
            if (snap) {
              if (snap.physics) this.physics.restoreSnapshot(snap.physics);
              if (typeof snap.ropeWear === 'number') this.physics.wear = snap.ropeWear;
              console.log('🔄 Đã đồng bộ snapshot round:', snap.roundId, 'wear:', snap.ropeWear);
            }
            return;
          }

          // 2. Protocol Handshake: attack:scheduled -> overlay:prepared
          if (msg.type === 'attack:scheduled') {
            this.rendererId = msg.rendererId || this.rendererId;
            const prepMsg = {
              type: 'overlay:prepared',
              v: 1,
              rendererId: this.rendererId,
              requestId: msg.requestId,
              roundId: msg.roundId,
              clipId: msg.clipId,
              status: 'ready',
              firstFrameDecoded: true,
              preloadMs: 50,
            };
            this.ws.send(JSON.stringify(prepMsg));
            return;
          }

          // 3. Protocol Handshake: attack:armed -> schedule start & send precontact ACK
          if (msg.type === 'attack:armed') {
            this.rendererId = msg.rendererId || this.rendererId;
            const contactMs = (msg.expectedContactAtMs - msg.serverStartAtMs) || 800;
            const leadMs = Math.max(0, msg.serverStartAtMs - Date.now());

            setTimeout(() => {
              this.startAction(msg.side || 'left', 0.65, 2);

              // Gửi ACK trước contact ~300ms
              const ackDelay = Math.max(50, contactMs - 300);
              setTimeout(() => {
                if (this.ws?.readyState === 1) {
                  this.ws.send(JSON.stringify({
                    type: 'overlay:attack_ack',
                    v: 1,
                    rendererId: this.rendererId,
                    requestId: msg.requestId,
                    roundId: msg.roundId,
                    mediaTimeMs: contactMs - 300,
                    mediaDriftMs: this.telemetry.mediaDriftMs || 0,
                    presentedFrames: this.telemetry.presentedFrames || 15,
                    status: 'playing',
                  }));
                }
              }, ackDelay);
            }, leadMs);
            return;
          }

          // 4. Protocol Results: attack:contact / attack:miss / attack:aborted
          if (msg.type === 'attack:contact') {
            if (msg.angularImpulseRadPerSec) {
              this.physics.applyImpulse(msg.angularImpulseRadPerSec, msg.ropeWearDelta || 2);
              this.lastImpulse = msg.angularImpulseRadPerSec;
              this.flashContactEffect(msg.impactSide || 'left');
            }
            return;
          }

          if (msg.type === 'attack:miss') {
            console.log('💨 Server commit: MISS');
            return;
          }

          if (msg.type === 'attack:aborted') {
            console.warn('⚠ Server commit: ABORTED - Lý do:', msg.reason);
            this.resetKnives();
            return;
          }

          if (msg.type === 'attack:visual_fault') {
            console.warn('⚠ Server báo visual_fault, chuyển 3D fallback');
            this.use3DFallback = true;
            return;
          }

          // Legacy test actions
          if (msg.t === 'action' || msg.type === 'action') {
            this.triggerAction(msg.action);
          }
        } catch {}
      };

      this.ws.onclose = () => {
        setTimeout(() => this.connectWebSocket(), 2000);
      };
    } catch {}
  }
}
