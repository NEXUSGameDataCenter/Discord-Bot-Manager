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
2. แท็บ **Bot** → Privileged Gateway Intents → เปิด **Server Members Intent** (ใช้กับ Welcome/Auto roles) — ไม่ต้องเปิด Message Content


## เข้าสู่ระบบ Dashboard

- เข้าสู่ระบบด้วย **อีเมล + รหัสผ่าน** ไม่มีการส่งอีเมล
- คนใหม่กด **ขอเข้าร่วมทีม** ที่หน้า login (ตั้งชื่อ/รหัสผ่านเอง) แล้ว **Owner กดอนุมัติ** ในหน้า Team
- หรือ Owner สร้าง **ลิงก์เชิญ** (ใช้ครั้งเดียว 7 วัน) ส่งให้ทาง Discord แล้วผู้รับตั้งรหัสผ่านเอง
- สิทธิ์: **Owner** (จัดการทีม + ทุกอย่าง) · **Admin** (ทุกอย่างยกเว้นจัดการทีม) · **Editor** (ประกาศ/ตั้งเวลา/ดูข้อมูล)
- แต่ละคนแก้ชื่อ รูป และรหัสผ่านของตัวเองที่หน้า **My Profile**
- `OWNER_EMAIL` ลืมรหัสผ่าน: หน้า login → "Owner ลืมรหัสผ่าน" → ลิงก์กู้คืนจะอยู่ใน log ของ service web (ค้นหา `OWNER sign-in link`)

## 2. รับ Bot Token

แท็บ **Bot** → **Reset Token** → คัดลอก แล้วนำไปวางในหน้า **จัดการ Bots → Add Bot** ของ Dashboard
ระบบจะตรวจ token ด้วย `GET /users/@me`, ปฏิเสธ token ที่ไม่ใช่ bot และเก็บแบบเข้ารหัส AES-256-GCM (token จะไม่ถูกส่งกลับไปเบราว์เซอร์และไม่อยู่ใน log)

## 3. Invite URL

หน้า **จัดการ Bots** มีปุ่ม Copy/Invite ที่สร้าง URL ให้อัตโนมัติ
Permission bitfield = **`1100384234582`** (scope: `bot applications.commands`)

| Permission | เหตุผล |
|---|---|
| View Channel | เห็นห้องเพื่อแสดงในรายการปลายทาง |
| Send Messages | ส่งประกาศ และ crosspost ข้อความของตัวเอง |
| Embed Links | ส่ง Rich Embed |
| Attach Files | แนบไฟล์ |
| Mention Everyone | ใช้ @everyone/@here เมื่อผู้ใช้ยืนยันเท่านั้น |
| Change Nickname | ตั้ง Nickname แยกตาม Server |
| Manage Webhooks | โหมดส่งผ่าน Webhook (Custom Identity) |
| Manage Roles | Auto roles / Reaction roles |
| Add Reactions | เมนู Reaction role แบบ emoji |
| Kick / Ban / Timeout Members | slash commands และ Honeypot |
| Manage Messages | /purge และลบข้อความในห้อง Honeypot |
| Manage Channels | /lock /unlock และสร้างห้อง Honeypot |

**Intents:** `Guilds`, `GuildMembers` (privileged), `GuildMessages`, `GuildMessageReactions` — ไม่ใช้ `MessageContent`

## 4. รันบนเครื่องด้วย docker-compose

```bash
cp .env.example .env
# ใส่ค่า:
#   ENCRYPTION_KEY=$(openssl rand -hex 32)
#   AUTH_SECRET=$(openssl rand -base64 32)
#   OWNER_EMAIL=<อีเมลของคุณ>
docker compose up --build
```

เปิด <http://localhost:3000> → "Owner ลืมรหัสผ่าน" → เปิดลิงก์จาก log → ตั้งรหัสผ่านที่ My Profile → เพิ่ม Bot → Invite เข้า Server → ไปที่ **Announcements**

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

**VPS:** ติดตั้ง Docker แล้ว `docker compose up -d --build` ไว้หลัง reverse proxy (Caddy/Nginx) ที่ทำ HTTPS ตั้ง `AUTH_URL=https://your-domain`

**Railway:** สร้าง 4 services — PostgreSQL, Redis, `bot` (Dockerfile target `bot`), `web` (Dockerfile target `web`)
- ตั้ง env ตาม `.env.example` ทั้งสอง service, `BOT_HEALTH_URL=http://bot.railway.internal:8081/health`
- **ต้อง** แนบ Volume เดียวกันที่ `UPLOAD_DIR` ให้ทั้ง web และ bot หรือเปลี่ยน asset storage เป็น S3 (ดู HUMAN_REVIEW.md) เพราะ Railway แชร์ volume ข้าม service ไม่ได้
- bot ต้องเป็น service ที่รันตลอด (ไม่ใช่ serverless) และ replicas = 1

## ข้อจำกัดที่ควรรู้

- Presence/Activity เป็น global เปลี่ยนแยกตาม Server ไม่ได้ (Discord)
- Banner/Bio ราย Server: ส่งผ่าน `PATCH /guilds/{id}/members/@me` แล้ว แต่ต้องยืนยันการแสดงผลใน Discord client จริง
- Global username ถูก rate-limit หนักมาก (~2 ครั้ง/ชั่วโมง)
