# 💬 My Messenger

Xem lại lịch sử chat Messenger đã export và thống kê thói quen nhắn tin — chạy hoàn toàn trong trình duyệt, không có backend, không upload dữ liệu lên đâu cả.

## Tính năng

- Đọc trực tiếp file `.zip` export từ Messenger (kéo-thả hoặc chọn từ máy), kể cả file có mật khẩu
- Danh sách hội thoại, tìm kiếm theo tên
- Thống kê chi tiết từng hội thoại: số tin nhắn theo ngày/tuần/tháng, giờ hoạt động cao điểm, reaction, streak
- Giao diện xem lại chat giống Messenger, có lịch để nhảy nhanh tới ngày bất kỳ
- Dữ liệu chỉ tồn tại trong bộ nhớ trình duyệt lúc đó — tải lại trang là mất, không lưu lại gì

## Cách dùng

1. Trên điện thoại/máy tính: mở Messenger → Cài đặt → Quyền riêng tư & an toàn → **Tải xuống thông tin của bạn** → chọn tải tin nhắn (định dạng JSON)
2. Giải nén sẽ ra một file `.zip`
3. Mở app, kéo-thả (hoặc chọn) file `.zip` đó vào — nếu có đặt mật khẩu, app sẽ hỏi mật khẩu
4. Xem danh sách hội thoại và thống kê

## Chạy ở máy local

```bash
npm install
npm run dev
```

## Build production

```bash
npm run build
npm run preview   # xem thử bản build
```

## Deploy

Tự động deploy lên GitHub Pages qua GitHub Actions ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) mỗi khi push lên nhánh `main`. Route dùng `HashRouter` để tương thích với static hosting.

## Công nghệ

React 19 · React Router 7 · Vite 6 · Tailwind CSS 4 · Recharts · [zip.js](https://gildas-lormeau.github.io/zip.js/) (đọc zip, kể cả có mật khẩu, ngay trong trình duyệt)
