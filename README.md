# TikTok LIVE Arcade & Chánh Điện Tịnh Tâm
> **Phiên bản:** v1.1 (Hybrid Video + Real-Time 3D & Chánh Điện 2.5D)  
> **Giấy phép:** MIT License (bảo lưu bản quyền và thông tin tác giả gốc)

Kho mã nguồn tích hợp bộ công cụ phát livestream tương tác TikTok dọc 9:16 (1080×1920) trên Windows, hỗ trợ chạy trên OBS Studio và TikTok LIVE Studio. Dự án gồm 2 chế độ chính:

1. **TikTok LIVE Arcade (Mới — v1.1):** Trò chơi mô phỏng 3D kết hợp video nền máy nghiền và vật lý con lắc Three.js thời gian thực (điện thoại treo dây, dao chém, độ sờn dây, rơi nghiền).
2. **Chánh Điện Tịnh Tâm (Gốc):** Chánh điện online 2.5D tâm linh với bồ đoàn, tụng kinh, chuông, mõ, và giọng đọc hồi hướng tiếng Việt.

---

## 🎮 HƯỚNG DẪN DÀNH CHO NGƯỜI DÙNG MỚI (TIKTOK LIVE ARCADE 3D)

Bạn **không cần biết lập trình** để cài đặt và trải nghiệm! Chỉ cần làm theo 3 bước cực kỳ đơn giản sau:

### Bước 1: Khởi động máy chủ (Local Server)
1. Tải và cài đặt **Node.js** (phiên bản 20 trở lên) tại [nodejs.org](https://nodejs.org/).
2. Mở cửa sổ dòng lệnh (Terminal / PowerShell / Command Prompt) tại thư mục dự án và chạy:
   ```bash
   cd live
   npm install
   npm start
   ```
3. Màn hình Terminal sẽ hiển thị đường dẫn truy cập kèm mã bảo mật:
   ```text
   ======================================================
   🚀 TIKTOK LIVE ARCADE SERVER v1.1
   📍 Lắng nghe: http://127.0.0.1:3000
   🔑 BOOTSTRAP ADMIN URL (Dùng 1 lần):
      http://127.0.0.1:3000/live/control.html?token=xxxxxxxxxxxx
   🎬 OVERLAY 9:16 URL:
      http://127.0.0.1:3000/live/overlay.html
   ======================================================
   ```

### Bước 2: Xem và điều khiển trực tiếp trên trình duyệt
1. Nhấp chuột vào liên kết **Overlay 9:16**: [http://127.0.0.1:3000/live/overlay.html](http://127.0.0.1:3000/live/overlay.html).
2. Màn hình dọc 9:16 sẽ hiển thị:
   - **Video nền (Lớp 1 - Cleanplate Loop):** Cỗ máy nghiền công nghiệp quay răng cưa liên tục không ngắt quãng.
   - **Không gian 3D (Lớp 2 - Three.js WebGL):** Khung xà kim loại, sợi dây treo 24 đốt, mô hình điện thoại iPhone đung đưa nhịp nhàng theo phương trình vật lý, cụm bánh răng máy nghiền 3D, và hai lưỡi dao công nghiệp hai bên.
   - **Giao diện HUD (Lớp 3 - Trên cùng):** Thanh đo độ sờn dây (`ROPE WEAR`), nhãn cảnh báo mô phỏng, bảng thông số kỹ thuật (góc $\theta$, vận tốc $\omega$, FPS, độ trôi frame).
3. Thử nghiệm tức thì bằng các **nút bấm ở đáy màn hình** hoặc dùng **phím tắt trên bàn phím**:
   - Phím **`1`** hoặc bấm **Touch Trái**: Dao bên trái lao vào chém dây, phát tia lửa, truyền xung lực làm dây đung đưa mạnh hơn, tăng độ sờn dây thêm 2%.
   - Phím **`2`** hoặc bấm **Touch Phải**: Dao bên phải lao vào chém dây.
   - Phím **`3`** hoặc bấm **Miss**: Dao đánh hụt (dừng cách dây 22cm), không gây tác động lực, không tăng độ sờn dây.
   - Phím **`4`** hoặc bấm **Double Hit**: Chém kép liên tiếp hai bên khi dây đang dao động hồi phục.
   - Phím **`R`** hoặc bấm **Reset**: Khôi phục lại trạng thái ban đầu.
   - Phím **`D`**: Bật hoặc tắt bảng thông số kỹ thuật (telemetry).

### Bước 3: Đưa lên OBS Studio hoặc TikTok LIVE Studio
1. Mở phần mềm **OBS Studio** hoặc **TikTok LIVE Studio**.
2. Thêm nguồn mới (Add Source) → chọn **Browser Source** (Trình duyệt).
3. Nhập các thông số sau:
   - **URL:** `http://127.0.0.1:3000/live/overlay.html`
   - **Width (Chiều rộng):** `1080`
   - **Height (Chiều cao):** `1920`
4. Mở đường dẫn **BOOTSTRAP ADMIN URL** in ra ở Terminal để mở Bảng điều khiển [control.html](http://127.0.0.1:3000/live/control.html).
5. Khi phát LIVE thực tế trên TikTok: nhập `@username` kênh của bạn vào ô kết nối và bấm **Kết nối** để hệ thống tự động nhận diện quà tặng thật từ người xem.

---

## 📸 MINH CHỨNG HOẠT ĐỘNG THỰC TẾ (DEMO & SCREENSHOTS)

Hệ thống đã được kiểm chứng hoạt động hoàn hảo trên trình duyệt Chromium thực tế:

- **Ảnh chụp màn hình 9:16:**
  - `Docs/screenshots/overlay_idle_916.png`: Trạng thái chờ, dây và điện thoại đung đưa mượt mà trên nền video máy nghiền.
  - `Docs/screenshots/overlay_touch_contact.png`: Thời điểm dao chạm dây (contact marker 800ms) có hiệu ứng lóe sáng và cộng dồn xung lực.
  - `Docs/screenshots/overlay_swing_recovering.png`: Điện thoại đung đưa với biên độ rộng và tự động tắt dần (damped oscillation) êm ái về vị trí cân bằng.
- **Video clip quay thực tế màn hình (540×960 @ 30fps):**
  - Xem tệp video: `Docs/demo_p0b_arcade.mp4` (hoặc bản WebM: `Docs/demo_p0b_arcade.webm`).

---

## ⛩️ CHÁNH ĐIỆN TỊNH TÂM (CHẾ ĐỘ 2.5D GỐC)

Chánh điện online 2.5D cho TikTok LIVE. Mỗi người xem bình luận là bước vào chánh điện, ngồi xuống bồ đoàn tụng kinh. Ai tặng quà sẽ được xướng tên hồi hướng bằng giọng đọc tiếng Việt. Có nhạc thiền, chuông, mõ và đọc kinh định kỳ.

Mã nguồn chia sẻ miễn phí (MIT). Có hai phần:

| Thư mục | Là gì |
|---|---|
| `index.html`, `assets/` | Bản web tĩnh cho mọi người tự vào ngồi tụng (đăng lên Cloudflare Pages) |
| `live/` | Bộ công cụ phát LIVE: server Node, overlay 9:16, bảng điều khiển |

### Người xem làm được gì (Chế độ Chánh Điện)

- **Bình luận bất kỳ**: được vào ngồi (tối đa 100 chỗ, chỗ ngồi tự mở rộng 24 → 36 → 64 → 100). Đầy chỗ thì người im lặng lâu nhất mà chưa tặng quà sẽ nhường chỗ.
- **Bình luận đúng một từ** `nam`, `nữ`, `sư`, `ni`, `tiểu`, `bà`, `cao tăng`: đổi hình nhân vật. Câu "Nam mô A Di Đà Phật" không bị hiểu nhầm thành "nam".
- **Tặng quà**: banner xướng tên, giọng đọc hồi hướng (lấy lời nguyện từ bình luận gần nhất của người đó nếu có), hiệu ứng theo giá trị quà, cộng điểm vào bảng Công Đức.
- **Thả tim**: tim bay trên đầu nhân vật.

---

## 🛡️ BẢO MẬT VÀ AN TOÀN

Dự án được thiết kế với tiêu chuẩn bảo mật nghiêm ngặt:

- **Không dùng tài khoản hay mật khẩu TikTok:** Server chỉ đọc sự kiện công khai của phòng live theo username. Không can thiệp tài khoản cá nhân.
- **Ràng buộc địa chỉ cục bộ (Localhost Only):** Server chỉ lắng nghe tại `127.0.0.1`, không mở ra mạng ngoài.
- **Xác thực Admin bằng Token RAM dùng 1 lần (SEC-03):** Khi server khởi động, sinh token ngẫu nhiên 256-bit in ra Terminal. Trình duyệt mở link sẽ được cấp Cookie `HttpOnly; SameSite=Strict` và tự động chuyển hướng 303 xóa token trên thanh địa chỉ.
- **Chặn giả mạo WebSocket (SEC-02):** Kết nối WebSocket bảng điều khiển bắt buộc phải có Cookie phiên hợp lệ, từ chối tham số query tự khai `?role=control`.
- **Danh sách trắng tệp tĩnh (SEC-01):** Chỉ phục vụ các tệp công khai trong `/live/public/` và `/assets/`. Chặn triệt để mã nguồn máy chủ `/live/server.mjs`, cấu hình `package.json` và mọi đường dẫn duyệt thư mục bất hợp pháp (`../`).

---

## 📜 MIỄN TRỪ TRÁCH NHIỆM

Dự án được chia sẻ **miễn phí, với mục đích học tập và tham khảo lập trình**. Phần mềm được cung cấp "nguyên trạng" (AS IS), không kèm bất kỳ bảo đảm nào, rõ ràng hay ngụ ý.

Khi tải về, sử dụng, chỉnh sửa hoặc phân phối lại mã nguồn này, **bạn tự chịu hoàn toàn trách nhiệm** về:
- Mọi nội dung bạn phát trên livestream hoặc đăng tải.
- Việc nhận quà, donation hoặc bất kỳ khoản thu nào từ người xem.
- Việc tuân thủ điều khoản sử dụng của TikTok và pháp luật hiện hành.
- Mọi máy móc, dao, điện thoại và máy nghiền trong game đều là **MÔ PHỎNG ẢO 3D**, không có thiết bị thật hay iPhone thật nào bị phá hủy.

Tác giả **không liên quan, không bảo trợ và không chịu trách nhiệm** đối với bất kỳ kênh, tài khoản, sản phẩm hay hoạt động nào sử dụng mã nguồn này.

---

## 💖 ỦNG HỘ TÁC GIẢ GỐC

Dự án chia sẻ miễn phí. Nếu thấy hữu ích và muốn ủng hộ tác giả gốc Kent Juno duy trì và phát triển:

| | |
|---|---|
| Ngân hàng | **MB Bank** |
| Số tài khoản | **999979798886** |
| Chủ tài khoản | **HUYNH HUU NHAN** |

---

## 📄 GIẤY PHÉP

Dự án phát hành theo giấy phép **MIT License**. Xem chi tiết tại tệp `LICENSE`.
