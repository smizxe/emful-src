# Hướng dẫn Migration lên Supabase

## Bước 1: Tạo Project trên Supabase
1. Truy cập https://supabase.com
2. Tạo project mới
3. Chọn region gần nhất (Singapore hoặc Tokyo)
4. Copy **Connection String** từ Settings > Database

## Bước 2: Cập nhật Schema
```bash
# Tạo migration từ schema hiện tại
npx prisma migrate dev --name init

# Push migration lên Supabase
DATABASE_URL="postgresql://..." npx prisma migrate deploy
```

## Bước 3: Cập nhật .env
```
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"
```

## Bước 4: Test Connection
```bash
npx prisma db push
npx prisma generate
npm run dev
```

## Lưu ý
- SQLite (local) và PostgreSQL (production) có một số khác biệt nhỏ về kiểu dữ liệu
- Đảm bảo connection pooling được bật trên Supabase (mặc định đã có)
- Sử dụng connection pooler URL cho production (port 6543 thay vì 5432)
