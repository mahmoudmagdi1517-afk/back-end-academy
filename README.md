# Academy API V1

Node.js + Express + MongoDB backend for Qatar academy operations.

- Currency: **QAR** (integer fils)
- Timezone: **Asia/Qatar** (store UTC; calendar/business dates in Qatar)
- Locales: `en` / `ar`

## Setup

```bash
cp .env.example .env
npm install
npm run dev
```

Requires MongoDB. Default URI: `mongodb://127.0.0.1:27017/academy_v1`.

On boot, creates Owner from `OWNER_EMAIL` / `OWNER_PASSWORD` if none exists.

## Auth

- `POST /api/auth/login` `{ email, password }`
- `POST /api/auth/refresh` `{ refreshToken }`
- `POST /api/auth/logout` `{ refreshToken }`
- `GET /api/auth/me`
- `POST /api/auth/users` (Owner/Manager)

Refresh tokens are stored hashed (SHA-256).

## Domains

| Prefix | Notes |
|--------|--------|
| `/api/students`, `/courses`, `/groups`, `/subscriptions` | Academic + subscribe/transfer/plan. Groups accept recurring `schedules` rows (`dayOfWeek` 1–7, `startTime`, `endTime`); teacher overlaps are rejected on create/update. |
| `/api/payments` | Allocations embedded; FIFO if omitted; reverse |
| `/api/sessions` | Timed sessions, postpone/cancel (Manager/Owner), attendance, close, makeups |
| `/api/hr` | Employees, salary versions, payroll workflow, leave, adjustments, admin notifications, daily job trigger |

## Locked V1 highlights

- One active subscription per course (partial unique index)
- Capacity display-only
- Session close: unmarked stay unmarked
- Makeup `feeAmount = 0` / `pricingType: free|paid`
- Due soon = dueDate − 2 Qatar calendar days
- Teacher cannot access finance/HR routes
- Daily cron `01:05` Asia/Qatar for payment notifications; every minute, today's recurring sessions are materialized and sessions missing closure or active-student attendance are alerted 15 minutes after their scheduled end.

## Health

`GET /health`
