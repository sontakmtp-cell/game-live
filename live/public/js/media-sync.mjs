// Media Synchronization & rVFC Clock — TikTok LIVE Arcade (v1.1)
// Spec: TECHNICAL_SPEC.md v1.1, Section 6
// Handles cleanplate video loop, action clip play-from-zero, rVFC drift tracking, and 3D fallback.

export class MediaSyncManager {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container Thư mục cha chứa video elements
   * @param {Function} [options.onDriftUpdate] Callback nhận telemetry drift
   * @param {Function} [options.onFallback] Callback kích hoạt 3D fallback khi video lỗi
   */
  constructor(options = {}) {
    this.container = options.container || document.body;
    this.onDriftUpdate = options.onDriftUpdate || (() => {});
    this.onFallback = options.onFallback || (() => {});

    // Cleanplate background video
    this.cleanplateVideo = null;

    // Action video player
    this.actionVideo = null;
    this.rvfcHandle = null;
    this.isPlayingAction = false;
    this.actionStartTime = 0;
    this.presentedFrames = 0;
    this.currentDriftMs = 0;
    this.reducedTimingConfidence = false;
  }

  /**
   * Khởi tạo video nền cleanplate chạy lặp vô tận (không bao giờ reset khi nhận action)
   * @param {string} src Đường dẫn tệp video cleanplate
   */
  initCleanPlate(src = '/live/public/assets/video/grinder-clean-plate.mp4') {
    if (this.cleanplateVideo) return;

    const v = document.createElement('video');
    v.id = 'cleanplate-video';
    v.src = src;
    v.autoplay = true;
    v.loop = true;
    v.muted = true;
    v.playsInline = true;
    v.style.position = 'absolute';
    v.style.inset = '0';
    v.style.width = '100%';
    v.style.height = '100%';
    v.style.objectFit = 'cover';
    v.style.zIndex = '1';
    v.style.pointerEvents = 'none';

    v.addEventListener('error', (e) => {
      console.warn('Cleanplate video load warning, fallback to 3D background:', e);
      this.onFallback('cleanplate');
    });

    this.container.prepend(v);
    this.cleanplateVideo = v;
    v.play().catch(() => {});
  }

  /**
   * Preload action clip và đảm bảo giải mã frame đầu tiên trước khi arm
   * @param {string} src Đường dẫn video action
   * @returns {Promise<HTMLVideoElement>}
   */
  async preloadActionClip(src) {
    if (!this.actionVideo) {
      const v = document.createElement('video');
      v.id = 'action-video';
      v.muted = true;
      v.playsInline = true;
      v.style.position = 'absolute';
      v.style.inset = '0';
      v.style.width = '100%';
      v.style.height = '100%';
      v.style.objectFit = 'contain';
      v.style.zIndex = '3';
      v.style.pointerEvents = 'none';
      v.style.display = 'none';
      this.container.appendChild(v);
      this.actionVideo = v;
    }

    const v = this.actionVideo;
    v.src = src;
    v.preload = 'auto';

    return new Promise((resolve, reject) => {
      let resolved = false;

      function onReady() {
        if (!resolved && v.readyState >= 2) {
          resolved = true;
          cleanup();
          resolve(v);
        }
      }

      function onError(err) {
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(err);
        }
      }

      function cleanup() {
        v.removeEventListener('loadeddata', onReady);
        v.removeEventListener('canplay', onReady);
        v.removeEventListener('error', onError);
      }

      v.addEventListener('loadeddata', onReady);
      v.addEventListener('canplay', onReady);
      v.addEventListener('error', onError);

      // Timeout 1500ms
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          if (v.readyState >= 1) resolve(v);
          else reject(new Error('Preload action timeout'));
        }
      }, 1500);

      v.load();
    });
  }

  /**
   * Phát action clip BẮT ĐẦU TỪ T=0 (Tuyệt đối không seek tới 3s giữa file khi live)
   * Sử dụng requestVideoFrameCallback (rVFC) để theo dõi drift từng frame
   * @param {Object} actionConfig
   * @param {number} actionConfig.contactMs
   * @param {number} actionConfig.durationMs
   * @param {Function} [onContact]
   */
  async playActionClip(actionConfig, onContact) {
    if (!this.actionVideo) return;

    const v = this.actionVideo;
    v.style.display = 'block';
    v.currentTime = 0; // Luôn phát từ 0.0s

    this.isPlayingAction = true;
    this.actionStartTime = performance.now();
    this.presentedFrames = 0;
    this.currentDriftMs = 0;
    let contactTriggered = false;

    try {
      await v.play();
    } catch (err) {
      console.warn('Action video play error, kích hoạt 3D fallback:', err);
      this.onFallback('action');
      v.style.display = 'none';
      this.isPlayingAction = false;
      return;
    }

    const contactMs = actionConfig.contactMs || 800;
    const durationMs = actionConfig.durationMs || 2400;

    // Theo dõi frame bằng rVFC
    const hasRVFC = typeof v.requestVideoFrameCallback === 'function';
    this.reducedTimingConfidence = !hasRVFC;

    const frameStep = (now, metadata) => {
      if (!this.isPlayingAction) return;

      this.presentedFrames++;
      const elapsedTimeline = performance.now() - this.actionStartTime;
      const mediaTimeMs = metadata ? metadata.mediaTime * 1000 : v.currentTime * 1000;

      // mediaDriftMs = observedMediaTimeMs - expectedMediaTimeMs
      this.currentDriftMs = Math.round(mediaTimeMs - elapsedTimeline);

      this.onDriftUpdate({
        mediaTimeMs: Math.round(mediaTimeMs),
        expectedMediaTimeMs: Math.round(elapsedTimeline),
        mediaDriftMs: this.currentDriftMs,
        presentedFrames: this.presentedFrames,
        reducedTimingConfidence: this.reducedTimingConfidence,
      });

      // Kiểm tra trigger contact
      if (!contactTriggered && elapsedTimeline >= contactMs) {
        contactTriggered = true;
        if (typeof onContact === 'function') onContact();
      }

      if (elapsedTimeline < durationMs && !v.ended) {
        if (hasRVFC) {
          this.rvfcHandle = v.requestVideoFrameCallback(frameStep);
        } else {
          this.rvfcHandle = requestAnimationFrame(() => frameStep(performance.now(), null));
        }
      } else {
        this.stopActionClip();
      }
    };

    if (hasRVFC) {
      this.rvfcHandle = v.requestVideoFrameCallback(frameStep);
    } else {
      this.rvfcHandle = requestAnimationFrame(() => frameStep(performance.now(), null));
    }
  }

  stopActionClip() {
    this.isPlayingAction = false;
    if (this.actionVideo) {
      this.actionVideo.pause();
      this.actionVideo.style.display = 'none';
    }
    if (this.rvfcHandle) {
      cancelAnimationFrame(this.rvfcHandle);
      this.rvfcHandle = null;
    }
  }
}
