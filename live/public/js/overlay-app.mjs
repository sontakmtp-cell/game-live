// Overlay Application — TikTok LIVE Arcade (v1.1)
// Integrates Three.js 9:16 WebGL rendering, RopePhysics, procedural models, and action animations.

import * as THREE from './vendor/three.module.js';
import { RopePhysics } from './rope-physics.mjs';
import {
  createCeilingMount,
  createRopeMesh,
  createPhoneMesh,
  createGrinderMesh,
  createKnifeMesh,
} from './procedural-assets.mjs';

export class OverlayApp {
  constructor(canvasElement, debugElement) {
    this.canvas = canvasElement;
    this.debugEl = debugElement;

    this.manifest = null;
    this.physics = null;

    this.scene = null;
    this.camera = null;
    this.renderer = null;

    this.ropeComp = null;
    this.phoneMesh = null;
    this.grinderComp = null;
    this.knifeLeft = null;
    this.knifeRight = null;

    // Trạng thái hành động đạo cụ
    this.activeAction = null; // { type, side, startTime, contactMs, durationMs, impulse, wearDelta, triggeredContact }
    this.lastImpulse = 0.0;

    // Đồng hồ FPS & render
    this.lastFrameTime = performance.now();
    this.frameCount = 0;
    this.fps = 30;
    this.fpsTimer = performance.now();

    // Kết nối WebSocket
    this.ws = null;
  }

  async init() {
    // 1. Tải manifest asset chứa camera inline
    try {
      const res = await fetch('/live/public/asset-manifest.json');
      this.manifest = await res.json();
    } catch (e) {
      console.warn('Không tải được manifest, sử dụng cấu hình mặc định:', e);
      this.manifest = {
        camera: {
          fovDeg: 40,
          near: 0.1,
          far: 100,
          position: [0.0, 1.2, 3.2],
          target: [0.0, 0.6, 0.0],
        },
        rope: {
          anchor: [0.0, 1.25, 0.0],
          lengthMeters: 0.65,
          segments: 24,
        },
        phone: {
          dimensions: [0.16, 0.32, 0.018],
        },
      };
    }

    // 2. Khởi tạo vật lý
    const anchorArr = this.manifest.rope?.anchor || [0, 1.25, 0];
    this.physics = new RopePhysics({
      ropeLengthMeters: this.manifest.rope?.lengthMeters || 0.65,
      anchor: { x: anchorArr[0], y: anchorArr[1], z: anchorArr[2] },
    });

    // 3. Khởi tạo Three.js Scene, Camera, Renderer
    this.setupScene();

    // 4. Dựng các vật thể 3D procedural
    this.buildMeshes();

    // 5. Kết nối WebSocket với server
    this.connectWebSocket();

    // 6. Bắt đầu Render Loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0c10); // Màu không gian nền xưởng tối

    // Camera perspective 9:16 (1080x1920)
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

    // WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(1080, 1920);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Ánh sáng (Lighting)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    // Đèn chính (Key light tạo bóng đổ sắc nét)
    const dirLight = new THREE.DirectionalLight(0xfffaed, 2.0);
    dirLight.position.set(1.5, 3.0, 2.5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 8;
    this.scene.add(dirLight);

    // Đèn phụ viền xanh công nghiệp (Industrial blue rim light)
    const rimLight = new THREE.PointLight(0x4a90e2, 3.5, 6);
    rimLight.position.set(-2.0, 1.0, 1.0);
    this.scene.add(rimLight);

    // Đèn đỏ cảnh báo từ máy nghiền dưới đáy (Grinder red warning light)
    const grinderLight = new THREE.PointLight(0xff3322, 2.5, 4);
    grinderLight.position.set(0.0, -0.4, 0.8);
    this.scene.add(grinderLight);
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

    // 5. Dao cắt bên trái và bên phải
    this.knifeLeft = createKnifeMesh('left');
    this.knifeLeft.position.set(-1.4, 0.8, 0); // Vị trí nghỉ ngoài màn hình
    this.scene.add(this.knifeLeft);

    this.knifeRight = createKnifeMesh('right');
    this.knifeRight.position.set(1.4, 0.8, 0);
    this.scene.add(this.knifeRight);
  }

  /**
   * Kích hoạt một hành động đạo cụ (touch_left, touch_right, miss, double_hit, reset)
   */
  triggerAction(actionType) {
    const now = performance.now();

    if (actionType === 'reset') {
      this.physics.reset(false);
      this.lastImpulse = 0;
      if (this.activeAction) {
        this.activeAction = null;
        this.resetKnives();
      }
      return;
    }

    if (actionType === 'double_hit') {
      // Bắt đầu hit 1 ngay lập tức, và hẹn giờ hit 2 sau 1.1s (khi đang hồi phục)
      this.startKnifeAction('touch_left', 0.65, 2);
      setTimeout(() => {
        this.startKnifeAction('touch_right', -0.65, 2);
      }, 1100);
      return;
    }

    if (actionType === 'touch_left') {
      this.startKnifeAction('touch_left', 0.65, 2);
    } else if (actionType === 'touch_right') {
      this.startKnifeAction('touch_right', -0.65, 2);
    } else if (actionType === 'miss') {
      this.startKnifeAction('miss', 0.0, 0);
    }
  }

  startKnifeAction(type, impulse, wearDelta) {
    const side = type === 'touch_right' ? 'right' : 'left';
    this.activeAction = {
      type,
      side,
      startTime: performance.now(),
      contactMs: 800, // Marker contact 800ms
      durationMs: 2400, // Toàn bộ clip 2.4s
      impulse,
      wearDelta,
      triggeredContact: false,
    };
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
      // Kết thúc hành động
      this.activeAction = null;
      this.resetKnives();
      return;
    }

    const knife = side === 'left' ? this.knifeLeft : this.knifeRight;
    const dir = side === 'left' ? 1 : -1;

    // Quỹ đạo vươn dao:
    // 0 -> contactMs (800ms): Lao từ ngoài (x = ±1.4) vào vùng contact (x = ±0.03 với touch, x = ±0.18 với miss)
    // contactMs -> contactMs + 200ms: Dừng ở đỉnh va chạm
    // Sau đó -> durationMs: Thu dao về vị trí nghỉ ngoài màn hình
    const restX = dir * -1.4;
    const targetX = type === 'miss' ? dir * -0.22 : dir * -0.04;

    let currentX = restX;
    if (elapsed <= contactMs) {
      // Lao vào theo đường cong Smoothstep
      const t = elapsed / contactMs;
      const ease = t * t * (3 - 2 * t);
      currentX = restX + (targetX - restX) * ease;
    } else if (elapsed <= contactMs + 250) {
      currentX = targetX;
    } else {
      // Rút về
      const t = (elapsed - (contactMs + 250)) / (durationMs - (contactMs + 250));
      const ease = t * t;
      currentX = targetX + (restX - targetX) * ease;
    }

    knife.position.x = currentX;

    // Kiểm tra thời điểm tiếp xúc (Contact trigger)
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
    // Hiệu ứng lóe sáng điểm tiếp xúc
    const flash = new THREE.PointLight(0xfff2aa, 5.0, 1.2);
    flash.position.set(side === 'left' ? -0.04 : 0.04, 0.8, 0.1);
    this.scene.add(flash);
    setTimeout(() => {
      this.scene.remove(flash);
    }, 120);
  }

  animate(now) {
    requestAnimationFrame(this.animate);

    // Tính delta time
    const dt = Math.min((now - this.lastFrameTime) / 1000, 0.05);
    this.lastFrameTime = now;

    // FPS counter
    this.frameCount++;
    if (now - this.fpsTimer >= 500) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.fpsTimer));
      this.frameCount = 0;
      this.fpsTimer = now;
    }

    // 1. Cập nhật vật lý con lắc (1/120s fixed-timestep)
    this.physics.update(dt);

    // 2. Cập nhật vị trí điện thoại từ mô phỏng vật lý
    const phoneTransform = this.physics.getPhoneTransform();
    if (this.phoneMesh) {
      // Điểm treo điện thoại ở mép trên (offset 0.16m)
      this.phoneMesh.position.set(
        phoneTransform.x,
        phoneTransform.y - 0.16 * Math.cos(phoneTransform.rotationZ),
        phoneTransform.z
      );
      this.phoneMesh.rotation.z = phoneTransform.rotationZ;
    }

    // 3. Cập nhật các đốt dây
    if (this.ropeComp) {
      const ropePoints = this.physics.getRopePoints(24);
      this.ropeComp.updateRopePoints(ropePoints);
    }

    // 4. Cập nhật máy nghiền quay răng
    if (this.grinderComp) {
      this.grinderComp.update(dt);
    }

    // 5. Cập nhật dao thử nghiệm
    this.updateKnives(now, dt);

    // 6. Render cảnh 3D
    this.renderer.render(this.scene, this.camera);

    // 7. Cập nhật thông tin debug
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
      <div style="font-weight:700;color:#e2b04f;margin-bottom:4px">⚙ P0A REALTIME PHYSICS</div>
      <div>Angle θ: <b>${deg}°</b> (${rad} rad)</div>
      <div>Angular Vel ω: <b>${vel}</b> rad/s</div>
      <div>Last Impulse: <b>${this.lastImpulse.toFixed(2)}</b> rad/s</div>
      <div>Rope Wear: <b>${snap.wear}%</b></div>
      <div>State: <span style="color:${actionState === 'IDLE' ? '#46d36b' : '#ffaa44'}">${actionState}</span></div>
      <div>Sim FPS: <b>${this.fps}</b> | 120Hz fixed</div>
      <div style="margin-top:4px;font-size:10px;color:#aaa">Coord: Three.js +Y-up (X-Y plane)</div>
    `;
  }

  connectWebSocket() {
    try {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${location.host}/ws`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('✅ Overlay đã kết nối WebSocket');
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.t === 'action') {
            this.triggerAction(msg.action);
          } else if (msg.type === 'action') {
            this.triggerAction(msg.action);
          }
        } catch {}
      };

      this.ws.onclose = () => {
        setTimeout(() => this.connectWebSocket(), 2000);
      };
    } catch (e) {
      console.warn('Không thể kết nối WebSocket local:', e);
    }
  }
}
