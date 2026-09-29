# Cờ Tỷ Phú Online

Web game nhiều người chơi thời gian thực. Máy chủ là nguồn sự thật cho xúc xắc, lượt, tiền, tài sản và trạng thái bắt buộc; trình duyệt chỉ gửi thao tác.

## Chạy tại máy

```bash
npm install
npm run dev
```

Mở `http://localhost:3000` trong hai tab hoặc hai máy khác cùng mạng.

## Đưa lên GitHub và Render

1. Tạo repository GitHub trống, rồi trong thư mục này chạy `git init`, `git add .`, `git commit -m "Initial game"`, thêm remote GitHub và `git push -u origin main`.
2. Trên Render: **New → Blueprint**, chọn repository vừa tạo. Render tự đọc `render.yaml`.
3. Khi trạng thái Deploy là Live, mở đường dẫn Render. Tạo phòng, gửi mã phòng cho bạn bè và họ nhập mã để vào.

Render phải dùng Web Service (không phải Static Site) vì Socket.IO cần kết nối thời gian thực.
