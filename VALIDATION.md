# VALIDATION — ผลการตรวจสอบอัตโนมัติ

วันที่ตรวจ: 3 พ.ย. 2026 · Node v22.23.4 · TypeScript (strict, noUncheckedIndexedAccess)

> **สำคัญ:** sandbox ที่ใช้สร้างโปรเจกต์นี้ถูกบล็อกจาก npm registry (proxy ตอบ 403) จึง **ติดตั้ง dependencies ไม่ได้**
> (next, discord.js, bullmq, prisma, next-auth) ผลด้านล่างจึงแบ่งเป็น "รันจริงแล้ว" กับ "ยังไม่ได้รัน — ต้องรันบนเครื่องคุณ"

## ✅ รันจริงแล้ว

### 1. Unit tests — `packages/shared` → **25 passed, 0 failed**
ใช้ zod 3.25 และ test file จริง (`packages/shared/test/shared.test.ts`) ไม่ได้แก้ test

| กลุ่ม | สิ่งที่ทดสอบ | ผล |
|---|---|---|
| Template rendering (6) | ตัวแปร built-in/custom, {date} โซน Asia/Bangkok, ไม่แทนตัวแปรที่ไม่รู้จัก, กัน injection (ไม่ re-scan ค่า), กัน prototype key, render ใน embed | ✅ |
| Permission checks (3) | invite bitfield = 604163072, หา permission ที่ขาด, เงื่อนไขห้องที่ส่งได้ (+Attach/+Webhook) | ✅ |
| Embed limit validation (5) | ข้อความว่าง, รวม embed 6002/6000 ถูกปฏิเสธ, 6000 พอดีผ่าน, >10 embeds / >2000 ตัวอักษรถูกปฏิเสธ, embed ว่าง | ✅ |
| Delivery retry logic (3) | 5xx/429/network = retry, 403/404/400 = ไม่ retry, exponential backoff + jitter bounds, ข้อความ error ภาษาคน | ✅ |
| Schemas (6) | confirmCount ต้องตรงจำนวนปลายทาง, @everyone ต้องยืนยันเพิ่ม, ห้องซ้ำ, ชื่อ webhook ห้าม "discord", bio ≤190 / null = inherit | ✅ |
| Token encryption (2) | AES-256-GCM round-trip, IV สุ่ม, ปฏิเสธข้อมูลที่ถูกแก้/คีย์ผิด | ✅ |

### 2. Typecheck strict — `packages/shared` (src + tests) → **ผ่าน 0 errors**
(พบและแก้ 1 จุดใน test: indexed access ที่อาจเป็น undefined)

### 3. Static checks ทั้ง monorepo — `scripts/static-checks.mjs` → **ผ่านทั้งหมด**
```
[1] syntax: 80 files parsed
[2] @nexus/shared imports: 74 names resolved
[3] local imports: 165 resolved
[4] route files: 26 checked (exports + auth guard)
[5] client components: 16 checked for server/secret imports
[6] tokenEnc confined to encrypt-on-write in api/bots
[7] prisma: 13 models, 5 enums cross-checked
[8] prisma accessors match models

STATIC CHECKS: all passed
```
สิ่งที่ตรวจ: syntax ของทุกไฟล์ TS/TSX · ชื่อที่ import จาก @nexus/shared มีจริง · import ภายในโปรเจกต์ resolve ได้ทุกตัว ·
route ของ Next.js export เฉพาะชื่อที่อนุญาตและมี auth guard ทุกตัว · client component ไม่ import โค้ดฝั่ง server/ความลับ ·
`tokenEnc` ถูกใช้เฉพาะตอนเข้ารหัสใน POST /api/bots · Prisma relation/type อ้างถึง model ที่มีจริง · `prisma.<model>` ทุกจุดมี model รองรับ

### 4. Manual code review (โดยผู้สร้าง) — พบและแก้แล้ว
| # | ปัญหา | การแก้ |
|---|---|---|
| 1 | อัปโหลดไฟล์แนบหลายไฟล์พร้อมกัน เก็บได้แค่ไฟล์สุดท้าย (stale state ใน loop) | เปลี่ยนเป็น functional state update |
| 2 | `api/bots/route.ts` export ตัวแปรที่ไม่ใช่ route → `next build` จะ fail | เลิก export |
| 3 | ลบ Bot ขณะ worker ยังทำงาน → `prisma.update` throw | ใช้ `updateMany` + ข้ามเมื่อไม่พบ bot |
| 4 | `pnpm --filter db deploy` ชนกับคำสั่ง built-in ของ pnpm | เปลี่ยนชื่อ script เป็น `migrate:deploy` |


## ✅ ผลจริงบน Railway (deploy 3 พ.ย. 2026, commit 432064c)

| ตรวจ | ผล |
|---|---|
| `pnpm install` + `prisma generate` ใน Docker | ✅ ผ่าน |
| `next build` (Next.js 15.5.28) — รวม typecheck ของ apps/web | ✅ ผ่าน |
| bot worker start (tsx) | ✅ `bot worker ready` port 8081 |
| `prisma db push` ไป Supabase schema `nexus` | ✅ สร้าง 13 ตาราง (ยืนยันด้วย SQL) |
| web start | ✅ Ready, health check `/login` ผ่าน |
| Redis (Railway template) | ✅ SUCCESS |

แก้หลัง deploy: เอา `output: 'standalone'` ออก (ขัดกับ `next start`)

ยังค้าง:
- `apps/bot` รันด้วย tsx จึงยังไม่ผ่าน `tsc` แบบ strict จริง (ไม่ขวางการทำงาน) → รัน `pnpm --filter @nexus/bot typecheck`
- Asset storage ยังเป็น `local` จนกว่าจะตั้ง `SUPABASE_SERVICE_ROLE_KEY`
- Login ยังไม่ได้ทดสอบ เพราะยังไม่ได้ตั้ง `AUTH_DISCORD_ID` และ `AUTH_DISCORD_SECRET`


## ✅ เฟส 2 — โมดูล Welcome / Reaction Roles / Moderation / Honeypot (commit b99f7d3)

| ตรวจ | ผล |
|---|---|
| Unit tests `packages/shared` | ✅ 41 passed (เดิม 25 + ใหม่ 16: โหมด reaction role 5 แบบ, honeypot trigger, ลำดับ role, parse duration, schema) |
| Typecheck strict `packages/shared` | ✅ 0 errors |
| Static checks (32 route files, 21 client components) | ✅ ผ่านทั้งหมด |
| `next build` บน Railway (รวมหน้าใหม่ 3 หน้า) | ✅ SUCCESS |
| bot worker บน Railway | ✅ `bot worker ready` |
| `prisma db push` → ตาราง Role, GuildSettings, RoleMenu, ModCase ใน schema `nexus` | ✅ ยืนยันด้วย SQL |

หมายเหตุ: auto-deploy จาก GitHub ไม่ทำงานรอบแรกเพราะชื่อ repo เปลี่ยนตัวพิมพ์ แก้แล้วโดยผูก source ใหม่เป็น `NEXUSGameDataCenter/Discord-Bot-Manager`
ยังไม่ทดสอบกับ Discord จริง (ต้องตั้ง OAuth + เปิด Server Members Intent) → HUMAN_REVIEW.md หมวด J


## ✅ เฟส 3 — Email sign-in + Team + My Profile (commit 0f102c6)

| ตรวจ | ผล |
|---|---|
| Unit tests `packages/shared` | ✅ 44 passed (+3: ลำดับสิทธิ์, normalise อีเมลเชิญ/ห้ามเชิญ OWNER, profile/patch schema) |
| Typecheck strict `packages/shared` | ✅ 0 errors |
| Static checks: 36 route files มี role guard ทุกไฟล์ (27 EDITOR, 4 OWNER, ที่เหลือ ADMIN) | ✅ |
| `next build` + start บน Railway, healthcheck `/login` | ✅ SUCCESS |
| `prisma db push` → TeamMember, MagicToken ใน schema `nexus` | ✅ ยืนยันด้วย SQL |

ออกแบบด้านความปลอดภัย: เก็บเฉพาะ SHA-256 ของ token, ใช้ได้ครั้งเดียว (race-safe), login 15 นาที / invite 7 วัน,
จำกัด 5 ลิงก์ต่ออีเมลต่อ 15 นาที, หน้า login ตอบเหมือนกันทุกกรณี (ไม่บอกว่าอีเมลอยู่ในทีมไหม),
ลิงก์ต้องกดปุ่ม (POST) กันระบบสแกนอีเมลใช้ token ไปก่อน, สิทธิ์และสถานะอ่านจาก DB ทุก request
ยังไม่ได้ทดสอบส่งอีเมลจริง (ยังไม่ได้ตั้ง SMTP_URL / RESEND_API_KEY) → HUMAN_REVIEW.md หมวด K

## ⏳ ยังไม่ได้รัน (ต้องมี dependencies) — คำสั่งสำหรับรันบนเครื่องคุณ

```bash
pnpm install
pnpm db:generate                      # ตรวจ Prisma schema จริง (prisma validate)
pnpm typecheck                        # tsc strict ของ shared + db + bot + web
pnpm test                             # vitest จริง (ควรได้ 25 passed)
pnpm --filter @nexus/web build        # next build (ตรวจ route types, RSC boundaries)
node scripts/static-checks.mjs .      # static checks ชุดเดียวกับด้านบน
docker compose up --build             # end-to-end
```

| สิ่งที่ยังไม่ยืนยัน | ความเสี่ยง |
|---|---|
| Typecheck ของ `apps/bot` กับ types ของ discord.js / bullmq | กลาง — ใช้ API ตามเอกสาร v14/v5 แต่ยังไม่ได้คอมไพล์จริง |
| Typecheck + `next build` ของ `apps/web` (Next 15, next-auth v5 beta) | กลาง — โดยเฉพาะ type ของ argument ที่ 2 ใน route handler |
| `prisma validate` / migration แรก | ต่ำ — ตรวจโครงสร้างด้วยสคริปต์แล้ว |
| การทำงานกับ Discord จริง | ดู HUMAN_REVIEW.md |
