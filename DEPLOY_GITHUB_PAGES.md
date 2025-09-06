# Triển khai không cần build máy (GitHub Pages)

## 1) Tạo repo
- Lên GitHub → New repository → đặt tên (ví dụ: `ductocdai`), tick **Public**.

## 2) Upload code
- Vào repo → nút **Add file → Upload files** → kéo toàn bộ project này (bao gồm thư mục `.github/workflows`).  
- Đảm bảo nhánh là **main** (hoặc đổi trigger trong workflow cho phù hợp).

## 3) Actions tự build
- Tab **Actions** sẽ tự chạy workflow `Deploy to GitHub Pages` (mất vài phút).

## 4) Bật Pages
- Settings → Pages → Source: **GitHub Actions**.
- Sau khi deploy xong, sẽ có URL dạng: `https://<username>.github.io/<repo>/`

## 5) Nếu repo không dùng nhánh `main`
- Sửa `.github/workflows/deploy.yml` dòng `branches: [ main ]` thành tên nhánh của bạn.