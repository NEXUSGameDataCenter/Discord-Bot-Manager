# Nexus Bot Control

Dashboard แบบ self-hosted สำหรับควบคุม Discord bot หลายตัว — ตั้ง **ตัวตนของ Bot แยกตาม Server** และ **ส่งประกาศไปหลาย Server/หลายห้อง** พร้อมตั้งเวลา ติดตามผล แก้ไข และลบทุกที่

> เอกสารประกอบ: [`VALIDATION.md`](VALIDATION.md) (ผลตรวจสอบอัตโนมัติ) · [`HUMAN_REVIEW.md`](HUMAN_REVIEW.md) (รายการที่คนต้องตรวจ)

## สถาปัตยกรรม

```
 Browser ──HTTPS──► apps/web (Next.js App Router, Auth.js Discord OAuth2)
   ▲  SSE /api/events          │ zod-validated API routes
   │                           ├──► PostgreSQL (Prisma)  ◄──┐
   │                           └──► Redis: BullMQ queues ───┤
   │                                                        │
   └── Redis pub/sub ◄── apps/bot (long-lived worker) ──────┘
                          ├ discord.js v14 gateway (intent: Guilds เท่านั้น)
                          ├ workers: control · profile-sync · dispatch · delivery · manage
                          └ GET :8081/health
```

- เว็บ **ไม่เคยคุย Discord gateway** — เว็บแค่บันทึก desired state ลง DB แล้ว enqueue job; bot worker เป็นคนทำ
- รายการ Server/ห้องใน dropdown มาจากตาราง `Channel` ที่ bot worker อัปเดตจาก gateway events (guildCreate, channel*/role* events) พร้อมคำนวณสิทธิ์ของ Bot ในแต่ละห้อง

## 1. สร้าง App ใน Discord Developer Portal

1. ไปที่ <https://discord.com/developers/applications> → **New Application**
2. แท็บ **Bot** → ไม่ต้องเปิด Privileged Gateway Intents ใดๆ (ระบบใช้แค่ `Guilds`)
3. แท็บ **OAuth2** → คัดลอก **Client ID** และ **Client Secret** (ใช้สำหรับ login เข้า Dashboard)
   และเพิ่ม Redirect: `http://localhost:3000/api/auth/callback/discord` (และ URL จริงตอน deploy)

> แนะนำแยก 2 app: app หนึ่งสำหรับ OAuth login ของ Dashboard อีก app (หรือหลาย app) เป็น Bot ที่ควบคุม — ใช้ app เดียวกันก็ได้

## 2. รับ Bot Token

แท็บ **Bot** → **Reset Token** → คัดลอก แล้วนำไปวางในหน้า **จัดการ Bots → Add Bot** ของ Dashboard
ระบบจะตรวจ token ด้วย `GET /users/@me`, ปฏิเสธ token ที่ไม่ใช่ bot และเก็บแบบเข้ารหัส AES-256-GCM (token จะไม่ถูกส่งกลับไปเบราว์เซอร์และไม่อยู่ใน log)

## 3. Invite URL

หน้า **จัดการ Bots** มีปุ่ม Copy/Invite ที่สร้าง URL ให้อัตโนมัติ
Permission bitfield = **`604163072`**

| Permission | เหตุผล |
|---|---|
| View Channel | เห็นห้องเพื่อแสดงในรายการปลายทาง |
| Send Messages | ส่งประกาศ และ crosspost ข้อความของตัวเอง |
| Embed Links | ส่ง Rich Embed |
| Attach Files | แนบไฟล์ |
| Mention Everyone | ใช้ @everyone/@here เมื่อผู้ใช้ยืนยันเท่านั้น |
| Change Nickname | ตั้ง Nickname แยกตาม Server |
| Manage Webhooks | โหมดส่งผ่าน Webhook (Custom Identity) |

## 4. รันบนเครื่องด้วย docker-compose

```bash
cp .env.example .env
# ใส่ค่า:
#   ENCRYPTION_KEY=$(openssl rand -hex 32)
#   AUTH_SECRET=$(openssl rand -base64 32)
#   AUTH_DISCORD_ID / AUTH_DISCORD_SECRET   (จากขั้นที่ 1)
#   ADMIN_DISCORD_IDS=<Discord user ID ของคุณ>  (เปิด Developer Mode → คลิกขวาที่ชื่อ → Copy User ID)
docker compose up --build
```

เปิด <http://localhost:3000> → Sign in with Discord → เพิ่ม Bot → Invite เข้า Server → ไปที่ **Announcements**

รันแบบ dev (ไม่ใช้ docker สำหรับแอป):

```bash
docker compose up -d postgres redis
pnpm install
pnpm db:generate && pnpm db:migrate --name init   # สร้าง migration ครั้งแรก
pnpm db:seed
pnpm dev                                           # web :3000 + bot worker
pnpm test                                          # unit tests (packages/shared)
```

## 5. Deploy

**VPS:** ติดตั้ง Docker แล้ว `docker compose up -d --build` ไว้หลัง reverse proxy (Caddy/Nginx) ที่ทำ HTTPS ตั้ง `AUTH_URL=https://your-domain` และเพิ่ม redirect URL ใน Developer Portal

**Railway:** สร้าง 4 services — PostgreSQL, Redis, `bot` (Dockerfile target `bot`), `web` (Dockerfile target `web`)
- ตั้ง env ตาม `.env.example` ทั้งสอง service, `BOT_HEALTH_URL=http://bot.railway.internal:8081/health`
- **ต้อง** แนบ Volume เดียวกันที่ `UPLOAD_DIR` ให้ทั้ง web และ bot หรือเปลี่ยน asset storage เป็น S3 (ดู HUMAN_REVIEW.md) เพราะ Railway แชร์ volume ข้าม service ไม่ได้
- bot ต้องเป็น service ที่รันตลอด (ไม่ใช่ serverless) และ replicas = 1

## ข้อจำกัดที่ควรรู้

- Presence/Activity เป็น global เปลี่ยนแยกตาม Server ไม่ได้ (Discord)
- Banner/Bio ราย Server: ส่งผ่าน `PATCH /guilds/{id}/members/@me` แล้ว แต่ต้องยืนยันการแสดงผลใน Discord client จริง
- ด้วย intent `Guilds` อย่างเดียว ระบบไม่ได้รับ event เมื่อ Role ถูก "มอบให้" Bot → กด **Run Health Check** ในหน้า Servers หลังแก้สิทธิ์
- Global username ถูก rate-limit หนักมาก (~2 ครั้ง/ชั่วโมง)
