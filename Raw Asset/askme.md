# Questions

## Q1
Vấn đề:
Các thư mục có đúng số lượng artwork cho từng nhóm (40 Tier 1, 30 Tier 2, 20 Tier 3, 10 Nobles), nhưng một phần tên file có số thứ tự còn một phần chỉ có tên nhân vật. Không có metadata chỉ định artwork nào đi với card gameplay nào trong cùng tier.

Các lựa chọn / thông tin hiện có:
- Giữ tier theo thư mục nguồn.
- Trong từng tier, sắp xếp tên file theo natural/alphabetical order rồi map tuần tự với dataset Splendor chuẩn của tier đó.
- Không duplicate và không bỏ artwork nào.

Đề xuất mặc định nếu cần:
Đã dùng natural/alphabetical order để tạo mapping deterministic và tiếp tục workflow, vì artwork không mang thông tin gameplay và số lượng khớp chính xác 1-to-1.

Cập nhật theo yêu cầu Card_create_2:
Đã xác nhận tên nhân vật luôn lấy từ filename; phần số thứ tự/prefix số được bỏ qua. Số chỉ dùng để giữ mapping và tên file output, không được hiển thị trong character name. Ví dụ `065_Echidna.png` hiển thị `ECHIDNA`.

## Q2
Vấn đề:
Brief yêu cầu font serif hoặc clean display nhưng không chỉ định font cụ thể.

Các lựa chọn / thông tin hiện có:
- Georgia Bold có sẵn trên Windows và dễ đọc ở kích thước thẻ.
- Cambria Bold cũng có sẵn.

Đề xuất mặc định nếu cần:
Đã dùng Georgia Bold, với viền/shadow tối nhẹ để giữ độ đọc trên artwork sáng hoặc tối.

Cập nhật theo yêu cầu Card_create_2:
Georgia Bold không còn dùng cho UI mới. Toàn bộ số và tên được chuyển sang pixel glyph style.

## Q3
Vấn đề:
Project không có file `.ttf` hoặc `.otf` chứa font Minecraft/pixel/block để dùng cho visual mới.

Các lựa chọn / thông tin hiện có:
- Không có font phù hợp trong project.
- Brief không cho tự tải font lạ.
- Pillow có thể render một bộ glyph pixel 5x7 nội bộ bằng các khối vuông, đủ cho chữ cái Latin, chữ số và dấu câu cần dùng.

Đề xuất mặc định nếu cần:
Đã dùng renderer glyph pixel 5x7 nội bộ cho prestige, cost, Noble requirement và character name. Tên có dấu được chuẩn hóa về Latin ASCII khi font pixel không có glyph tương ứng (ví dụ `MILIZÉ` hiển thị `MILIZE`). Không tải hoặc thêm font ngoài.

## Q4
Vấn đề:
`Cover_create.txt` mô tả bốn loại khung và có điều kiện “nếu là một ảnh showcase”, nhưng không chỉ định chỉ tạo showcase hay áp dụng vào deck hiện có.

Các lựa chọn / thông tin hiện có:
- Bộ deck hiện có đã phân rõ Tier 1, Tier 2, Tier 3 và Noble.
- Khung có mapping rõ ràng: gỗ / bạc / vàng / kim cương.
- Không có yêu cầu thay đổi gameplay hoặc artwork.

Đề xuất mặc định nếu cần:
Áp dụng khung tương ứng cho toàn bộ 100 card, đồng thời tạo preview/showcase dùng cùng artwork Echidna để so sánh bốn chất liệu. Không thêm label loại thẻ vì label là tùy chọn và UI hiện tại đã đủ rõ.

Cập nhật theo reference của user:
Khung được chỉnh theo hướng ornament rõ và dày hơn: Noble có crystal facet + filigree sáng, Tier 3 có gold scrollwork hoàng gia, Tier 2 có bạc chạm khắc, Tier 1 có gỗ chạm kèm lá/vine xanh. Label `NOBLE / TIER` chỉ xuất hiện trong ảnh showcase nếu cần, không đặt lên từng card gameplay.
