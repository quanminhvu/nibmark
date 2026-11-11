# Lộ trình phát triển Nibmark

Tài liệu này liệt kê những gì Nibmark **đã có** và **sẽ làm**, chia theo giai đoạn. Thứ tự trong mỗi giai đoạn chưa phải thứ tự làm, có thể đổi khi dùng thực tế.

Ký hiệu: `[x]` đã xong · `[ ]` chưa làm · *(một phần: …)* đã làm được một phần, ghi rõ phần còn thiếu.

## Tiến độ

| Giai đoạn | Số mục | Đã xong |
|---|---|---|
| 1. Ứng dụng desktop (đã phát hành tới 0.3) | 53 | 53 |
| 2. Hoàn thiện trải nghiệm (đang làm) | 31 | 25 |
| 3. Đồng bộ và bảo mật | 8 | 0 |
| 4. Mobile, plugin và AI | 20 | 0 |
| 5. Phát hành rộng và mô hình kinh doanh | 9 | 0 |
| **Tổng** | **121** | **78** |

---

## Giai đoạn 1 — Ứng dụng desktop

Đã có trong các bản 0.1 → 0.3.

### Soạn thảo

- [x] Markdown kiểu GitHub: bảng, task list, gạch ngang, footnote, chỉ số trên/dưới, comment HTML ẩn
- [x] Ba chế độ xem: chỉ editor, chỉ preview (⌘E), song song (⌘P)
- [x] Chế độ tập trung (⌘⇧D)
- [x] Thanh công cụ nổi khi bôi đen chữ
- [x] Slash command (`/`) ở đầu dòng trống: heading, danh sách, task, khối code, bảng, trích dẫn, đường kẻ, Mermaid, công thức, alert, link ghi chú, file
- [x] Phím tắt định dạng (⌘B, ⌘I); dán URL lên chữ đang chọn để tạo link
- [x] Gợi ý ngôn ngữ khi gõ ```
- [x] Gợi ý emoji khi gõ `:` và hai ký tự
- [x] Alert kiểu GitHub (`[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`) *(hiển thị trong preview, tô màu trong editor, chèn bằng slash command hoặc thanh công cụ)*
- [x] Liên kết giữa ghi chú bằng `[[`, tạo ghi chú mới nếu chưa có
- [x] Highlight đoạn chữ (`<mark>`) từ thanh công cụ
- [x] Dán hoặc kéo thả ảnh và mọi loại file vào ghi chú
- [x] Danh sách: thụt lề bằng Tab/⇧Tab, tự đánh lại số thứ tự
- [x] Thanh công cụ bảng: căn cột, thêm/xóa/di chuyển hàng và cột, căn lề
- [x] Đa con trỏ và chọn vùng chữ nhật
- [x] Lệnh soạn thảo: di chuyển, nhân đôi, xóa dòng, chọn mọi vị trí trùng, comment, sắp xếp, nối dòng, đổi hoa/thường

### Preview

- [x] Sơ đồ Mermaid, có xem toàn màn hình, phóng to và kéo
- [x] Công thức toán KaTeX (inline và khối), đánh số phương trình
- [x] Ô màu cạnh mã màu (`#hex`, `rgb()`, `hsl()`) trong code
- [x] Bấm ảnh để xem cỡ lớn
- [x] Nút copy trên khối code

### Tổ chức ghi chú

- [x] Notebook lồng nhau không giới hạn cấp, có đếm số ghi chú
- [x] Notebook đang thu gọn thì hiện cả ghi chú của notebook con
- [x] Icon cho notebook (hơn 2.000 icon)
- [x] Sắp thứ tự notebook bằng kéo thả
- [x] Tag (gợi ý khi gõ, dùng được emoji)
- [x] Trạng thái: Active, On Hold, Completed, Dropped, có lọc
- [x] Ghim ghi chú lên đầu
- [x] Thao tác hàng loạt: chuyển notebook, gắn tag, đổi trạng thái, ghim, xóa
- [x] Nhân bản ghi chú *(một phần: có trong menu, chưa có phím tắt)*
- [x] Thùng rác: khôi phục hoặc xóa vĩnh viễn
- [x] Lịch sử phiên bản: tự lưu khi ngừng gõ, xem khác biệt, khôi phục và hoàn tác

### Tìm kiếm và điều hướng

- [x] Tìm toàn văn với bộ lọc `book:`, `tag:`, `status:`, `title:`, `body:`, `"cụm từ"`, `-loại trừ`, tô sáng kết quả
- [x] Command palette (⌘K): ghi chú, lệnh, notebook, tag, theme, heading
- [x] Mục lục ghi chú (gõ `:` trong palette)
- [x] Back/forward giữa các ghi chú (phím tắt, nút chuột phụ)

### Template

- [x] Chọn template (⌘T) có tìm kiếm
- [x] Năm template có sẵn: Daily Log, Meeting Notes, Bug Report, Project Plan, Learning Notes
- [x] Template tự tạo với biến an toàn (`{{date}}`, `{{time}}`, `{{weekday}}`…), đặt sẵn tiêu đề, tag và trạng thái

### Dữ liệu

- [x] Lưu cục bộ, chạy hoàn toàn offline
- [x] Sao lưu liên tục ra thư mục (JSON và file gốc của đính kèm), không bao giờ xóa file trong bản sao lưu
- [x] Khôi phục từ thư mục sao lưu (chỉ gộp, không ghi đè ghi chú mới hơn)
- [x] Export ghi chú, notebook hoặc toàn bộ ra Markdown kèm thư mục `attachments/`
- [x] Import từ Markdown (Obsidian), Notion (cả file `.zip`), Bear, HTML và Evernote
- [x] Import vào một notebook có sẵn từ menu chuột phải
- [x] Mở thư mục dữ liệu từ Preferences
- [x] Copy link hoặc ID của ghi chú, notebook, tag

### Tùy biến

- [x] Bốn theme có sẵn (Paper, Stone, Ink, Indigo), tự đổi sáng/tối theo hệ điều hành
- [x] Theme tự viết bằng CSS và `styles.css` cá nhân
- [x] Xem trước theme trong Preferences và xem thử trực tiếp trong palette
- [x] Phím tắt toàn cục ghi nhanh (⌘⌥N), đổi được trong Preferences

### Nền tảng kỹ thuật

- [x] CI kiểm tra mọi thay đổi trên macOS, Windows và Linux, có smoke test chạy bản đóng gói
- [x] Workflow phát hành tự build bộ cài cho cả ba hệ điều hành khi gắn tag

---

## Giai đoạn 2 — Hoàn thiện trải nghiệm

Làm được ngay, không phụ thuộc đồng bộ.

### Giao diện

- [x] Giao diện bo tròn: sidebar trong mờ với nhóm thu gọn được, thẻ ghi chú có thanh tiến độ task, thanh công cụ và công tắc chế độ xem kiểu viên
- [x] Theme Mist (sáng) và Night (tối) làm mặc định khi theo hệ điều hành
- [x] Bảng Kanban: ghi chú có `view: kanban` hiện thành bảng, kéo thả thẻ giữa các cột, mọi thay đổi ghi lại vào Markdown

### Soạn thảo

- [x] Nút chèn alert trên thanh công cụ nổi; tô màu alert ngay trong editor
- [x] Dán link thông minh: chọn định dạng link, tự lấy tiêu đề trang
- [x] Cú pháp kích thước ảnh và thanh chỉnh kích thước (Tự động / Nhỏ / Nửa / Đầy)
- [x] Các chế độ ngắt dòng: ngắt tất cả, chỉ ngắt văn bản (giữ nguyên dòng của khối code và bảng), không ngắt
- [x] Menu hành động của ghi chú (⌘J)
- [x] Bật/tắt số dòng, giới hạn độ rộng dòng, bật/tắt kiểm tra chính tả, gạch ngang task đã xong
- [x] Phím tắt nhân bản ghi chú (⌘D ngoài editor)

### Preview

- [x] Tô màu cú pháp cho nhiều ngôn ngữ hơn, icon ngôn ngữ, số dòng và tên file trên khối code
- [x] Tô màu Markdown bên trong khối ```markdown
- [x] Tìm kiếm trong preview (kể cả trong khối code)
- [x] Nhúng đoạn code từ GitHub qua link có dải dòng

### Tổ chức và điều hướng

- [x] Thống kê hoạt động: ghi chú tạo mới và task theo 52 tuần, chuỗi ngày liên tục
- [x] Tìm mờ trong menu notebook, menu tag và ô nhập tag
- [x] Mở ghi chú trong cửa sổ riêng (⌘⇧N)
- [x] Task (to-do) trong command palette
- [x] Vuốt trackpad để back/forward
- [x] Xem trước template khi chọn; đặt sẵn notebook trong template

### Phím tắt

- [x] Phím tắt toàn cục ẩn/hiện cửa sổ
- [x] Kéo ghi chú vào terminal hoặc editor khác để dán link

### Dữ liệu

- [x] Export ra HTML
- [x] Import từ Apple Notes
- [x] Import highlight từ Kindle (lần sau chỉ lấy highlight mới)

### Desktop

- [ ] Bản Windows (x64, ARM64) *(một phần: CI đã build bộ cài, chưa thử trên máy thật)*
- [ ] Bản Linux *(một phần: CI đã build AppImage, chưa thử trên máy thật)*
- [ ] Bản macOS chip Intel *(một phần: CI đã build, chưa thử trên máy thật)*
- [ ] Chế độ chạy nền ở khay hệ thống (Windows, Linux) *(một phần: đã làm, chưa thử trên máy Windows/Linux thật)*
- [ ] Chỉ mục tìm kiếm SQLite cho thư viện rất lớn (hàng chục nghìn ghi chú)
- [ ] Hỗ trợ proxy công ty (có xác thực, chứng chỉ tự ký) và công cụ chẩn đoán mạng

### Tạm gác

Chưa làm trong giai đoạn này (không tính vào tiến độ), có thể xem lại sau:

- Workspace: thu sidebar vào một nhánh notebook
- Keymap tùy chỉnh theo ngữ cảnh, chuỗi nhiều phím; chế độ phím Vim và Sublime Text
- `init.js`: script chạy khi khởi động
- Local HTTP server cho script và công cụ tự động hóa; tích hợp Alfred và Raycast

---

## Giai đoạn 3 — Đồng bộ và bảo mật

- [ ] Đồng bộ qua CouchDB tự host, mã hóa đầu cuối (AES-256-GCM ngay trên thiết bị), truyền qua TLS
- [ ] Chạy offline, tự đồng bộ khi có mạng lại
- [ ] Chọn kiểu đồng bộ: server tự host, dịch vụ chính thức (nếu có), hoặc không đồng bộ
- [ ] Đồng bộ qua thư mục đám mây (iCloud Drive, Dropbox, Google Drive)
- [ ] Đồng bộ file đính kèm
- [ ] Tự gộp xung đột giữa các thiết bị (tiêu đề, notebook, trạng thái, tag); chỉ tạo bản sao khi cùng sửa một đoạn
- [ ] Server không bao giờ giữ khóa mã hóa ở dạng đọc được
- [ ] Tài liệu hướng dẫn tự host server đồng bộ

---

## Giai đoạn 4 — Mobile, plugin và AI

### Mobile

- [ ] App iOS và Android
- [ ] Dùng chung editor và preview với desktop (code có theme, Mermaid, công thức)
- [ ] Slash command, link `[[`, thanh công cụ soạn thảo trên mobile
- [ ] Bàn phím cứng trên iPad: phím tắt desktop, Vim, đa con trỏ
- [ ] Đồng bộ template, icon và thứ tự notebook với desktop
- [ ] Cài và xem trước theme trên mobile
- [ ] Mượt với thư viện lớn: mở vào ghi chú gần nhất, không đứng hình khi đồng bộ lần đầu
- [ ] Share sheet: lưu trang web, chèn link

### Plugin

- [ ] Hệ thống plugin và thư mục plugin, chạy được cả trên desktop lẫn mobile
- [ ] Plugin mẫu: mục lục bên cạnh, gập khối code, nhúng YouTube, tab ghi chú, chạy code, đồ thị liên kết, trình chiếu
- [ ] CLI tạo, cài, cập nhật và phát hành plugin
- [ ] Plugin API có kiểu TypeScript và tài liệu cho developer
- [ ] Xuất ghi chú thành website tĩnh (dùng Nibmark làm CMS)

### AI (tùy chọn, tắt được hoàn toàn)

- [ ] Cấu hình nhà cung cấp: Anthropic, OpenAI-compatible, mô hình chạy cục bộ (Ollama); key lưu trong keychain hệ điều hành
- [ ] Trợ lý AI trong editor: sửa lỗi, tóm tắt, định dạng lại, chuyển thành bảng/danh sách, vẽ Mermaid, prompt tùy chỉnh
- [ ] Gợi ý chỉnh sửa tiếp theo dựa trên ghi chú liên kết
- [ ] MCP server để Claude Code và các agent khác tìm, đọc, tạo, sửa ghi chú
- [ ] Hướng dẫn cho AI agent nằm trong template, tự bỏ khỏi ghi chú được tạo

### Thu thập

- [ ] Web Clipper (tiện ích Chrome, Firefox): lưu bài viết hoặc vùng chọn thành Markdown
- [ ] Chia sẻ ghi chú qua link công khai

---

## Giai đoạn 5 — Phát hành rộng và mô hình kinh doanh

### Phát hành

- [ ] Ký số và notarize bản macOS, ký số bản Windows
- [ ] Tự cập nhật phiên bản mới
- [ ] Phân phối qua Homebrew, Flathub, Snap

### Tài khoản và gói dịch vụ (nếu thương mại hóa)

- [ ] Đăng ký, đăng nhập tài khoản; xác thực hai lớp (TOTP) và mã khôi phục
- [ ] Dùng thử miễn phí
- [ ] Gói tháng / năm cho dịch vụ đồng bộ chính thức
- [ ] Thanh toán thẻ và mua trong app iOS; đổi gói có tính chênh lệch
- [ ] Xử lý thanh toán lỗi; tài khoản hết hạn vẫn đọc được dữ liệu cục bộ
- [ ] Xóa tài khoản vĩnh viễn

---

## Nguyên tắc và điểm khác biệt

- **Mã nguồn mở (MIT).** Ai cũng tự build và tự host được; dịch vụ trả phí (nếu có) chỉ là tiện ích thêm.
- **Dữ liệu của bạn trước hết.** Lưu cục bộ, sao lưu chỉ-thêm, export ra Markdown thuần bất cứ lúc nào.
- **Đính kèm mọi loại file,** không chỉ ảnh.
- **Nhiều lựa chọn đồng bộ:** server tự host hoặc thư mục đám mây, không bắt buộc một dịch vụ.
- **Plugin chạy được trên cả mobile.**
- **AI là tùy chọn,** dùng được với mô hình chạy cục bộ.
- **Tối giản kiểu Nhật** trong giao diện: ít màu, nhiều khoảng trống, tập trung vào chữ.
