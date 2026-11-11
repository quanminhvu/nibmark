# Danh sách feature của Inkdrop — checklist đối chiếu cho Nibmark

> Nguồn: inkdrop.app (trang chủ, /features), docs.inkdrop.app (index, FAQ). Thu thập ngày 2026-11-10.
> Chưa đọc: developers.inkdrop.app (chi tiết API, Local HTTP server), release notes trên forum.
>
> Cách dùng: đánh `[x]` khi Nibmark đã hoàn thành feature tương ứng. Có thể ghi chú thêm sau mỗi dòng, ví dụ `— đang làm`, `— bỏ qua`, `— làm khác`.

## Tiến độ tổng

| Nhóm | Số feature | Đã xong |
|---|---|---|
| 1. Editor | 20 | 16 |
| 2. Preview / Rendering | 8 | 4 |
| 3. Tổ chức ghi chú | 14 | 11 |
| 4. Tìm kiếm & điều hướng | 6 | 4 |
| 5. Template | 4 | 3 |
| 6. AI & Agent | 7 | 1 |
| 7. Sync, bảo mật, backup | 10 | 3 |
| 8. Nhập, thu thập, chia sẻ | 9 | 2 |
| 9. Phím tắt & tùy biến | 5 | 2 |
| 10. Theme | 4 | 4 |
| 11. Plugin & developer | 6 | 0 |
| 12. Desktop | 5 | 0 |
| 13. Mobile | 9 | 0 |
| 14. Tài khoản & thanh toán | 8 | 0 |
| **Tổng** | **115** | **50** |

---

## 1. Editor (CodeMirror 6, Markdown thuần, không WYSIWYG)

- [x] GitHub Flavored Markdown: bảng (căn cột), task list, gạch ngang, footnote, sub/superscript, comment HTML ẩn
- [x] 3 chế độ xem: chỉ editor / chỉ preview (Cmd+E) / song song (Cmd+P)
- [x] Distraction Free Mode (Cmd+Shift+D)
- [x] Thanh công cụ nổi khi bôi đen (bold, italic, inline code, link, heading, list, task list, GitHub alert, highlight) — chưa có nút GitHub alert
- [x] Slash command (`/`) trên dòng trống: heading, list, task list, code block, quote, hr, ảnh, alert, note link
- [x] Phím tắt định dạng (Cmd+B, Cmd+I); dán URL lên chữ đang chọn thì tạo thành link
- [x] Gợi ý ngôn ngữ cho code block khi gõ ```
- [x] Autocomplete emoji (`:` + 2 ký tự)
- [x] GitHub alerts (`[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`) có highlight và autocomplete — preview + slash command; chưa tô màu riêng trong editor
- [x] Liên kết ghi chú bằng `[[`: tìm ghi chú, chèn link kèm preview, tạo ghi chú mới nếu chưa có
- [x] Reading highlight (bọc `<mark>`) — qua thanh công cụ nổi
- [ ] Dán link thông minh: chọn định dạng link, tự lấy tiêu đề trang ở nền
- [x] Ảnh: dán/kéo thả thành attachment; cú pháp kích thước `![w:320 h:240](...)`; thanh resize (Auto/Small/Half/Full) — dán/kéo thả ảnh và mọi loại file; chưa có cú pháp kích thước và thanh resize
- [x] Tự thụt lề list (Tab/Shift+Tab), tự đánh lại số thứ tự, màu marker cho list lồng nhau
- [x] Thanh công cụ chỉnh bảng: format, căn cột, thêm/xóa/di chuyển hàng và cột
- [ ] 3 chế độ ngắt dòng: wrap tất cả / chỉ văn bản / Unwrap at Cursor (mặc định)
- [x] Đa con trỏ, chọn vùng chữ nhật
- [x] Hơn 30 lệnh soạn thảo (duplicate, move, join, sort line, đổi hoa/thường, nhảy theo subword, mở rộng vùng chọn theo cú pháp, chọn mọi vị trí trùng, toggle comment), phím mặc định giống Zed — lệnh có sẵn của CodeMirror + sắp xếp/nối dòng/đổi hoa thường trong palette
- [ ] Header editor: back/forward, nút chế độ xem, outline, distraction-free, menu hành động (Cmd+J)
- [ ] Nút copy code block, tooltip link, spellcheck của OS, bật/tắt số dòng, giới hạn độ rộng dòng, gạch ngang to-do đã check

## 2. Preview / Rendering

- [ ] Tô màu cú pháp cho hơn 100 ngôn ngữ, icon ngôn ngữ, số dòng, header tên file, nút copy — một phần: preview khoảng 40 ngôn ngữ, có nút copy, chưa có số dòng và tên file
- [ ] Block ```markdown được highlight GFM đầy đủ
- [x] Mermaid: zoom, pan, xem toàn màn hình, theme sáng/tối qua CSS variables
- [x] KaTeX inline + block, đánh số phương trình
- [x] Ô màu cho mã hex / rgb() / hsl() trong backtick
- [ ] Nhúng code từ GitHub qua link có dải dòng; kết nối GitHub để dùng repo private và hiện tiêu đề phong phú (repo, issue, PR, commit)
- [ ] Tìm kiếm trong preview (kể cả trong code block)
- [x] Trình xem ảnh (double-click) — bấm một lần để xem ảnh lớn

## 3. Tổ chức ghi chú

- [x] Notebook lồng nhau không giới hạn cấp, hiện số ghi chú, có notebook mặc định
- [x] Thu gọn notebook thì list ghi chú gồm cả notebook con
- [ ] Workspace view: thu sidebar vào một nhánh notebook (status/tag riêng)
- [x] Icon cho notebook (hơn 1.500 icon Lucide), có sync
- [x] Sắp xếp notebook bằng kéo thả, có sync
- [x] Tag không giới hạn, gợi ý khi gõ, cho phép emoji
- [x] Status: Active / On Hold / Completed / Dropped, có lọc
- [x] Ghim ghi chú lên đầu
- [x] Thao tác hàng loạt: di chuyển, gắn tag, đổi status, xóa nhiều ghi chú
- [x] Nhân bản ghi chú (Cmd+D) — có trong menu, chưa có phím tắt
- [x] Thùng rác: khôi phục / xóa vĩnh viễn
- [x] Lịch sử phiên bản: lưu khi ngừng gõ, xem diff, khôi phục, hoàn tác khôi phục
- [ ] Tự gộp xung đột giữa thiết bị (title, notebook, status, tag); chỉ tạo bản sao khi sửa trùng dòng
- [ ] Thống kê hoạt động 52 tuần (ghi chú tạo mới, task, streak hiện tại và dài nhất)

## 4. Tìm kiếm & điều hướng

- [x] Full-text search với bộ lọc `book:`, `tag:`, `status:`, `title:`, `body:`, `"cụm từ"`, `-loại trừ`, highlight kết quả
- [x] Command palette "Telescope" (Cmd+K): fuzzy search lệnh, notebook, tag, theme, heading và to-do; plugin thêm được nguồn — có lệnh, ghi chú, notebook, tag, theme, heading; chưa có to-do và nguồn từ plugin
- [x] Outline / mục lục ghi chú — qua command palette (gõ `:`)
- [x] Back/forward (phím, nút chuột phụ, vuốt trackpad) — chưa có vuốt trackpad
- [ ] Fuzzy matching ở menu notebook, menu tag, ô nhập tag
- [ ] Mở ghi chú mới trong cửa sổ riêng (Cmd+Shift+N)

## 5. Template

- [x] Chọn template (Cmd+T) có tìm kiếm và preview — có tìm kiếm, chưa có xem trước
- [x] Template chính thức theo nhóm: Debugging, Planning, Brainstorming, Learning, Productivity — 5 template có sẵn
- [x] Template tự tạo với cú pháp an toàn (không chạy code); đặt sẵn title (placeholder ngày), mô tả, tag, notebook, status — chưa đặt sẵn notebook
- [ ] Block `!Instructions` hướng dẫn AI agent, tự bị loại khỏi ghi chú tạo ra

## 6. AI & Agent (tự mang API key)

- [ ] Cấu hình provider: Anthropic / OpenAI-compatible / Ollama; key lưu trong keychain OS; một công tắc tắt toàn bộ AI
- [ ] Trợ lý AI inline: preset sửa lỗi, tóm tắt, định dạng lại, chuyển thành bảng/list, tạo Mermaid, prompt tùy chỉnh
- [ ] Next Edit Suggestions (ghost text dựa trên ghi chú liên kết và backlink; Tab để chấp nhận, Esc để bỏ qua)
- [ ] MCP server: tìm, đọc, tạo, sửa ghi chú, notebook, tag, attachment; giữ con trỏ và undo khi agent sửa
- [ ] Agent Skills
- [ ] Kéo ghi chú/notebook vào terminal hoặc editor để dán link `inkdrop://note/...`
- [x] Copy ID của Note / Notebook / Tag từ context menu

## 7. Sync, bảo mật, backup

- [ ] Sync mã hóa đầu cuối (AES-256-GCM trên thiết bị) cho note, notebook, tag, attachment; truyền qua TLS
- [ ] Hoạt động offline, tự sync khi có mạng lại, không cần cấu hình
- [ ] Chọn kiểu sync: server chính thức / tự host CouchDB / không sync (offline mode)
- [ ] Tài liệu hướng dẫn tự host sync server
- [ ] 2FA (TOTP) + mã khôi phục dùng một lần
- [ ] Mô hình không giữ khóa: server không bao giờ có khóa mã hóa ở dạng chưa mã hóa
- [x] Backup liên tục ra thư mục (JSON), khôi phục từ Preferences
- [x] Export ghi chú / notebook / toàn bộ ra Markdown hoặc HTML — Markdown xong, chưa có HTML
- [x] Thư mục user data (config, keymap, stylesheet, plugin, DB cục bộ) mở được từ Preferences
- [ ] Hỗ trợ proxy công ty (proxy có xác thực, chứng chỉ tự ký) + công cụ chẩn đoán mạng

## 8. Nhập, thu thập, chia sẻ

- [x] Import từ Evernote, Apple Notes, Notion, Bear, Markdown (file và thư mục), HTML; thư mục con thành notebook con; kèm ảnh — có Evernote, Notion, Bear, Obsidian, Markdown, HTML; chưa có Apple Notes
- [x] Import Markdown/HTML vào một notebook qua context menu
- [ ] Web Clipper (extension Chrome, Firefox): lưu bài viết hoặc vùng chọn thành Markdown
- [ ] Share sheet trên mobile (iOS, Android): web clip, chèn link, copy link Markdown
- [ ] Import highlight từ Kindle (lần sau chỉ lấy highlight mới)
- [ ] Chia sẻ ghi chú qua link công khai
- [ ] Tích hợp Alfred
- [ ] Tích hợp Raycast
- [ ] Local HTTP server cho script, tự động hóa, agent

## 9. Phím tắt & tùy biến

- [ ] Keymap tùy chỉnh theo ngữ cảnh (editor, note list, toàn app), hỗ trợ chuỗi nhiều phím
- [x] Phím tắt toàn cục: ẩn/hiện cửa sổ, quick note khi app chạy nền — có quick note, chưa có ẩn/hiện cửa sổ
- [ ] Vim keybinding (cả relative line number)
- [ ] Sublime Text keymap
- [x] `init.js` (script khởi động qua API) và `styles.css` (CSS tùy chỉnh) — mới có styles.css, chưa có init.js

## 10. Theme

- [x] Theme dựng trên CSS variables cho UI, editor, preview
- [x] Tự đổi sáng/tối theo OS
- [x] Xem trước theme trực tiếp trong Preferences — ô xem trước trong Preferences, xem thử trực tiếp trong command palette
- [x] Bộ theme chính thức (kiểu Kanagawa, Solarized, Nord) + theme cộng đồng — Paper, Stone, Ink, Indigo + thư mục theme tự viết

## 11. Plugin & developer

- [ ] Hệ thống plugin + thư mục plugin (Inkdrop có hơn 100 plugin; Mermaid, math, emoji cũng là plugin dựng sẵn)
- [ ] Các plugin tiêu biểu: outline, code folding, nhúng YouTube, note tabs, code runner, đồ thị liên kết, trình chiếu (Marp)
- [ ] CLI quản lý plugin (search, install, update, publish, scaffold bằng `init`)
- [ ] Plugin API có type TypeScript
- [ ] Tài liệu developer
- [ ] Live Export: dùng app như CMS, publish ra static site (template Astro)

## 12. Desktop

- [ ] macOS 12+ (Apple Silicon và Intel)
- [ ] Windows 10+ (x64, ARM64)
- [ ] Linux (AppImage, deb, zip, Snap, Flathub); Homebrew cho macOS
- [ ] System tray mode (Windows, Linux), giữ Local HTTP API chạy
- [ ] Index SQLite hiệu năng cao (mốc Inkdrop: 50.000 ghi chú, lưu dưới 2 ms, tìm khoảng 20 ms)

## 13. Mobile

- [ ] iOS 17.5+
- [ ] Android 14+
- [ ] Dùng chung editor và renderer với desktop (code block có theme, Mermaid, math)
- [ ] Slash command và note link `[[` trên mobile; preview note picker trên iPad
- [ ] Thanh công cụ soạn thảo (mở link, highlight, slash command, chỉnh bảng)
- [ ] Bàn phím cứng: phím tắt desktop, Vim, đa con trỏ
- [ ] Đồng bộ template, icon notebook, thứ tự notebook với desktop
- [ ] Duyệt, xem trước, cài theme trên mobile (chạy offline, tự cập nhật)
- [ ] Nhanh với thư viện lớn: mở vào ghi chú gần nhất, vẫn mượt khi sync lần đầu

## 14. Tài khoản & thanh toán (nếu thương mại hóa)

- [ ] Đăng ký / đăng nhập tài khoản
- [ ] Trial 30 ngày
- [ ] Gói tháng / năm (Inkdrop: $9.98/tháng, $99.80/năm, 30GB, ghi chú không giới hạn)
- [ ] Thanh toán thẻ (Stripe) + in-app subscription trên iOS
- [ ] Đổi gói tháng/năm có proration
- [ ] Retry khi thanh toán lỗi (Inkdrop: sau 3, 5, 7 ngày), rồi vô hiệu hóa tài khoản
- [ ] Tài khoản bị vô hiệu hóa: dữ liệu cục bộ chỉ đọc, kích hoạt lại được
- [ ] Xóa tài khoản vĩnh viễn (kể cả khi quên mật khẩu, qua email)

---

## Giới hạn của Inkdrop (cơ hội để Nibmark làm tốt hơn)

- Đính kèm **chỉ có ảnh**, không đính kèm được file bất kỳ
- Sync chỉ qua CouchDB (không có Dropbox, Google Drive, iCloud)
- Plugin chỉ chạy trên desktop; mobile chỉ có theme
- AI bắt buộc dùng key riêng
- Không khôi phục được mật khẩu
- Không có gói miễn phí, license trọn đời hay giảm giá cho sinh viên
- Không có WYSIWYG
