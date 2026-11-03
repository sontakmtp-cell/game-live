// Asset Validator — TikTok LIVE Arcade (v1.1)
// Spec: TECHNICAL_SPEC.md v1.1, Section 4.3 & QA VIDEO-02, VIDEO-04
// Validates CFR 30fps, first frame keyframe, start PTS = 0, duration.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';

const execFileAsync = promisify(execFile);

/**
 * Kiểm tra tính hợp lệ của video action clip / cleanplate bằng ffprobe
 * @param {string} filePath Đường dẫn tuyệt đối tới tệp video
 * @param {Object} options
 * @param {number} [options.expectedDurationMs] Thời lượng kỳ vọng (ms)
 * @param {number} [options.expectedFps=30] Tốc độ khung hình kỳ vọng
 * @param {boolean} [options.requireFirstFrameKeyframe=true] Bắt buộc keyframe tại t=0
 * @param {number} [options.maxPtsStartMs=33.3] Ngưỡng PTS bắt đầu tối đa (ms)
 * @returns {Promise<{ valid: boolean, errors: string[], metadata: Object }>}
 */
export async function validateVideoAsset(filePath, options = {}) {
  const errors = [];
  const expectedFps = options.expectedFps || 30;
  const requireKeyframe = options.requireFirstFrameKeyframe !== false;
  const maxPtsStartMs = options.maxPtsStartMs ?? 35; // tối đa 1 frame trôi

  if (!fs.existsSync(filePath)) {
    return { valid: false, errors: [`File không tồn tại: ${filePath}`], metadata: {} };
  }

  try {
    // 1. Chạy ffprobe lấy thông tin streams và packets đầu
    const args = [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,r_frame_rate,avg_frame_rate,duration,codec_name:packet=pts_time,flags',
      '-read_intervals', '%+#5', // Đọc 5 packet đầu tiên để kiểm tra keyframe & PTS
      '-of', 'json',
      filePath,
    ];

    const { stdout } = await execFileAsync('ffprobe', args);
    const data = JSON.parse(stdout);

    const stream = data.streams?.[0];
    const packets = data.packets || [];

    if (!stream) {
      return { valid: false, errors: ['Không tìm thấy video stream hợp lệ'], metadata: {} };
    }

    const metadata = {
      codec: stream.codec_name,
      width: stream.width,
      height: stream.height,
      r_frame_rate: stream.r_frame_rate,
      avg_frame_rate: stream.avg_frame_rate,
      durationSec: parseFloat(stream.duration || 0),
      durationMs: Math.round(parseFloat(stream.duration || 0) * 1000),
      firstPacketPtsSec: null,
      firstPacketIsKeyframe: false,
    };

    // 2. Kiểm tra tỷ lệ khung hình & FPS (CFR 30fps)
    const [fpsNum, fpsDen] = (stream.r_frame_rate || '30/1').split('/').map(Number);
    const calculatedFps = fpsDen ? fpsNum / fpsDen : 0;
    if (Math.abs(calculatedFps - expectedFps) > 0.5) {
      errors.push(`FPS không đạt yêu cầu: ${calculatedFps.toFixed(2)} (kỳ vọng ~${expectedFps})`);
    }

    // 3. Kiểm tra first packet PTS và Keyframe tại t=0
    if (packets.length > 0) {
      const firstPkt = packets[0];
      const ptsSec = parseFloat(firstPkt.pts_time || 0);
      const ptsMs = Math.round(ptsSec * 1000);
      metadata.firstPacketPtsSec = ptsSec;

      // Cờ 'K__' trong ffprobe thể hiện Keyframe
      const isKey = (firstPkt.flags || '').includes('K');
      metadata.firstPacketIsKeyframe = isKey;

      if (requireKeyframe && !isKey) {
        errors.push(`VIDEO-04 LỖI: Packet đầu tiên không phải Keyframe (flags='${firstPkt.flags}'). Cấm seek giữa file.`);
      }

      if (ptsMs > maxPtsStartMs) {
        errors.push(`VIDEO-04 LỖI: PTS bắt đầu quá muộn (${ptsMs}ms > ngưỡng ${maxPtsStartMs}ms). Clip phải bắt đầu tại 0.0s.`);
      }
    } else {
      errors.push('Không đọc được packets của video');
    }

    // 4. Kiểm tra thời lượng nếu có yêu cầu
    if (options.expectedDurationMs) {
      const diff = Math.abs(metadata.durationMs - options.expectedDurationMs);
      if (diff > 150) {
        errors.push(`Thời lượng clip lệch nhiều: ${metadata.durationMs}ms (kỳ vọng ~${options.expectedDurationMs}ms)`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      metadata,
    };
  } catch (err) {
    return {
      valid: false,
      errors: [`ffprobe thất bại: ${err?.message || err}`],
      metadata: {},
    };
  }
}
