# KẾ HOẠCH TRIỂN KHAI DỰ ÁN (IMPLEMENTATION PLAN)
## TikTok LIVE Arcade — Hybrid Video + Real-Time 3D (v1.1)

> **Mã tài liệu:** `docs/IMPLEMENTATION_PLAN.md`  
> **Phiên bản đặc tả cơ sở:** `TECHNICAL_SPEC.md` v1.1 (03/11/2026) & `AGENT_IMPLEMENTATION_PROMPT.md` v1.1  
> **Trạng thái:** Task 0 — Hoàn tất Audit Repo gốc & Trình bày Đề xuất Kiến trúc Kỹ thuật  
> **Nhánh phát triển:** `feature/hybrid-arcade` (tách riêng từ `main`, không push trực tiếp upstream)  
> **Giấy phép:** MIT License (bảo lưu bản quyền và thông tin tác giả gốc)

---

## 1. TỔNG QUAN VÀ MỤC TIÊU DỰ ÁN

### 1.1. Mục tiêu sản phẩm
Xây dựng bản **MVP TikTok LIVE Arcade — Hybrid Video + Real-Time 3D** đáp ứng trải nghiệm livestream tương tác dọc (9:16 - 1080×1920) trên Windows (TikTok LIVE Studio / OBS Browser Source):
- Một mô hình điện thoại treo bằng sợi dây dưới khung kim loại, đung đưa liên tục trên nền video máy nghiền.
- Người xem tương tác qua quà tặng (thật từ TikTok hoặc giả lập từ bảng điều khiển), kích hoạt các đạo cụ ảo (dao, mũi nhọn, kéo, cưa).
- Đạo cụ vươn đến dây với độ chính xác hình học cao: hụt (`miss`), chạm (`touch` tạo xung lực làm dây/điện thoại đung đưa mạnh hơn và tăng độ sờn dây `ropeWear`), hoặc đứt dây (`break`) khiến điện thoại rơi vào máy nghiền.
- **Tính liên tục tuyệt đối (Continuity):** Sợi dây và điện thoại luôn dao động liên tục qua các trạng thái `idle` → `hit` → `recovering`, không bị giật, teleport hay tua lại frame khi nhận quà.

### 1.2. Tuân thủ nghiêm ngặt các sửa đổi v1.1
Kế hoạch triển khai tích hợp đầy đủ 5 trụ cột sửa đổi bắt buộc từ phiên bản đặc tả kỹ thuật v1.1:
1. **Hệ trục tọa độ Three.js +Y-up:** Con lắc dao động trên mặt phẳng **X–Y** ngang (`xPhone = xAnchor + L*sinθ`, `yPhone = yAnchor - L*cosθ`, `zPhone = zAnchor`). Tuyệt đối không nhầm lẫn với hệ trục Blender +Z-up hoặc công thức mặt phẳng X–Z.
2. **Action video clip đã trim chuẩn `t=0`:** Video action phải bắt đầu từ `t=0`, có keyframe ngay frame đầu tiên. **Cấm tuyệt đối runtime mid-file seek** (như `video.currentTime = 3.0`) khi nhận quà.
3. **Giao thức 2 pha & Commit-once:** Tách biệt chuẩn bị (`attack:scheduled` → `overlay:prepared`), kích hoạt (`attack:armed`), kiểm tra trôi hình trước va chạm (`overlay:attack_ack` / `overlay:drift_abort`), và phán quyết va chạm duy nhất tại server (`attack:contact` / `attack:miss` / `attack:aborted`). Nếu trễ sau commit, chỉ ghi nhận `attack:visual_fault` mà không hoàn tác wear/impulse.
4. **Bảo mật Quản trị cục bộ (Local Admin Auth):** Không tin cậy tham số tự khai `?role=control`. Sử dụng token bootstrap 256-bit dùng 1 lần trong RAM in ra terminal, cấp cookie `HttpOnly` + `SameSite=Strict`, redirect 303 xóa token trên URL. WebSocket kiểm tra cookie session từ request upgrade.
5. **Camera nhúng trực tiếp (Inline Camera):** Manifest `asset-manifest.json` chứa cấu hình camera Three.js chuẩn Y-up. Client không fetch file authoring `blender/camera.json`.

---

## 2. KẾT QUẢ ĐÁNH GIÁ REPO GỐC (REPO AUDIT)

### 2.1. Danh mục tệp hiện hữu trên repo
Repo gốc `kentjuno/chanh-dien-online` (MIT) được clone về local có cấu trúc tệp thực tế như sau:

| Đường dẫn tệp | Trạng thái | Đánh giá chức năng |
|---|---|---|
| `LICENSE` | Hiện hữu | Giấy phép MIT bản quyền © 2026 Kent Juno. **Bắt buộc giữ nguyên.** |
| `README.md` | Hiện hữu | Mô tả ứng dụng Chánh Điện Tịnh Tâm 2.5D. Cần cập nhật bổ sung hướng dẫn chạy Arcade 3D. |
| `index.html`, `assets/` | Hiện hữu | Ứng dụng web tĩnh chánh điện độc lập (Cloudflare Pages). **Bảo lưu nguyên vẹn trong repo.** |
| `_headers`, `.gitignore` | Hiện hữu | Cấu hình bảo mật Cloudflare headers và gitignore. |
| `live/package.json` | Hiện hữu | Khai báo dự án Node.js `type: "module"` cho phần live server. |
| `live/package-lock.json` | Hiện hữu | Khóa phiên bản dependency ban đầu. |
| `live/server.mjs` | Hiện hữu | HTTP server + WebSocket `/ws` + Edge TTS + TikTok connector + static file serving. |
| `live/overlay.html` | Hiện hữu | Giao diện overlay 9:16 Canvas 2D vẽ chánh điện, danh sách người ngồi thiền. |
| `live/control.html` | Hiện hữu | Bảng điều khiển kết nối TikTok, gửi tin nhắn/quà thử nghiệm, chỉnh giọng đọc, âm thanh. |
| `Docs/` | Mới bổ sung | Thư mục tài liệu đặc tả: `TECHNICAL_SPEC.md`, `AGENT_IMPLEMENTATION_PROMPT.md`, `REVISION_NOTES.md`, `ASSET_MANIFEST.example.json`. |

> [!IMPORTANT]
> **Nhận xét quan trọng:** Repo gốc hoàn toàn là ứng dụng 2.5D tâm linh ("Chánh Điện Tịnh Tâm"). Hiện **chưa có bất kỳ mã nguồn 3D, Three.js, con lắc vật lý, hay video máy nghiền nào**. Mọi module của TikTok LIVE Arcade sẽ được xây dựng mới theo hướng kiến trúc module hóa sạch sẽ, tái sử dụng các lớp bảo mật và cơ chế nhận sự kiện của server gốc.

### 2.2. Đánh giá phụ thuộc hiện tại (`live/package.json`)
Môi trường thực tế kiểm tra: **Node.js v22.23.1**, **npm v11.6.2**.

1. **`tiktok-live-connector` (phiên bản `2.5.0`):**
   - *Vai trò:* Kết nối đọc sự kiện công khai (Chat, Gift, Like, Member) từ phòng TikTok LIVE qua WebSocket không chính thức.
   - *Đánh giá:* Xử lý streak quà bằng `type === 1 && !d.repeatEnd` đã có sẵn. 
   - *Rủi ro:* Là thư viện reverse-engineered từ cộng đồng, không bảo đảm ổn định vĩnh viễn khi TikTok cập nhật giao thức.
   - *Phương án:* Giữ adapter độc lập; xây dựng Mock Event Generator / Offline Simulator hoàn chỉnh để phát triển và kiểm thử mà không phụ thuộc vào TikTok.
2. **`msedge-tts` (phiên bản `2.1.1`):**
   - *Vai trò:* Tạo giọng đọc thuyết minh tiếng Việt thông qua Microsoft Edge Read Aloud API.
   - *Đánh giá:* Chất lượng giọng đọc tốt, có queue chống spam (tối đa 15 câu), escape XML. Cần kết nối Internet.
   - *Phương án:* Giữ nguyên để phục vụ TTS thông báo sự kiện Arcade khi cần, có fallback log im lặng khi offline.
3. **`ws` (phiên bản `8.18.0`):**
   - *Vai trò:* Cung cấp máy chủ WebSocket cho overlay và control panel.
   - *Phát hiện kiểm tra an ninh (`npm audit`):* Phát hiện **1 lỗ hổng bảo mật mức High** trên `ws@8.18.0` (GHSA-58qx-3vcg-4xpx: Uninitialized memory disclosure và GHSA-96hv-2xvq-fx4p: Memory exhaustion DoS).
   - *Phương án:* Nâng cấp `ws` lên phiên bản an toàn `^8.18.1` hoặc mới nhất trong cùng major.

### 2.3. Các phụ thuộc mới cần bổ sung
1. **`three` (Three.js):** Cần thiết cho Canvas WebGL (render sợi dây 3D, mô hình điện thoại, camera, ánh sáng, procedural placeholder geometry). Tích hợp phiên bản ổn định (e.g. `^0.170.0` hoặc vendored/ES module tương thích trình duyệt).
2. **Test Runner:** Sử dụng trực tiếp `node:test` và `node:assert` tích hợp sẵn trong Node.js v22.23.1. **Không cần cài đặt thêm Jest/Mocha/Vitest**, giữ dự án gọn nhẹ và không phát sinh rủi ro supply-chain.
3. **Công cụ ngoại vi đã kiểm tra trên máy:**
   - `ffprobe` (v8.0.1) đã sẵn sàng trong hệ thống Windows để kiểm tra keyframe/PTS của video action.
   - `blender` CLI chưa có trong PATH hệ thống → Giữ nguyên tắc P0: Tạo **procedural placeholder 3D**, không giả định asset Blender/AI đã có sẵn.

---

## 3. PHÂN TÍCH ĐỊNH TUYẾN TĨNH & AN NINH MÃ NGUỒN

### 3.1. Cơ chế định tuyến tĩnh hiện tại trong `server.mjs`
Hàm `resolveStatic(urlPath)` hiện tại có các quy tắc:
- Chỉ cho phép các đường dẫn bắt đầu bằng `/assets/` hoặc `/live/`.
- Chặn mọi phân đoạn bắt đầu bằng dấu chấm (`.`) hoặc `node_modules`.
- Kiểm tra Path Traversal: `file.startsWith(ROOT + SEP)`.
- **Dòng chặn mã nguồn (L265):**
  ```javascript
  if (/\.(mjs|json|md|log)$/i.test(p) && !p.startsWith('/assets/')) return null;
  ```
- **Xung đột phát hiện:** Quy tắc trên vô tình **chặn toàn bộ tệp `.mjs` và `.json` nằm trong `/live/`**. Nếu client overlay tải các ES module JavaScript (`/live/src/client/*.mjs` hoặc `/live/public/js/*.mjs`) và tệp manifest `/live/public/asset-manifest.json`, server sẽ trả về `404 not found`!

### 3.2. Thiết kế lại bảng phân quyền định tuyến tĩnh (Static Route Allowlist)
Cần cập nhật `resolveStatic()` để vừa bảo vệ tuyệt đối mã nguồn server, vừa phục vụ chính xác tài nguyên client:
- **Tài nguyên công khai hợp lệ (Allowlist):**
  - `/live/public/asset-manifest.json` (tệp JSON duy nhất được phục vụ ngoài `/assets/`).
  - `/live/public/assets/**/*` (các tệp 3D `.glb`, video `.mp4`/`.webm`, audio `.mp3`, textures).
  - `/live/public/js/**/*` (các tệp client JavaScript `.mjs`/`.js` đã được tách riêng khỏi core).
  - `/live/overlay.html`, `/live/control.html`.
  - `/assets/**/*` (tài nguyên dùng chung).
- **Tuyệt đối cấm (Denylist / Protected):**
  - Mọi tệp chứa mã nguồn máy chủ: `/live/server.mjs`, `/live/src/core/**/*`.
  - Mọi tệp quản lý cấu hình và metadata: `/live/package.json`, `/live/package-lock.json`, `/Docs/**/*`, `*.md`.
  - Mọi thư mục ẩn, `node_modules`, đường dẫn vượt cấp `../` hoặc `%2e%2e`.

---

## 4. CHI TIẾT THIẾT KẾ CƠ CHẾ BẢO MẬT & KIỂM SOÁT PHIÊN (SEC-01, SEC-02, SEC-03)

### 4.1. Những lớp bảo vệ cần bảo lưu (Security Baseline)
1. **Ràng buộc địa chỉ cục bộ:** Server chỉ lắng nghe trên `127.0.0.1` (mặc định), không mở ra mạng LAN hay Internet (`HOST=0.0.0.0` bị cấm ở MVP).
2. **Chống DNS Rebinding:** Header `Host` phải nằm trong `ALLOWED_HOSTS` (`localhost:3000`, `127.0.0.1:3000`, `[::1]:3000`).
3. **Chống Cross-Origin WebSocket Hijacking:** `verifyClient` kiểm tra header `Origin` khớp với Host hợp lệ (cho phép kết nối không có Origin từ OBS Browser Source).
4. **Input Sanitization:** Giới hạn ký tự tên người xem (≤18 ký tự), bình luận (≤120 ký tự), lọc dữ liệu quà tặng, vẽ chữ bằng `textContent` (chống XSS / HTML Injection).

### 4.2. Khắc phục lỗ hổng phân quyền Admin theo v1.1
**Vấn đề hiện tại:** Server cũ gán quyền điều khiển chỉ bằng tham số query:
```javascript
ws.role = new URL(req.url, 'http://x').searchParams.get('role') === 'control' ? 'control' : 'overlay';
```
Bất kỳ mã JavaScript nào chạy trong trình duyệt người dùng đều có thể mở WebSocket tới `ws://127.0.0.1:3000/ws?role=control` và chiếm quyền gửi lệnh.

**Giải pháp Local Admin Token & Session Cookie:**
```mermaid
sequenceDiagram
    autonumber
    actor Admin as Người vận hành (Local)
    participant Terminal as Console / CLI
    participant Server as HTTP / WS Server
    participant Browser as Trình duyệt (Control Panel)

    Server->>Server: Khởi động: Sinh crypto.randomBytes(32) làm bootstrapToken
    Server->>Terminal: In URL: http://127.0.0.1:3000/live/control.html?token={hex}
    Admin->>Browser: Mở liên kết chứa bootstrapToken
    Browser->>Server: GET /live/control.html?token={hex}
    Server->>Server: So khớp token trong RAM (Timing-safe)
    alt Token hợp lệ và chưa sử dụng
        Server->>Server: Hủy bootstrapToken (dùng 1 lần)
        Server->>Server: Tạo sessionId 256-bit trong RAM
        Server-->>Browser: Set-Cookie: session_id={sessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400
        Server-->>Browser: HTTP 303 See Other → Location: /live/control.html (URL sạch)
        Browser->>Server: GET /live/control.html (Kèm Cookie)
        Server-->>Browser: Trả về trang control.html
        Browser->>Server: WS Upgrade /ws (Trình duyệt tự gửi Cookie)
        Server->>Server: Xác thực sessionId trong Cookie
        Server-->>Browser: WS Connected (Gán role: 'control')
    else Token sai hoặc đã bị hủy
        Server-->>Browser: HTTP 403 Forbidden (Yêu cầu xem terminal hoặc restart server)
    end
```

- **Quyền của Overlay:** Overlay kết nối không có cookie session chỉ nhận được role `overlay`. Mọi thông điệp từ overlay bị giới hạn trong telemetry (`overlay:prepared`, `overlay:attack_ack`, `overlay:drift_abort`), gắn kèm `rendererId` được cấp phát. Bất kỳ lệnh `ctl` nào từ overlay sẽ bị hủy bỏ và ghi log cảnh báo.

---

## 5. CẤU TRÚC THƯ MỤC VÀ KẾ HOẠCH SỬA ĐỔI TỆP

### 5.1. Cấu trúc thư mục mục tiêu
```text
h:\AI\game-live-tiktok-gpt\
├─ LICENSE
├─ README.md
├─ Docs/
│  ├─ TECHNICAL_SPEC.md
│  ├─ AGENT_IMPLEMENTATION_PROMPT.md
│  ├─ ASSET_MANIFEST.example.json
│  ├─ REVISION_NOTES.md
│  ├─ IMPLEMENTATION_PLAN.md      <-- Tệp này (Task 0)
│  └─ QA_REPORT.md                <-- Báo cáo kết quả kiểm thử sau các phase
├─ live/
│  ├─ package.json
│  ├─ package-lock.json
│  ├─ server.mjs                  <-- Refactor: auth session, route static, wiring
│  ├─ control.html                <-- Giao diện quản trị Arcade mới
│  ├─ overlay.html                <-- Shell Three.js WebGL 9:16
│  ├─ src/
│  │  ├─ core/                    <-- Logic nghiệp vụ thuần Node (chạy test độc lập)
│  │  │  ├─ protocol.mjs          <-- Định nghĩa & validate schema thông điệp WS v1.1
│  │  │  ├─ rope-physics.mjs      <-- Mô phỏng con lắc fixed timestep 1/120s, Y-up
│  │  │  ├─ game-state.mjs        <-- FSM trạng thái (IDLE, PENDING, ARMED, RECOVER, BREAK)
│  │  │  ├─ attack-scheduler.mjs  <-- Hàng đợi quà, phase gating, timing contact
│  │  │  ├─ gift-normalizer.mjs   <-- Xử lý streak, dedup, gộp combo
│  │  │  └─ gift-map.mjs          <-- Cấu hình ánh xạ quà sang loại đạo cụ
│  │  └─ shared/
│  │     └─ config.mjs            <-- Hằng số vật lý, ngưỡng drift, timeout
│  ├─ public/                     <-- Phục vụ tĩnh cho trình duyệt
│  │  ├─ asset-manifest.json      <-- Manifest chứa inline camera Three.js
│  │  ├─ js/
│  │  │  ├─ overlay-app.mjs       <-- Entry point client overlay
│  │  │  ├─ three-scene.mjs       <-- Khởi tạo Three.js scene, camera, lights
│  │  │  ├─ procedural-assets.mjs <-- Dựng 3D procedural phone, rope, grinder, knife
│  │  │  ├─ media-sync.mjs        <-- Đồng bộ rVFC, tính drift, gửi ACK/ABORT
│  │  │  ├─ hud-view.mjs          <-- Hiển thị thông số, người chơi, nhãn 3D SIMULATION
│  │  │  └─ debug-overlay.mjs     <-- Bật/tắt hiển thị góc θ, vận tốc, FPS, hitbox
│  │  └─ assets/
│  │     ├─ 3d/                   <-- Thư mục chứa GLB (khi có asset thực tế)
│  │     ├─ video/                <-- Thư mục chứa video action đã trim và cleanplate
│  │     └─ audio/                <-- Âm thanh hiệu ứng va chạm, đứt dây
│  └─ tests/
│     ├─ rope-physics.test.mjs    <-- Kiểm thử con lắc, hệ trục Y-up, bảo toàn cơ học
│     ├─ gift-normalizer.test.mjs <-- Kiểm thử streak x1, x2.. xFinal, dedup
│     ├─ attack-scheduler.test.mjs<-- Kiểm thử hàng đợi, timeout, precontact ACK
│     ├─ game-state.test.mjs      <-- Kiểm thử chuyển đổi trạng thái FSM, wear
│     ├─ protocol.test.mjs        <-- Kiểm thử validate thông điệp WebSocket
│     └─ security-smoke.test.mjs  <-- Kiểm thử path traversal, admin token, role spoof
```

### 5.2. Thứ tự chỉnh sửa và tạo mới tệp
1. **Bước 1 (Task 0):** Hoàn tất và xuất `Docs/IMPLEMENTATION_PLAN.md`.
2. **Bước 2 (Chuẩn bị Core & Test Foundation):**
   - Viết `live/src/core/protocol.mjs` và bộ unit test `live/tests/protocol.test.mjs`.
   - Viết `live/src/core/rope-physics.mjs` (công thức Y-up, tích phân fixed-timestep 1/120s) và unit test `live/tests/rope-physics.test.mjs`.
3. **Bước 3 (Task 1 - P0A Realtime Physics Demo):**
   - Tạo `live/public/asset-manifest.json` với cấu hình camera inline.
   - Xây dựng thư viện client Three.js procedural (`procedural-assets.mjs`, `three-scene.mjs`, `overlay-app.mjs`) tạo điện thoại, dây treo, dao thử nghiệm.
   - Viết giao diện điều khiển `live/control.html` với các nút: `Touch left`, `Touch right`, `Miss`, `Reset`, `Double hit`.
   - Chạy kiểm thử vật lý không giật, không teleport.
4. **Bước 4 (Task 2 - P0B Video/3D Composite Demo):**
   - Bổ sung cleanplate video loop và action clip placeholder đã trim `t=0`.
   - Xây dựng `media-sync.mjs` sử dụng `requestVideoFrameCallback` để giám sát drift.
   - Thêm validator `ffprobe` kiểm tra tính hợp lệ của video asset.
5. **Bước 5 (Task 3 - P1 Event Engine & Server Authoritative):**
   - Hoàn thiện `gift-normalizer.mjs`, `attack-scheduler.mjs`, `game-state.mjs` kèm unit tests.
   - Nâng cấp `live/server.mjs`: tích hợp bootstrap token, session cookie, lọc static allowlist, xử lý bắt tay 2 pha (`prepared` → `armed` → `ack` → `contact`).
6. **Bước 6 (Task 4 - P1B Break Sequence & Quản trị):**
   - Hoàn thiện FSM rơi tự do của điện thoại vào máy nghiền, reset round, hiển thị nhãn cảnh báo mô phỏng 3D.
7. **Bước 7 (Task 5 & 6 - P2/P3 Asset Pipeline, Stress Test & Hardening):**
   - Stress test 1000 events, reconnect WebSocket, hoàn thiện `Docs/QA_REPORT.md`.

---

## 6. MA TRẬN RỦI RO KỸ THUẬT VÀ PHƯƠNG ÁN XỬ LÝ

| Rủi ro kỹ thuật | Mức độ | Tác động | Giải pháp khắc phục triệt để |
|---|---|---|---|
| **Lệch hệ trục tọa độ Blender vs Three.js** | **Nghiêm trọng (P0 Blocker)** | Con lắc dao động sai mặt phẳng, phone bị méo hoặc xoay lộn ngược trục Z | Chuẩn hóa Three.js +Y-up: dao động ngang trong mặt phẳng X–Y (`x = xA + L sinθ`, `y = yA - L cosθ`, `z = zA`). Viết unit test `PHYS-06` kiểm tra biến đổi tọa độ từ Blender sang Three.js không bị xoay kép (double-rotate). |
| **Sai pha video & Seek lag trong lúc Live** | **Nghiêm trọng (P0 Blocker)** | Runtime seek (như nhảy tới 3.0s) gây đứng hình WebM alpha, lệch thời điểm chạm dây | Bắt buộc dùng action clip đã trim riêng biệt phát từ `t=0`, frame đầu tiên là keyframe. Handshake 2 pha: Preload frame 0 → `overlay:prepared` → `attack:armed` → `overlay:attack_ack` trước deadline 150ms. |
| **Chưa có video AI photoreal** | Trung bình | Không có tài nguyên video hoàn chỉnh để dựng cảnh ngay | Tách biệt hoàn toàn phần nhìn và động học: P0 sử dụng procedural 3D placeholders (dây bằng cylinder/spline, phone bằng rounded box, dao bằng extruded mesh). Khi có video AI chỉ cần cập nhật manifest. |
| **Bị giả mạo quyền Admin / Control WS** | Cao | Người xem mở devtools gửi lệnh phá hỏng livestream | Triển khai token bootstrap ngẫu nhiên 256-bit in ra terminal → cấp cookie `HttpOnly; SameSite=Strict` qua 303 redirect. WS `/ws` từ chối lệnh `ctl` nếu không có session cookie hợp lệ. |
| **Lỗ hổng Denial of Service trên gói `ws`** | Cao | Server bị treo/crash do gói tin phân mảnh | Nâng cấp `ws` trong `live/package.json` lên phiên bản an toàn; đặt giới hạn `maxPayload: 64 * 1024` trên WebSocketServer. |
| **Spam quà tặng dồn dập làm sập hàng đợi** | Cao | Quá tải bộ nhớ, mở hàng chục video decoder cùng lúc | Giới hạn hàng đợi `maxQueue = 30`. Áp dụng gift streak aggregator: 100 Rose chỉ kích hoạt 1 chuỗi hành động kèm bộ đếm combo hiển thị HUD, không xếp 100 action rời. |
| **Trôi frame (drift) sau khi server đã commit** | Trung bình | Video bị giật sau khi server đã tính lực va chạm | Quy tắc commit-once: Không bao giờ rollback wear hay impulse sau khi đã commit. Nếu phát hiện trễ, gửi `attack:visual_fault` và chuyển sang render đạo cụ 3D realtime fallback. |

---

## 7. MA TRẬN KIỂM THỬ (TEST MATRIX)

Hệ thống kiểm thử được thiết kế dựa trên 24 kịch bản nghiệm thu bắt buộc trong đặc tả kỹ thuật:

| Mã kiểm thử | Hạng mục kiểm tra | Tiêu chí đạt (Pass Criteria) | Công cụ thực hiện |
|---|---|---|---|
| **PHYS-01** | Dao động tĩnh (Idle 120s) | Góc và vận tốc biến thiên liên tục, không trôi điểm neo, không nhảy frame | Unit test / Headless simulation |
| **PHYS-02** | Va chạm kép (Double touch) | Cú chạm thứ 2 cộng dồn xung lực vào vận tốc hiện tại; không teleport vị trí | Unit test `rope-physics.test.mjs` |
| **PHYS-03** | Đạo cụ đánh hụt (Miss) | Dao lướt qua vùng contact nhưng không cộng xung lực, `wearDelta = 0` | Unit test `rope-physics.test.mjs` |
| **PHYS-04** | Biến dạng sóng dây (Rope wave) | Thân dây uốn cong cục bộ tại điểm chạm rồi truyền xung lực xuống phone | Three.js visual test |
| **PHYS-05** | Đứt dây khi lệch góc (Break swing) | Khi đứt ở góc θ ≠ 0, phone rơi tự do với vận tốc đầu tiếp tuyến, không giật về tâm | Unit test `rope-physics.test.mjs` |
| **PHYS-06** | Chuẩn hóa hệ trục (+Y-up) | Chuyển đổi Blender +Z sang Three.js +Y chính xác; dao động trên mặt phẳng X–Y | Unit test `rope-physics.test.mjs` |
| **VIDEO-01** | Loop cleanplate máy nghiền | Chạy liên tục qua 10 chu kỳ không lộ vết nối (seam) hoặc giật ánh sáng | Browser / OBS check |
| **VIDEO-02** | Action clip trim phát từ t=0 | Bắt đầu từ 0s, frame đầu là keyframe, marker contact 600–900ms, không mid-seek | `ffprobe` asset validator |
| **VIDEO-03** | Fallback khi mất alpha WebM | Tự động chuyển sang fallback tool 3D procedural/GLB, không bị màn hình đen | Client fallback test |
| **VIDEO-04** | Validator từ chối clip lỗi | Clip thiếu keyframe frame 0 hoặc PTS > 0 bị validator từ chối trước khi phát | `ffprobe` test script |
| **VIDEO-05** | Late frame sau ACK | Báo cáo `attack:visual_fault`, giữ nguyên wear đã commit, kích hoạt fallback | Unit test `attack-scheduler.test.mjs` |
| **EVT-01** | Quà chuỗi (Gift streak) | Quà x1, x2.. xFinal chỉ ghi nhận 1 combo theo tổng cuối; không cộng dồn từng bước | Unit test `gift-normalizer.test.mjs` |
| **EVT-02** | 100 sự kiện dồn dập | Hàng đợi giới hạn, không sập server, thống kê pending chính xác, không drop ngầm | Stress test `queue.test.mjs` |
| **EVT-03** | Overlay mất kết nối đột ngột | Server giữ nguyên trạng thái; overlay kết nối lại nhận snapshot đồng bộ ngay | Integration test |
| **EVT-04** | Quà tặng tới khi đang rơi dây | Gán quà vào round kế tiếp hoặc lưu hàng đợi an toàn; không gây crash FSM | Unit test `game-state.test.mjs` |
| **EVT-05** | Thiếu ACK trước deadline | Server tự động chuyển `attack:aborted`, không tăng độ sờn dây | Unit test `attack-scheduler.test.mjs` |
| **EVT-06** | ACK trùng / ACK trễ | Quyết định commit đúng 1 lần; ACK đến muộn bị bỏ qua và ghi log | Unit test `attack-scheduler.test.mjs` |
| **EVT-07** | Mất renderer chính sau PREPARE | Huỷ bỏ action đang chờ an toàn, không tự động cộng lực | Unit test `attack-scheduler.test.mjs` |
| **SEC-01** | Chống duyệt đường dẫn (Traversal) | Các yêu cầu chứa `/../`, `%2e%2e`, truy cập `server.mjs`, `package.json` bị chặn 404 | Integration test `security-smoke.test.mjs` |
| **SEC-02** | Chống giả mạo `?role=control` | Kết nối WS có `?role=control` nhưng thiếu Cookie session bị hạ quyền hoặc từ chối | Integration test `security-smoke.test.mjs` |
| **SEC-03** | Vòng đời Bootstrap Token | Token dùng 1 lần, cấp cookie `HttpOnly`, 303 redirect; khởi động lại thu hồi session | Integration test `security-smoke.test.mjs` |
| **ASSET-01** | Camera Three.js inline | Camera đọc trực tiếp từ `asset-manifest.json`; không gửi request tới `blender/camera.json` | Manifest schema test |
| **UI-01** | Hiển thị 9:16 & Nhãn mô phỏng | Bố cục 1080×1920 hiển thị rõ dây/phone/grinder; nhãn "MÔ PHỎNG 3D" nổi bật | Browser visual inspect |
| **OPS-01** | Vận hành bền bỉ 30 phút | Không rò rỉ bộ nhớ DOM/Three.js; FPS ổn định ≥ 30fps | Long-running smoke test |

---

## 8. LỘ TRÌNH THỰC HIỆN CHI TIẾT (TASK CHECKLIST)

### [x] Task 0 — Repo Audit & Implementation Proposal (Đang thực hiện)
- [x] Đọc và đối chiếu toàn bộ `TECHNICAL_SPEC.md` v1.1, `AGENT_IMPLEMENTATION_PROMPT.md` v1.1, `REVISION_NOTES.md`.
- [x] Kiểm tra thực tế mã nguồn repo gốc: `README.md`, `LICENSE`, `live/server.mjs`, `live/overlay.html`, `live/control.html`, `live/package.json`.
- [x] Đánh giá định tuyến tĩnh, phát hiện xung đột đuôi `.mjs`/`.json` và đề xuất phương án allowlist.
- [x] Tạo nhánh làm việc độc lập `feature/hybrid-arcade`.
- [x] Cài đặt dependency hiện tại (`npm install`) và chạy an ninh mã nguồn (`npm audit`).
- [x] Xuất bản tài liệu `Docs/IMPLEMENTATION_PLAN.md`.

### [x] Task 1 — Physics Demo Realtime (P0A) (Đã hoàn thành)
- [x] Xây dựng module `live/src/core/rope-physics.mjs` (chuẩn Three.js +Y-up, con lắc X–Y, fixed timestep 1/120s, dao động idle + damping).
- [x] Viết bộ unit test `live/tests/rope-physics.test.mjs` kiểm tra các ca va chạm, bảo toàn cơ học và hệ trục (`PHYS-01`, `PHYS-02`, `PHYS-03`, `PHYS-06`).
- [x] Xây dựng `live/public/asset-manifest.json` chứa thông số camera Three.js inline và placeholder geometry.
- [x] Dựng `live/public/js/procedural-assets.mjs` tạo các vật thể 3D procedural (khung treo, dây đốt spline, điện thoại rounded box, lưỡi dao).
- [x] Dựng `live/overlay.html` và `live/public/js/overlay-app.mjs` hiển thị Three.js canvas 9:16 (1080×1920), tích hợp camera cố định và render loop.
- [x] Nâng cấp `live/control.html` bổ sung các nút bấm kiểm thử: `Touch left`, `Touch right`, `Miss`, `Reset`, `Double hit while recovering`.
- [x] Tích hợp bảng debug hiển thị trực tiếp góc $\theta$, vận tốc góc $\omega$, xung lực impulse, FPS.
- [x] **Nghiệm thu P0A:** Các cú hit liên tiếp không làm phone teleport, dây tắt dần dao động mượt mà, miss không cộng độ sờn dây.

### [x] Task 2 — Video/3D Composite Demo (P0B) (Đã hoàn thành & Đã kiểm chứng thực tế)
- [x] Sửa lỗi Three.js: bổ sung `three.core.js` vào vendor, giải quyết triệt để lỗi import module trên trình duyệt.
- [x] Sửa thứ tự hiển thị: Cleanplate video nằm dưới cùng (`z-index: 1`), Canvas 3D Three.js nằm ở giữa (`z-index: 2`, nền trong suốt), HUD nằm trên cùng (`z-index: 10`). Video hành động chạy tracking rVFC ẩn không che khuất điện thoại và dây.
- [x] Căn chỉnh hình học: Khắc phục lỗi lệch tâm móc treo điện thoại (pivot tại $y=0$) và lỗi mũi dao đâm xuyên qua dây (mũi dao tại $x=0$).
- [x] Bổ sung cleanplate loop video 10s hoạt động không gián đoạn (`VIDEO-01`).
- [x] Bổ sung action clip trim bắt đầu từ $t=0$, keyframe tại frame 0, contact marker 800ms (`VIDEO-02`, `VIDEO-04`).
- [x] Xây dựng công cụ asset validator bằng `ffprobe` (`live/src/core/asset-validator.mjs`).
- [x] Xây dựng `live/public/js/media-sync.mjs` theo dõi thời gian qua `requestVideoFrameCallback` (rVFC) và đo độ trôi `mediaDriftMs`.
- [x] Hiệu chuẩn camera giữa lớp 3D và màn hình 1080×1920 (kiểm chứng sai số corridor).
- [x] **Kiểm chứng thực tế:** Chạy trên trình duyệt Chromium thực tế, kiểm tra Console/Network sạch lỗi, chụp screenshot 9:16 (`Docs/screenshots/`) và xuất video demo thực tế (`Docs/demo_p0b_arcade.mp4`).
- [x] **Nghiệm thu P0B:** Khung treo, dây, điện thoại, máy nghiền và dao hiển thị rõ ràng, đung đưa mượt mà, chịu va chạm, tắt dần êm ái và phục hồi về idle.

### [x] Task 3 — Event Engine & Server Authoritative (P1) (Đã hoàn thành)
- [x] Tách biệt các module lõi:
  - `live/src/core/protocol.mjs`: Định nghĩa và kiểm tra cấu trúc thông điệp WebSocket v1.1.
  - `live/src/core/gift-normalizer.mjs`: Chuẩn hóa gift, gộp streak, chống trùng lặp (`EVT-01`).
  - `live/src/core/gift-map.mjs`: Cấu hình ánh xạ các loại quà tặng sang đạo cụ tương ứng.
  - `live/src/core/attack-scheduler.mjs`: Quản lý hàng đợi bounded, bắt tay 2 pha (`prepared` → `armed` → `ack` → `commit`), xử lý timeout và drift abort (`EVT-05`, `EVT-06`, `EVT-07`).
  - `live/src/core/game-state.mjs`: Quản lý vòng đời `roundId`, tích lũy độ sờn `ropeWearTotal`, cấp phát snapshot.
- [ ] Nâng cấp bảo mật trong `live/server.mjs`:
  - Cơ chế bootstrap token 256-bit dùng 1 lần trong RAM, in URL ra terminal khi khởi động (`SEC-03`).
  - Cấp phát cookie session `HttpOnly; SameSite=Strict`, chuyển hướng 303 xóa token trên thanh địa chỉ.
  - Kiểm tra cookie session khi bắt tay WebSocket `/ws`, phân quyền `control` và cấp `rendererId` cho primary overlay (`SEC-02`).
  - Cập nhật bảng định tuyến tĩnh allowlist an toàn (`SEC-01`).
- [x] Viết bộ test tích hợp mô phỏng 100 sự kiện quà tặng dồn dập (`EVT-02`).
- [x] **Nghiệm thu P1:** Toàn bộ unit tests vượt qua, không bỏ rơi sự kiện, reload overlay nhận lại snapshot trơn tru, hết hạn ACK trước deadline thì không cộng độ sờn.

### [ ] Task 4 — Break Sequence & Quản trị Hoàn thiện (P1B)
- [ ] Cập nhật FSM hỗ trợ trạng thái: `BREAKING` → `FALLING` → `CRUSH_SEQUENCE` → `RESETTING` → `IDLE`.
- [ ] Triển khai vật lý rơi tự do realtime cho điện thoại sau khi đứt dây (`PHYS-05`).
- [ ] Hiệu ứng che khuất (occlusion) khi điện thoại rơi qua miệng máy nghiền.
- [ ] Hoàn thiện giao diện Admin Panel: Quản lý hàng đợi tạm dừng/tiếp tục, cấu hình damping, nút `forceBreak` (chỉ bật ở chế độ TEST).
- [ ] Hiển thị thông báo bắt buộc trên Overlay: `MÔ PHỎNG 3D · KHÔNG CÓ IPHONE/QUÀ THẬT`.

### [ ] Task 5 — Asset Pipeline Blender & AI Video (P2)
- [ ] Soạn thảo script hướng dẫn xuất camera và scene rập khuôn từ Blender (`export_tools.py`).
- [ ] Đối chiếu sai lệch contact point giữa video AI và render gốc Blender (loại bỏ nếu lệch > 5px).
- [ ] Cập nhật manifest chính thức với checksum sha256 cho từng tệp tài nguyên.

### [ ] Task 6 — QA, Stress Test & Hardening (P3)
- [ ] Chạy kiểm thử tự động toàn bộ 24 kịch bản nghiệm thu.
- [ ] Mô phỏng 1.000 sự kiện quà tặng liên tục, kiểm tra rò rỉ bộ nhớ qua 30 round.
- [ ] Kiểm thử ngắt kết nối và phục hồi WebSocket trong mọi pha hành động.
- [ ] Lập báo cáo kiểm thử hoàn chỉnh `Docs/QA_REPORT.md` (ghi nhận rõ ràng các mục PASS / FAIL / NOT RUN kèm minh chứng cụ thể).
- [ ] Cập nhật `README.md` hướng dẫn chi tiết cách chạy local và cấu hình OBS Studio.

---

## 9. QUY TẮC BÁO CÁO VÀ NGHIỆM THU TỪNG GIAI ĐOẠN

Sau khi hoàn thành mỗi phase, trợ lý cam kết báo cáo ngắn gọn, minh bạch theo đúng 5 mục:
1. **Đã làm gì:** Tóm tắt công việc kỹ thuật đã hoàn tất.
2. **Danh mục tệp / Commit:** Danh sách các tệp tạo mới hoặc sửa đổi kèm lý do.
3. **Cách chạy & Kiểm chứng:** Lệnh chạy cụ thể để người dùng tự kiểm tra trên máy.
4. **Kết quả kiểm thử thực tế:** Thống kê các ca PASS, FAIL, và **NOT RUN** (nếu thiếu phần cứng OBS/TikTok, giải thích lý do rõ ràng, tuyệt đối không ngụy tạo kết quả).
5. **Vấn đề còn tồn tại:** Những hạn chế kỹ thuật cần giải quyết ở bước tiếp theo.
