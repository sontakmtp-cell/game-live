# TikTok LIVE Arcade — Review fixes v1.1 (03/11/2026)

Nâng tài liệu v1.0 lên v1.1 theo review kỹ thuật; không thay mã nguồn ứng dụng, chưa chạy trên OBS/Blender/TikTok.

| Phát hiện | Khắc phục đã viết vào tài liệu | Kiểm chứng yêu cầu |
|---|---|---|
| Trục Blender +Z / Three.js +Y bị lẫn | Công thức con lắc X–Y, chuẩn hóa camera/anchor/contact points | PHYS-06 |
| Runtime seek WebM alpha không ổn định, contact chậm | Clip action đã trim phát từ t=0, first frame keyframe, marker 600–900ms **sau retime thực sự**; validator ffprobe | VIDEO-02, VIDEO-04 |
| Server commit khi không biết decode state | PREPARE → READY → ARM → precontact ACK/abort → single commit; late stall thành visual_fault | EVT-05, EVT-06, EVT-07, VIDEO-05 |
| `?role=control` không có auth | Local admin bootstrap token một lần → HttpOnly Strict cookie và redirect bỏ token; WS control kiểm cookie | SEC-02, SEC-03 |
| Camera config chỉ có file authoring bên ngoài public | Manifest inline camera chuẩn Three.js; path Blender chỉ metadata authoring | ASSET-01 |

**Lưu ý quan trọng:** ACK precontact chỉ là readiness gate và không bảo đảm các frame tương lai không trễ. Khi lỗi sau commit, tuyệt đối không tự rollback wear/impulse; dùng fallback visual và ghi `visual_fault`. Ngưỡng 100/150/300ms là đề xuất ban đầu phải đo bằng OBS thực tế.

**Tình trạng:** Đây là tài liệu sẵn sàng giao cho AI agent; các gate QA chưa có kết quả thực nghiệm.
