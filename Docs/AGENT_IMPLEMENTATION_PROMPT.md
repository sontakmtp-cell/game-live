# PROMPT GIAO VIỆC CHO CODEX / CLAUDE / GEMINI AGENT — v1.1

Mục tiêu: xây dựng bản MVP **TikTok LIVE Arcade — Hybrid Video + Real-Time 3D**, dựa trên repo công khai `https://github.com/kentjuno/chanh-dien-online` (MIT). **Đọc toàn bộ `TECHNICAL_SPEC.md` v1.1 và `ASSET_MANIFEST.example.json` trước khi code.** Làm theo phạm vi **P0 trước**, không vội dựng cảnh AI thật hoặc các tool khác.

## 1. Quy tắc làm việc

- Tôi không phải lập trình viên; giải thích tiến độ và câu hỏi kỹ thuật bằng tiếng Việt dễ hiểu, ngắn gọn.
- Đọc repo thật và báo file hiện hữu; tuyệt đối không giả định file đã có theo tài liệu đặc tả.
- Không push vào upstream `kentjuno/chanh-dien-online`. Nếu đã có fork của tôi thì dùng fork; nếu chưa có thì tạo branch/copy ở workspace có quyền ghi, báo rõ đường dẫn. Không xóa mã nguồn cũ khi chưa cần.
- Giữ MIT LICENSE, thông tin nguồn và bảo mật localhost mặc định.
- Chia PR/commit nhỏ, không thay đổi unrelated code; không gắn API trả tiền/cloud nếu không cần.
- Không tuyên bố clip AI/video GLB có sẵn. **Tạo placeholder procedural** (khung máy, dây, điện thoại đơn giản, thanh dao) cho P0; sau này tôi thay asset Blender/AI vào.
- Không build hệ thống thiết bị thật; mọi thứ chạy ảo trong browser/OBS.
- Không được cố giấu lỗi physics, sai pha video, lệch hitbox bằng fake animation.
- **Bắt buộc fix theo review v1.1:** Three.js +Y-up (dao động X–Y), action đã trim `t=0` (không runtime mid-file seek), PREPARE/ACK trước contact và commit once, local admin token→HttpOnly cookie, camera inline trong manifest. Viết test kiểm tra từng mục.

## 2. Thứ tự nhiệm vụ bắt buộc

### Task 0 — Repo audit / proposal

Đọc: README, LICENSE, `live/server.mjs`, `live/overlay.html`, `live/control.html`, `live/package.json`, static routing. Xuất `docs/IMPLEMENTATION_PLAN.md` gồm dependency hiện tại, vấn đề bảo mật cần giữ, thứ tự file sửa, các rủi ro, test sẽ chạy. Chỉ bắt đầu code sau khi viết plan; không yêu cầu tôi trả lời câu đã có trong đặc tả.

### Task 1 — Physics demo realtime (P0A)

Tạo Three.js overlay 9:16 với camera cố định, procedural rope + phone, đung đưa tự nhiên; thêm dao thử nghiệm. Dùng fixed timestep 1/120, idle + damped disturbance; `xPhone=xAnchor+L*sinθ`, `yPhone=yAnchor-L*cosθ`, `zPhone=zAnchor` trong Three.js +Y-up. Kiểm thử chuyển hệ trục Blender +Z → glTF +Y và không double-rotate. Bấm nút `Touch left`, `Touch right`, `Miss`, `Reset`, `Double hit while recovering` ở control panel. Debug hiển thị angle, angular velocity, impulse, FPS. Chạy được **không có TikTok** và **không có video AI**.

**Nghiệm thu:** các hit liên tiếp không làm phone nhảy vị trí, dây rung dần tắt, miss không tự tăng wear.

### Task 2 — Video/3D composite demo (P0B)

Thêm loop clean plate 10s và 1 action clip đơn giản (Blender-generated hoặc placeholder hình ảnh/video hợp lệ). Manifest quản lý FPS/duration/markers và camera Three.js **inline**. Phải dùng clip **đã trim tại `t=0`**, có keyframe đầu; preload/decode frame đầu, `play()` từ 0 (cấm seek đến 3s/marker ở runtime), rVFC theo dõi timestamp và fallback nếu không có. Có asset validator bằng `ffprobe`; marker contact runtime khoảng 600–900ms (nếu footage thật khớp). Có debug calibration. Nếu chưa có video alpha thật, render tool GLB realtime làm fallback; **không bắt đầu tạo 10 clip AI**.

**Nghiệm thu:** đạo cụ tới đúng vùng rope, không tạo hai dao/ghost, loop video không reset khi nhận action, không làm phone teleport.

### Task 3 — Event engine & server (P1)

Tách các module `rope-physics`, `game-state`, `attack-scheduler`, `gift-normalizer`, `gift-map`, `protocol`. Dùng adapter trên `tiktok-live-connector` có sẵn; nhận gift thật/test, phân biệt streak/non-streak, chống đếm trùng, queue bounded, handshake `attack:scheduled → overlay:prepared → attack:armed → overlay:attack_ack/overlay:drift_abort → attack:contact|attack:miss|attack:aborted`, timeout/commit-once/late-ACK rules, snapshot/reconnect. Tạo local admin token ngẫu nhiên **dùng một lần** trong RAM in URL bootstrap, cấp HttpOnly SameSite=Strict session + redirect bỏ token, xác thực WS control ở server; role query tự khai không đủ quyền. Giữ read-only overlay (chỉ cho phép telemetry an toàn). Dựng một tool action mỗi lần, kết thúc rồi mới chuyển hành động tiếp theo.

**Nghiệm thu:** unit tests + 100 gift simulation. Không được bỏ quà âm thầm, không làm rơi state khi reload overlay; thiếu ACK trước deadline thì không cộng wear, ACK muộn không rollback contact đã commit.

### Task 4 — Break sequence & quản trị (P1B)

Thêm FSM BREAKING/FALLING/CRUSH/RESET. Dùng falling physics realtime, che phone khi qua cửa nghiền; tạo hiệu ứng thay cho footage nghiền AI nếu chưa có. Giao diện admin có test tool, cấu hình damping, phase gate, paused queue, forceBreak trong TEST mode. Thêm thông báo `MÔ PHỎNG 3D` trên live.

### Task 5 — Asset pipeline Blender + AI (P2, chỉ sau P0/P1 qua test)

Tạo một master Blender scene (nếu Blender runtime sẵn có), camera lock, animation dao miss/touch, clean plate, tool mask/alpha, GLB export, marker.json và metadata validation. **Không tự gọi dịch vụ video AI tốn phí** nếu chưa có cấu hình tài khoản/input. Đầu ra là hướng dẫn và script để tôi xuất video gốc, sau đó tôi cung cấp clip AI đã refine. Lắp clip và so sánh contact screen/world, loại các clip sai lệch.

### Task 6 — QA/hardening (P3)

Chạy unit tests, QA overlay trên browser/OBS thực tế nếu có, mô phỏng 1.000 events, kiểm thử reconnection, path traversal/Origin/Host/control, video decoder fallback. Không được ghi PASS cho thử nghiệm chưa chạy. Có lệnh rollback về commit P0 ổn định và tài liệu vận hành.

## 3. Tệp đầu ra tối thiểu

- `docs/IMPLEMENTATION_PLAN.md` (task checklist, quyết định, vấn đề chưa giải quyết).
- Mã nguồn tách module hợp lý, README tiếng Việt cách chạy local/OBS.
- `live/public/asset-manifest.json` với camera Three.js +Y inline + manifest validator (`ffprobe` keyframe/PTS/duration) + 1 placeholder example.
- Unit tests cho physics/trục Y-up, gift streak, queue, FSM, ACK/abort race, admin token/session và security smoke.
- `docs/QA_REPORT.md` có lệnh chạy, kết quả PASS/FAIL/NOT RUN, bằng chứng screenshot/video nếu có.
- Danh mục file đã sửa, lý do, hướng dẫn test cho người không biết code.

## 4. Kết quả cần gửi tôi sau mỗi phase

Báo gọn 5 mục: **(1) Đã làm gì, (2) file/PR/commit, (3) cách chạy, (4) test thực tế đã qua/chưa qua, (5) vấn đề còn tồn tại**. Không viết báo cáo thành công khi không có video hoặc log bằng chứng. Nếu chưa có môi trường Blender/OBS/AI thì tạo demo giả lập và nêu rõ thiếu gì, không tuyên bố đã kiểm thử render thực tế.

## 5. Chốt ưu tiên

**Tập trung toàn lực cho bài toán dây + phone motion liên tục và tool contact alignment.** Gameplay phụ, hiệu ứng hào nhoáng, tiền/quà thắng thật, 3D showroom và nhiều đạo cụ sẽ làm sau. Mục tiêu phase P0 là video 30–60 giây thể hiện: `idle → dao touch → swing → touch lần 2 trong recovery → swing → về idle`, không giật, không teleport.

## 6. Bổ sung tiêu chí chặn release từ review v1.1

- **BLOCKER-COORD:** `PHYS-06` chưa PASS → chưa lắp asset Blender/AI; không nhầm Z-up với Y-up.
- **BLOCKER-MEDIA:** `VIDEO-02`, `VIDEO-04` chưa PASS → dùng tool GLB fallback, không release video WebM action seek động.
- **BLOCKER-PROTOCOL:** `EVT-05/06/07` chưa PASS → không tính wear/đứt dây từ clip video thật.
- **BLOCKER-SEC:** `SEC-02/03` chưa PASS → không kết nối LIVE công khai; không mở HOST ngoài 127.0.0.1.
- **BLOCKER-ASSET:** `ASSET-01` chưa PASS → sửa pipeline camera, không fetch `blender/camera.json` từ client.

Khi test thực tế không khả dụng (OBS/Blender/ffprobe), đánh **NOT RUN**, báo lý do và không tự nâng thành PASS.
