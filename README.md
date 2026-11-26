# 💬 My Messenger

Xem lại lịch sử chat Messenger đã export, thống kê thói quen nhắn tin, và gộp nhiều lần export thành một kho lưu trữ duy nhất.

**→ [messenger.earth.io.vn](https://messenger.earth.io.vn)**

Không có backend. File zip được đọc và giải nén ngay trong tab trình duyệt, nội dung tin nhắn không rời khỏi máy bạn.

## Bài toán

Facebook chỉ cho tải về một phần lịch sử mỗi lần — thường vài tháng, và mỗi hội thoại bị cắt một kiểu khác nhau tuỳ khối lượng. Sau một năm bạn sẽ có một đống file zip chồng lấn nhau, không file nào đầy đủ.

App giải quyết bằng hai cơ chế, mỗi cái cho một mục đích:

| | Dùng khi | Kết quả |
|---|---|---|
| **Gộp zip** | Muốn một kho đầy đủ trên máy | Một file zip chứa toàn bộ lịch sử |
| **Đồng bộ Firestore** | Muốn số liệu hiển thị ở nơi khác | Thống kê tổng hợp, tự tích luỹ qua các lần sync |

## Tính năng

- Đọc trực tiếp file `.zip` export từ Messenger, kể cả file đặt mật khẩu
- Danh sách hội thoại, tìm theo tên
- Thống kê từng hội thoại: tin nhắn theo ngày/tuần/tháng, giờ cao điểm, reaction, streak, lọc theo từng người
- Xem lại chat giống giao diện Messenger, có lịch nhảy nhanh tới ngày bất kỳ
- **Gộp nhiều file export** thành một zip duy nhất, khử trùng lặp ảnh theo nội dung
- **Đồng bộ thống kê** lên Firestore cho website khác đọc

## Dữ liệu đi đâu

| Thứ gì | Ở đâu |
|---|---|
| Nội dung tin nhắn, ảnh, video | **Chỉ trong RAM của tab.** Tải lại trang là mất |
| Đường dẫn tới file zip bạn đã mở | IndexedDB, để lần sau mở lại bằng một click. Chỉ là *tay cầm*, không phải nội dung — trình duyệt vẫn hỏi quyền đọc lại |
| Số liệu thống kê | Firestore, **chỉ khi bạn chủ động bấm Sync** |

Những gì được đẩy lên Firestore: số đếm, phân bố theo ngày/giờ, reaction, tên hiển thị và danh sách người tham gia. **Không có một dòng nội dung tin nhắn nào, không có media.** Xem [`src/firebase/sync.js`](src/firebase/sync.js) để biết chính xác payload.

⚠️ Collection thống kê đang để **đọc công khai** ([`firestore.rules`](firestore.rules)) vì website Love Note cần đọc mà không đăng nhập. Nghĩa là tên hiển thị và các con số đọc được bởi bất kỳ ai biết project id — mà project id nằm sẵn trong bundle JS công khai. Đừng đẩy thứ gì nhạy cảm hơn lên đó.

## Cách dùng

1. Messenger → Cài đặt → Quyền riêng tư & an toàn → **Tải xuống thông tin của bạn** → chọn tin nhắn, định dạng JSON
2. Tải về được một file `.zip`
3. Mở app, kéo thả file vào. Có mật khẩu thì app sẽ hỏi
4. Từ lần thứ hai trở đi: dùng **Gộp file zip** để nhập file mới vào kho cũ

💡 Facebook cho chọn khoảng thời gian cụ thể, không bắt buộc phải lấy phần gần nhất. Muốn lấy lại lịch sử cũ thì request từng khoảng một.

## Gộp nhiều file export

Vào `/merge` hoặc bấm *"Có nhiều file zip? Gộp lại thành một"* ở màn hình chọn file. Thả vào bao nhiêu zip cũng được, không cần chỉ định file nào là chính.

Đầu ra là một zip **có cấu trúc y hệt bản export của Facebook**, nên app đọc nó như mọi file khác — không có định dạng riêng nào để phải bảo trì.

Hai chi tiết quyết định cách nó hoạt động:

**Tên file media không ổn định.** Facebook sinh lại tên sau mỗi lần export. Đo trên hai bản export thật: 546 file giống hệt nhau từng byte, **không file nào giữ nguyên tên**. Nên khử trùng lặp phải dựa vào **nội dung** (CRC32 + kích thước, đọc thẳng từ chỉ mục zip), và mọi `uri` trong tin nhắn phải được viết lại theo tên mới. Trên dữ liệu thật mức tiết kiệm là 36–59% tuỳ độ chồng lấn giữa các file — gộp 5 bản export bớt được 450 MB.

**Một cặp (thời điểm, người gửi) có thể lặp lại.** Gửi một loạt ảnh cùng lúc tạo nhiều tin cùng mili-giây. Khoá theo timestamp đơn thuần làm mất tin, nên khoá bao gồm cả nội dung, và các lần lặp được đánh số — tin lặp thứ N ở file này khớp với tin lặp thứ N ở file kia.

Ngoài ra: bản export mới thắng khi trùng (reaction có thể được thả thêm, tin có thể bị thu hồi); khoảng phủ tính theo span của từng file chứ không theo ngày-có-tin, vì một ngày im lặng không phải là lỗ hổng dữ liệu.

Toàn bộ kết quả được hiển thị để xem trước **trước khi ghi một byte nào** — phân tích không giải nén gì ngoài phần JSON nên chỉ mất chưa tới một giây kể cả với vài trăm MB.

> **Cần Chrome, Edge hoặc Arc trên máy tính** — tính năng này dùng File System Access API để ghi thẳng ra đĩa theo luồng, nhờ vậy không phải giữ cả file trong RAM.

> 💾 **Nên sao lưu file master.** Sau khi gộp, nó là nguồn chân lý duy nhất của bạn. Các file export gốc có thể xoá, nhưng chỉ sau khi đã mở thử file master và kiểm tra ảnh hiện được.

## Đồng bộ thống kê lên Firestore

Nút **Sync to Firestore** trong trang thống kê của mỗi hội thoại.

Vì mỗi lần export chỉ có một phần lịch sử, ghi đè sẽ làm mất dữ liệu cũ. Thay vào đó mỗi lần sync lưu một **chunk** riêng chứa số liệu phân rã theo ngày, rồi document công khai được **dựng lại bằng cách gộp mọi chunk**:

```
messenger_stats/{id}                    ← document công khai
messenger_stats/{id}/chunks/{from_to}   ← mỗi lần export một chunk
```

**Ngày là đơn vị gộp.** Một ngày xuất hiện dưới cùng một khoá ở mọi chunk phủ nó, nên các lần export chồng lấn không bị cộng dồn hai lần, và sync lại cùng một file không thay đổi gì. Ngày nằm ở biên export có thể bị cắt dở, nên bản nhiều tin hơn thắng — lấy nguyên cả record để số của từng người vẫn cộng đúng ra tổng.

Mọi con số trong document công khai đều được **tính lại từ đầu sau mỗi lần sync**, không cộng dồn. Nên sync nhầm thì chỉ cần sync lại file đúng, hoặc bấm **Tính lại** để dựng lại từ các chunk hiện có mà không cần mở zip nào.

Document còn có trường `coverage` liệt kê các khoảng thời gian đã thực sự export. Nhiều hơn một khoảng nghĩa là thống kê đang thiếu lịch sử ở giữa — bên đọc nên nói rõ điều đó thay vì trình bày con số như thể đầy đủ.

### Cấu hình cần làm một lần

1. Dán [`firestore.rules`](firestore.rules) vào Firebase Console → Firestore → Rules → Publish. **Rules không lan xuống subcollection**, nên nếu thiếu block cho `chunks` thì mọi lượt ghi chunk sẽ bị từ chối
2. Thêm domain vào Firebase Console → Authentication → Settings → **Authorized domains**. Mỗi domain phải khai riêng — `localhost`, domain production, v.v.
3. Sửa UID trong `firestore.rules` thành tài khoản Google của bạn (xem ở Authentication → Users)

## Phát triển

```bash
npm install
npm run dev        # http://localhost:5173
npm run build
npm run preview
```

```
src/
├─ context/DataSourceContext.jsx   trạng thái zip đang mở, dùng chung toàn app
├─ utils/
│  ├─ zipLoader.js                 đọc export, giải nén media theo yêu cầu
│  ├─ zipMerger.js                 gộp nhiều export thành một
│  ├─ stats.js                     tính thống kê từ mảng tin nhắn
│  └─ fileHandleStore.js           nhớ file đã mở lần trước
├─ firebase/sync.js                chunk theo ngày + dựng lại rollup
└─ pages/                          HomePage · ConversationDetail · ConversationChat · MergePage
```

## Deploy

Push lên `main` → [GitHub Actions](.github/workflows/deploy.yml) build và đẩy lên GitHub Pages.

- Domain riêng khai trong [`public/CNAME`](public/CNAME), được Vite copy vào `dist/` mỗi lần build nên không mất sau deploy
- `base: '/'` trong [`vite.config.js`](vite.config.js) vì domain riêng phục vụ từ gốc
- Dùng `HashRouter` nên không cần cấu hình SPA fallback
- Cloudflare: CNAME trỏ tới `<user>.github.io`, để **DNS only**. Bật proxy sẽ chặn GitHub cấp chứng chỉ Let's Encrypt

## Công nghệ

React 19 · React Router 7 · Vite 6 · Tailwind CSS 4 · Recharts · Firebase (Auth + Firestore) · [zip.js](https://gildas-lormeau.github.io/zip.js/)

## Ghi chú

- `MY_NAME` trong [`src/pages/ConversationChat.jsx`](src/pages/ConversationChat.jsx) đang gán cứng, dùng để quyết định tin nào hiện bên phải. Đổi tên Facebook thì sửa ở đây
- [`scripts/import-export.mjs`](scripts/import-export.mjs) (`npm run import`) là tàn dư từ kiến trúc cũ, ghi vào thư mục không còn tồn tại. Phần gộp của nó đã được thay bằng `zipMerger.js` — bản cũ khử trùng media theo tên nên thực tế không khử được gì
