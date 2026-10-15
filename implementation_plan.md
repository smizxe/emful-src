# API Optimization Plan - Giảm Chi Phí Vercel

## Tóm Tắt

Sau khi audit 57 API routes, tôi tìm thấy **5 vấn đề chính** gây tốn chi phí:

| Vấn Đề | Mức Độ Ảnh Hưởng | Độ Khó Sửa |
|--------|-----------------|------------|
| 1. Polling quá thường xuyên | 🔴 Cao | 🟢 Dễ |
| 2. Không có response caching | 🔴 Cao | 🟡 Trung bình |
| 3. Redundant database queries | 🟠 Trung bình | 🟡 Trung bình |
| 4. Thiếu pagination | 🟠 Trung bình | 🟢 Dễ |
| 5. Stats routes chậm | 🟡 Thấp | 🟠 Khó |

---

## 🔴 Vấn Đề 1: Polling Quá Thường Xuyên

### Hiện Trạng
```
- Tickets page: 10 giây/lần ❌
- Notifications: 60 giây/lần ⚠️
```

### Files Cần Sửa
- `app/dashboard/tickets/[id]/page.tsx` (line 84)
- `app/admin/tickets/[id]/page.tsx` (line 77)
- `app/admin/components/DashboardNotificationList.tsx` (line 92)
- `app/admin/components/AdminNotifications.tsx` (line 61)

### Đề Xuất
```diff
// Tickets: Tăng từ 10s → 30s
- const interval = setInterval(fetchData, 10000);
+ const interval = setInterval(fetchData, 30000);

// Notifications: Tăng từ 60s → 120s
- const interval = setInterval(fetchNotifications, 60000);
+ const interval = setInterval(fetchNotifications, 120000);
```

**Ước tính tiết kiệm:** ~60% invocations cho các pages này

---

## 🔴 Vấn Đề 2: Không Có Response Caching

### Hiện Trạng
Tất cả API routes đều không có cache headers. Mỗi request = 1 function invocation.

### Files Quan Trọng Nhất
- `/api/auth/me` - Gọi mỗi khi navigate
- `/api/dashboard/stats` - Gọi khi load dashboard
- `/api/admin/stats/*` - Gọi nhiều lần

### Đề Xuất: Thêm Cache Headers

#### [MODIFY] [route.ts](file:///d:/Project%20Code%20Kiem%20Tien/Rip%20egfulfill%20Jack%20NG/egfulfill-clone/app/api/auth/me/route.ts)
```typescript
// Thêm cache 60 giây cho /api/auth/me
export async function GET() {
    // ... existing code ...
    
    const response = NextResponse.json({ user: { ... } });
    response.headers.set('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    return response;
}
```

#### [MODIFY] Dashboard Stats Routes
```typescript
// Thêm cache 5 phút cho stats (data không thay đổi liên tục)
response.headers.set('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
```

**Ước tính tiết kiệm:** ~40-50% invocations cho static-ish data

---

## 🟠 Vấn Đề 3: Redundant Database Queries

### Ví dụ: `/api/dashboard/stats/orders/route.ts`

**Hiện tại:**
```typescript
// Query 1: Fetch user
const user = await prisma.user.findUnique({ ... });

// Query 2: Fetch orders
const orders = await prisma.order.findMany({ ... });

// Sau đó loop qua orders nhiều lần
```

**Tối ưu:**
```typescript
// Sử dụng aggregation thay vì fetch tất cả rồi filter
const stats = await prisma.order.groupBy({
    by: ['status'],
    where: { sellerId, createdAt: { gte, lte } },
    _count: true
});
```

### Files Cần Tối Ưu
| File | Vấn Đề | Giải Pháp |
|------|--------|-----------|
| `/api/admin/stats/daily/route.ts` | 4 queries riêng biệt | Có thể gộp thành 2 |
| `/api/wallet/route.ts` | 3 queries (wallet, ledger, pending) | Có thể gộp |
| `/api/dashboard/stats/route.ts` | Fetch all orders rồi loop | Dùng groupBy |

---

## 🟠 Vấn Đề 4: Thiếu Pagination

### Hiện Trạng
```typescript
// /api/admin/orders/route.ts - Fetch TẤT CẢ orders
const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { seller: true, jobs: true }
    // ❌ Không có take/skip
});
```

### Đề Xuất
```typescript
const page = parseInt(searchParams.get('page') || '1');
const limit = parseInt(searchParams.get('limit') || '50');

const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { seller: true, jobs: true },
    take: limit,
    skip: (page - 1) * limit
});
```

### Files Cần Thêm Pagination
- `/api/admin/orders/route.ts`
- `/api/admin/shipping/route.ts`
- `/api/admin/jobs/route.ts`

---

## 🟢 Quick Wins (Có Thể Làm Ngay)

### 1. Tăng Polling Interval
**Thời gian:** 5 phút
**Impact:** Giảm 60% invocations cho polling

### 2. Thêm `select` thay vì `include` full
```typescript
// Thay vì
include: { seller: true, jobs: true }

// Chỉ lấy fields cần
select: {
    id: true,
    orderCode: true,
    status: true,
    seller: { select: { name: true } },
    jobs: { select: { id: true, status: true } }
}
```

### 3. Sử dụng SWR/React Query ở Client
Cache data locally, deduplicate requests.

---

## Thứ Tự Ưu Tiên

1. **Ngay bây giờ:** Tăng polling interval (5 phút)
2. **Tuần này:** Thêm cache headers cho auth/me và stats
3. **Tuần sau:** Optimize database queries
4. **Dài hạn:** Implement SWR caching ở client

---

## Bạn Muốn Tôi Làm Gì?

> [!IMPORTANT]
> Chọn option:
> - **A:** Implement Quick Wins ngay (polling + cache headers)
> - **B:** Full optimization (tất cả recommendations)
> - **C:** Chỉ focus vào specific area (vd: chỉ stats routes)
