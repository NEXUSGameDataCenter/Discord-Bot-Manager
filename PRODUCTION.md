# PRODUCTION — สิ่งที่ต้องทำก่อนขึ้น production

สถานะ ณ 3 พ.ย. 2026: โค้ดเฟส 1–2 deploy บน Railway แล้ว (web + bot + Redis) และฐานข้อมูลอยู่บน Supabase schema `nexus`
เอกสารนี้รวมทุกอย่างที่ยังขาดก่อนใช้งานจริง เรียงตามลำดับที่ควรทำ

- **ใคร** = 👤 คุณทำเอง (ต้องใช้บัญชีหรือค่าลับของคุณ) · 🤖 Claude ทำให้ได้ (สั่งได้เลย)
- **บล็อก** = ถ้าไม่ทำ ระบบใช้งานไม่ได้

---

## 1. ตั้งค่าให้ระบบทำงานได้ (บล็อก)

| ☐ | ขั้นตอน | ใคร | ที่ไหน |
|---|---|---|---|
| ☐ | สร้าง/เลือก Discord application สำหรับ **login เข้า Dashboard** แล้วคัดลอก Client ID + Client Secret | 👤 | discord.com/developers → OAuth2 |
| ☐ | เพิ่ม Redirect `https://nexusmanager.up.railway.app/api/auth/callback/discord` (และโดเมนจริงถ้ามี ดูข้อ 4) | 👤 | Developer Portal → OAuth2 → Redirects |
| ☐ | ตั้ง `AUTH_DISCORD_ID` และ `AUTH_DISCORD_SECRET` ใน service **web** | 👤 | Railway → nexus-bot-control → web → Variables |
| ☐ | คัดลอก `service_role` key แล้วตั้ง `SUPABASE_SERVICE_ROLE_KEY` ใน **web** และ **bot** (ถ้าไม่ตั้ง รูป/ไฟล์แนบจะหายทุกครั้งที่ redeploy) | 👤 | Supabase → Project Settings → API Keys |
| ☐ | Bot application: เปิด **Server Members Intent** (ไม่ต้องเปิด Message Content) | 👤 | Developer Portal → Bot → Privileged Gateway Intents |
| ☐ | Login เข้า Dashboard → **จัดการ Bots → Add Bot** วาง bot token | 👤 | Dashboard |
| ☐ | กด **Invite** เชิญ Bot เข้าเซิร์ฟ (Invite URL ล่าสุดมีสิทธิ์ครบ + `applications.commands`) | 👤 | Dashboard → จัดการ Bots |
| ☐ | Server Settings → Roles: ลาก role ของ Bot ให้อยู่**สูงกว่า** role ที่จะแจก/คนที่จะลงโทษ | 👤 | Discord ทุกเซิร์ฟ |

## 2. ความปลอดภัย (ต้องทำก่อนเปิดใช้จริง)

| ☐ | ขั้นตอน | ใคร | เหตุผล |
|---|---|---|---|
| ☐ | **เปลี่ยนรหัสผ่าน DB ของ role `nexus_app`** และอัปเดต `DATABASE_URL` ใน Railway | 🤖 | รหัสเดิมปรากฏในแชตตอนตั้งค่า |
| ☐ | สำรอง `ENCRYPTION_KEY` ไว้ในที่ปลอดภัยนอก Railway (password manager) | 👤 | ถ้า key หาย token ของ Bot ทุกตัวจะถอดรหัสไม่ได้ ต้องเพิ่มใหม่หมด |
| ☐ | ตรวจว่า `ADMIN_DISCORD_IDS` มีเฉพาะคนที่ควรเข้าได้ | 👤 | เป็นด่านเดียวของการเข้าระบบ |
| ☐ | ตรวจ Supabase → Advisors (Security) ว่าไม่มีคำเตือนเกี่ยวกับ schema `nexus` | 🤖 | schema นี้ไม่ได้เปิดผ่าน API แต่ควรยืนยัน |
| ☐ | เพิ่ม rate limit ที่ API ของ Dashboard (เช่น 60 req/นาที/คน) | 🤖 | ตอนนี้มีแค่ allow-list |
| ☐ | Bot token ที่เคยวางในที่อื่น (แชต/ไฟล์) ให้ **Reset Token** ก่อนเพิ่มเข้าระบบ | 👤 | |

## 3. ความเสถียรของ build และฐานข้อมูล

| ☐ | ขั้นตอน | ใคร | เหตุผล |
|---|---|---|---|
| ☐ | Commit `pnpm-lock.yaml` และเปลี่ยน Dockerfile เป็น `--frozen-lockfile` | 🤖 | ตอนนี้ไม่มี lockfile — build แต่ละครั้งอาจได้เวอร์ชัน library ต่างกัน |
| ☐ | เปลี่ยนจาก `prisma db push` เป็น **migrations** (`prisma migrate`) | 🤖 | `db push` อาจลบคอลัมน์โดยไม่เตือนเมื่อแก้ schema ในอนาคต |
| ☐ | รัน `pnpm --filter @nexus/bot typecheck` ให้ผ่าน (web ผ่าน `next build` แล้ว, bot ยังไม่เคย typecheck จริง) | 🤖 | bot รันด้วย tsx ซึ่งไม่ตรวจ type |
| ☐ | ตั้ง bot service ให้ **replicas = 1** เสมอ | 🤖 | 2 instance = Bot ล็อกอินซ้อนและส่งประกาศซ้ำ |
| ☐ | เปิด backup ของ Supabase (Daily backup / PITR ตามแพลน) | 👤 | ข้อมูล profile, ประกาศ, mod cases |
| ☐ | Redis: ยืนยันว่า Railway Redis มี volume (ไม่หายเมื่อ restart) | 🤖 | schedule และคิวงานเก็บใน Redis |

## 4. โดเมนและการเข้าถึง (ไม่บังคับ แต่แนะนำ)

| ☐ | ขั้นตอน | ใคร |
|---|---|---|
| ☐ | ผูกโดเมนของคุณ (เช่น `dashboard.example.com`) กับ service web แล้วตั้ง DNS ตามที่ Railway ให้ | 🤖 สร้าง + 👤 ตั้ง DNS |
| ☐ | เปลี่ยน `AUTH_URL` เป็นโดเมนใหม่ และเพิ่ม redirect ใหม่ใน Developer Portal | 🤖 + 👤 |

## 5. Monitoring

| ☐ | ขั้นตอน | ใคร |
|---|---|---|
| ☐ | ตั้ง healthcheck ของ bot ที่ `/health` (port 8081) ใน Railway | 🤖 |
| ☐ | เปิดแจ้งเตือน Railway เมื่อ deploy fail / service crash (อีเมลหรือ Discord webhook) | 👤 |
| ☐ | ตั้งห้อง mod log ในทุกเซิร์ฟ (หน้า Moderation) | 👤 |

## 6. ทดสอบก่อนเปิดใช้จริง (ใช้เซิร์ฟทดสอบ)

ไล่ตาม **HUMAN_REVIEW.md** — ขั้นต่ำที่ต้องผ่านก่อน production:

| ☐ | หมวด | สิ่งที่ต้องผ่าน |
|---|---|---|
| ☐ | B | คนนอก allow-list login ไม่ได้, token ไม่โผล่ใน browser/log |
| ☐ | C | Add/Start/Stop/Restart Bot |
| ☐ | D–E | เลือก Server/ห้องจาก dropdown, test-send, ส่งจริง 2+ เซิร์ฟ, retry, edit/delete everywhere |
| ☐ | F | ตั้งเวลา + cron ส่งตรงเวลาไทย |
| ☐ | G | โปรไฟล์แยกเซิร์ฟ — ตรวจบน Desktop/Mobile/Web |
| ☐ | J | Welcome, Auto roles, Reaction roles 4 โหมด, slash commands, Honeypot (เริ่มที่โหมด `alert`) |

## 7. วันเปิดใช้จริง

| ☐ | ขั้นตอน |
|---|---|
| ☐ | Honeypot ใช้โหมด `alert` 1–2 วันก่อน แล้วค่อยเปลี่ยนเป็น `softban` |
| ☐ | ประกาศจริงครั้งแรก: test-send ไปห้อง sandbox ก่อนเสมอ |
| ☐ | ดู Railway logs ของ bot ช่วง 24 ชม.แรก |

---

### สรุปสิ่งที่ Claude ทำต่อให้ได้ทันที
ข้อ 2 (เปลี่ยนรหัส DB, Advisors, rate limit) · ข้อ 3 (lockfile, migrations, bot typecheck, replicas, Redis volume) · ข้อ 4–5 ส่วนที่เป็น Railway
