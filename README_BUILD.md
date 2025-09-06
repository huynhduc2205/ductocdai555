# Dựng & mở web (Vite React)

## Yêu cầu
- Node.js bản LTS: https://nodejs.org
- Kết nối Internet (để cài dependencies lần đầu)

## Cách 1: Windows (double‑click)
1. Nhấp đúp **`Build_and_Open_Windows.bat`**
2. Script sẽ:
   - kiểm tra & cài dependencies: `npm install`
   - build: `npm run build`
   - mở web: `build/index.html` (hoặc `dist/index.html`)

## Cách 2: macOS / Linux
```bash
chmod +x Build_and_Open_MacLinux.sh
./Build_and_Open_MacLinux.sh
```

## Nếu muốn chạy server preview (khuyến nghị)
```bash
npm install -g serve
serve -s build  # hoặc dist
```
Mở trình duyệt: http://localhost:3000

---
**Ghi chú:** Đây là project Vite (`vite.config.ts`). File `index.html` gốc không chạy trực tiếp nếu chưa build. Hãy dùng các script ở trên để build rồi mở.