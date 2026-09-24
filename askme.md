# Questions

## Q1
Vấn đề:
Requirement chỉ định artwork ở `Asset/_final`, nhưng project không có đường dẫn này. Bộ ảnh hoàn thiện thực tế nằm tại `Raw Asset/Assets/_created` và có đủ 40 Tier 1, 30 Tier 2, 20 Tier 3, 10 Noble.

Thông tin hiện có:
`card_data.csv`, `nobles_data.csv` và `validation_report.txt` đều nằm cạnh bộ ảnh hoàn thiện; ID và số lượng khớp 1–1.

Các phương án:
- Dùng trực tiếp `Raw Asset/Assets/_created` qua HTTP static route.
- Sao chép 100 ảnh sang một thư mục `Asset/_final` mới.

Đề xuất mặc định:
Dùng trực tiếp `Raw Asset/Assets/_created`, không duplicate và không chỉnh sửa asset gốc. Mapping HTTP được đặt tập trung để sau này đổi đường dẫn dễ dàng.

## Q2
Vấn đề:
`Gamerule.txt` dùng tên Gold cho Joker của Splendor, trong khi card metadata/custom theme dùng Gold như một trong năm màu thường, bên cạnh Quartz, Diamond, Emerald và Netherite.

Thông tin hiện có:
CSV hoàn thiện dùng năm bonus/cost `quartz`, `diamond`, `emerald`, `gold`, `netherite`. Requirement mục 26 yêu cầu giữ năm resource custom và tách Joker thành resource riêng.

Các phương án:
- Dùng tên kỹ thuật `joker` cho token hoang dã và giữ `gold` là màu thường của custom deck.
- Đổi màu thường Gold sang Ruby để tên giống `Gamerule.txt`.

Đề xuất mặc định:
Dùng `joker` cho token hoang dã và `gold` cho màu thường. Logic Joker vẫn tuân thủ hoàn toàn luật Gold/Joker trong `Gamerule.txt`; đây chỉ là đổi tên để tránh xung đột dữ liệu.

## Q3
Vấn đề:
Requirement nói chưa có artwork token và yêu cầu token tạm CSS/SVG, nhưng project có năm ảnh vật liệu trong `Raw Asset/Assets đá`.

Thông tin hiện có:
Không có ảnh Joker riêng và requirement yêu cầu một `<ResourceToken />` dễ thay asset sau này.

Các phương án:
- Dùng ngay năm ảnh vật liệu hiện có và tạo CSS cho Joker.
- Dùng CSS cho cả sáu token ở phiên bản đầu.

Đề xuất mặc định:
Dùng CSS cho cả sáu token theo đúng requirement. Mapping asset được gom tại một file; có thể chuyển sang PNG/WebP về sau mà không sửa các component gameplay.

## Q4
Vấn đề:
Đã chọn kiến trúc Supabase + Vercel nhưng workspace chưa có Supabase project URL/key và chưa có Vercel project/account để chạy migration hoặc deploy thật.

Thông tin hiện có:
Code production transport, Vercel Function, optimistic locking, Realtime signal và SQL migration đã được chuẩn bị. Local development vẫn dùng Socket.IO nếu không khai báo biến Supabase.

Các phương án:
- User tạo Supabase project, chạy `supabase/migrations/001_rooms.sql`, rồi đặt 4 environment variables trong Vercel.
- Cung cấp project đã có để cấu hình và deploy vào đó.

Đề xuất mặc định:
Không ghi bất kỳ secret nào vào repo. Chờ user tạo/kết nối Supabase và Vercel; sau đó dùng `SUPABASE_SERVICE_ROLE_KEY` chỉ ở server, còn frontend chỉ nhận anon key công khai.

## Q5 — Bố cục bàn chơi compact theo ảnh tham chiếu

Vấn đề:
Ảnh tham chiếu dùng bố cục bàn vật lý rất gọn: ba hàng Tier nằm giữa, deck ở đầu mỗi hàng, ngân hàng token và Noble nằm thành cột bên phải, thông tin người chơi nằm sát cạnh dưới. Giao diện hiện tại vẫn chia nhiều panel lớn nên chiếm nhiều chiều cao.

Các điểm cần xác nhận:
- Có chuyển Noble từ hàng ngang phía trên sang cột dọc bên phải, cạnh Resource Bank, giống ảnh tham chiếu không?
- Trên desktop có ưu tiên thấy trọn toàn bộ board trong một màn hình 1920×1080/1440×900, chấp nhận card nhỏ hơn nhưng vẫn mở ảnh lớn khi click không?
- Nút kết thúc lượt trong ảnh tham chiếu không phù hợp engine hiện tại vì mỗi action hợp lệ tự kết thúc lượt; có cần thêm nút chỉ để trang trí/điều khiển không?
- Panel đối thủ và My Board nên thu thành thanh ngang compact, hay giữ phần chi tiết luôn mở?

Đề xuất mặc định để triển khai:
- Dùng bố cục compact: `Tiers | Bank + Nobles`, Noble xếp dọc bên phải.
- Card giữ nguyên ảnh vuông và `object-fit: contain`, tuyệt đối không crop; kích thước tự co để cả ba Tier nằm gọn hơn.
- Không thêm nút End Turn vì sẽ làm sai luồng server-authoritative hiện tại.
- Đối thủ và My Board dùng thanh compact; token, bonus và reserved card vẫn hiển thị đủ thông tin công khai.
- Trên màn hình hẹp, board chuyển thành cuộn ngang có chủ đích thay vì bóp méo/crop card.
