# HUMAN REVIEW — รายการที่ต้องให้คนตรวจ

ไฟล์นี้แยกจาก VALIDATION.md: เป็นสิ่งที่ **เครื่องตรวจแทนไม่ได้** (ต้องใช้ Discord จริง, ต้องตัดสินใจ, หรือเกี่ยวกับความปลอดภัย)
ติ๊ก ☐ → ☑ เมื่อตรวจแล้ว และจดผลในคอลัมน์ "ผล"

## A. ก่อนเริ่ม (setup)
| ☐ | รายการ | ผล |
|---|---|---|
| ☐ | `pnpm install && pnpm typecheck && pnpm test && pnpm --filter @nexus/web build` ผ่านหมด (ดู VALIDATION.md ส่วน ⏳) | |
| ☐ | `pnpm db:migrate --name init` สร้าง migration แรกแล้ว commit โฟลเดอร์ `prisma/migrations` | |
| ☐ | `.env` ครบ: ENCRYPTION_KEY 64 hex, AUTH_SECRET, AUTH_DISCORD_ID/SECRET, ADMIN_DISCORD_IDS | |
| ☐ | Redirect URL ใน Developer Portal ตรงกับ `AUTH_URL` | |

## B. Auth & ความปลอดภัย
| ☐ | ขั้นตอนทดสอบ | คาดหวัง | ผล |
|---|---|---|---|
| ☐ | Login ด้วยบัญชีที่**ไม่อยู่**ใน ADMIN_DISCORD_IDS | เห็น "บัญชีนี้ไม่มีสิทธิ์เข้าใช้งาน" | |
| ☐ | เรียก `/api/bots` โดยไม่ login (curl) | 401 JSON | |
| ☐ | ลบ ID ของตัวเองออกจาก ADMIN_DISCORD_IDS แล้ว restart web | session เดิมใช้ไม่ได้ทันที | |
| ☐ | เพิ่ม Bot แล้วเปิด DevTools → Network ดู `/api/bots` | ไม่มี token / tokenEnc ใน response | |
| ☐ | ค้นใน log ของ web และ bot หลังเพิ่ม Bot | ไม่พบ token | |
| ☐ | ใส่ token ของ user account (ไม่ใช่ bot) | ถูกปฏิเสธ "ไม่ใช่ Bot account" | |
| ☐ | **ตัดสินใจ:** ใช้ ENCRYPTION_KEY เดียวตลอด — ถ้าเปลี่ยน key ต้องเพิ่ม token ใหม่ทุกตัว (ยังไม่มี key rotation) | | |

## C. Bot management
| ☐ | ขั้นตอนทดสอบ | คาดหวัง | ผล |
|---|---|---|---|
| ☐ | Add Bot ด้วย token จริง | สถานะ STARTING → ONLINE, ping/uptime/guilds ขึ้น (realtime ไม่ต้อง refresh) | |
| ☐ | Stop / Start / Restart | สถานะเปลี่ยนตาม และ restart container แล้ว bot ที่ stop ไว้ยัง stop | |
| ☐ | Invite URL | หน้า authorize แสดงสิทธิ์ 7 รายการตามตาราง README | |
| ☐ | Edit Global Profile (username) | มี dialog เตือน rate-limit; เปลี่ยนชื่อสำเร็จ | |

## D. Announcement — การเลือก Server/ห้องจาก dropdown (ฟีเจอร์ที่ขอ)
| ☐ | ขั้นตอนทดสอบ | คาดหวัง | ผล |
|---|---|---|---|
| ☐ | ขั้น Target: dropdown **Server** | แสดงทุก Server ที่ Bot อยู่ (ชื่อจริง), Server ที่ไม่มีห้องส่งได้เป็นตัวเลือก disabled | |
| ☐ | เลือก Server → dropdown **Channel** | แสดงเฉพาะห้อง text/announcement ที่ Bot มี View+Send+Embed, จัดกลุ่มตาม category, ห้อง default ถูกเลือกไว้ | |
| ☐ | ปิด Send Messages ของ Bot ในห้องหนึ่ง → กด Run Health Check (หน้า Servers) → กลับมาเลือกใหม่ | ห้องนั้นหายจาก dropdown | |
| ☐ | สร้างห้องใหม่ใน Discord | โผล่ใน dropdown ภายใน ~3 วินาที | |
| ☐ | แนบไฟล์แล้วเลือกห้องที่ไม่มี Attach Files | ห้องนั้นไม่แสดง / target เดิมขึ้นคำเตือนแดง | |
| ☐ | เลือกโหมด Webhook | เหลือเฉพาะห้องที่มี Manage Webhooks | |
| ☐ | "All servers (default channel)" และ "Load Target Group" | เพิ่มทุก Server ด้วยห้องเริ่มต้น, แจ้งจำนวนที่ข้าม | |
| ☐ | **UX ตัดสินใจ:** ต้องการเลือกหลาย Server พร้อมกันแบบ checkbox (เหมือนต้นแบบ HTML) แทน/เพิ่มจาก dropdown ทีละ Server หรือไม่ | | |

## E. Delivery engine (ใช้ Server ทดสอบ)
| ☐ | ขั้นตอนทดสอบ | คาดหวัง | ผล |
|---|---|---|---|
| ☐ | Test send ไปห้อง sandbox | ได้ข้อความ 1 ข้อความ, หน้า tracking แยก "[TEST]" | |
| ☐ | ส่งไป 2+ Server | confirm dialog แสดงจำนวน Servers/Channels ตรง, Tracking มี jump link ↗ ใช้ได้ | |
| ☐ | ตัวแปร `{server.name}` `{server.memberCount}` `{channel.name}` `{date}` และ custom var | แทนค่าถูกต้องแต่ละ Server | |
| ☐ | ข้อความมีคำว่า @everyone แต่ **ไม่** เปิด Allow | ไม่มีใคร ถูก ping | |
| ☐ | Role ping ผ่าน override | ping เฉพาะ role นั้น | |
| ☐ | ลบห้องปลายทางก่อนส่ง | target นั้น FAILED "ไม่พบห้อง…" ไม่ retry, ที่เหลือ SENT, สถานะรวม PARTIAL | |
| ☐ | Retry Failed Only | ส่งเฉพาะที่ fail | |
| ☐ | Crosspost ในห้อง Announcement | ข้อความถูก publish | |
| ☐ | โหมด Webhook + ชื่อ/รูปกำหนดเอง | ข้อความแสดงชื่อ/รูปตามที่ตั้ง, ปุ่มลิงก์แสดง | |
| ☐ | Edit everywhere / Delete everywhere | แก้/ลบครบทุกที่ (รวม webhook), ไม่ ping ซ้ำตอนแก้ | |
| ☐ | Stop Bot ระหว่างส่ง | job retry ~5 ครั้ง แล้ว FAILED "Bot offline" — **ตัดสินใจ:** ยอมรับพฤติกรรมนี้ไหม | |
| ☐ | ส่งไป 50+ ห้อง (ถ้ามี) | ไม่มี 429 ค้าง (discord.js จัดการ) และ concurrency=5 | |

## F. Scheduling (Asia/Bangkok)
| ☐ | ขั้นตอนทดสอบ | คาดหวัง | ผล |
|---|---|---|---|
| ☐ | ตั้งเวลาอีก 2 นาที | ส่งตรงเวลาไทย | |
| ☐ | Cron `*/5 * * * *` (ชั่วคราว) | ส่งรอบใหม่ทุก 5 นาที (run #2, #3…), Pause/Resume/Delete ใช้ได้ | |
| ☐ | Restart container ระหว่างรอ schedule | ยังส่งตามเวลา (job อยู่ใน Redis AOF) | |

## G. Per-server profile — **ต้องตรวจใน Discord client จริง** (ตาม prompt)
| ☐ | ขั้นตอนทดสอบ | Desktop | Mobile | Web |
|---|---|---|---|---|
| ☐ | Nickname ราย Server | | | |
| ☐ | Avatar ราย Server (PNG, crop 1:1) | | | |
| ☐ | Avatar GIF | | | |
| ☐ | Banner ราย Server (680×240) | | | |
| ☐ | Bio ราย Server | | | |
| ☐ | Inherit global (null) คืนค่ากลับ | | | |
| ☐ | Server ที่ Bot ขาด Change Nickname | หน้า Profiles แสดงวิธีแก้, sync = FAILED พร้อมเหตุผล | | |
| ☐ | Bulk apply preset ไป N Servers | confirm แสดง N, สร้าง N jobs | | |
| ☐ | Kick Bot แล้วเชิญกลับ | profile ถูก apply อัตโนมัติ (guildCreate) | | |

## H. จุดที่ต่างจาก prompt — ต้องตัดสินใจ
| ☐ | รายการ | ทางเลือก |
|---|---|---|
| ☐ | **UI ใช้ CSS จากไฟล์ต้นแบบ HTML ตรงๆ** (ตามที่ขอ) ไม่ได้ใช้ Tailwind + shadcn/ui ตาม prompt | คงไว้ / ย้ายไป Tailwind+shadcn ภายหลัง |
| ☐ | **ไม่ได้ทำแบบ phase + รออนุมัติ** ตาม "HOW TO WORK" เพราะคำขอนี้ให้สร้างทั้งหมด | ใช้ checklist นี้เป็นจุด approve แทน |
| ☐ | Asset เก็บใน local volume (ไม่ใช่ S3) — Railway แชร์ volume ระหว่าง web/bot ไม่ได้ | ใช้ VPS / เพิ่ม S3 adapter |
| ☐ | Desired-vs-live diff เทียบได้จริงเฉพาะ Nickname (avatar/banner/bio อ่านกลับไม่ได้ด้วย intent Guilds) | ยอมรับ / เพิ่ม REST fetch member |
| ☐ | ไม่มี event เมื่อ Role ถูก**มอบ**ให้ Bot (ต้อง GuildMembers ซึ่ง privileged) → ต้องกด Health Check | ยอมรับ / เพิ่ม refresh ตามรอบเวลา |
| ☐ | Edit everywhere แก้ได้เฉพาะ content (embed/ไฟล์คงเดิม) | ยอมรับ / ขยาย |
| ☐ | Settings → ภาษา/timezone เป็นค่าคงที่ (แสดงผลเท่านั้น) | ยอมรับ / ทำให้แก้ได้ |
| ☐ | ยังไม่มี rate limit ที่ API ของ Dashboard เอง (มีแค่ admin allow-list) | ยอมรับ / เพิ่ม |
| ☐ | Loading skeleton/empty state/toast มีครบ; optimistic UI ใช้กับสถานะ Bot แบบ realtime เท่านั้น | |

## I. Mobile / responsive
| ☐ | หน้าจอ 375px: เมนู ☰, ขั้น Target (dropdown 3 ช่องเรียงลงมา), Tracking, Profiles preview | |

## J. โมดูลใหม่ (อ้างอิง koya.gg) — ต้องทดสอบในเซิร์ฟทดสอบ
> ก่อนเริ่ม: Developer Portal → Bot → เปิด **Server Members Intent** แล้วเชิญ Bot ใหม่ด้วย Invite URL ล่าสุด (สิทธิ์เพิ่ม + `applications.commands`) และลาก role ของ Bot ให้อยู่สูงกว่า role ที่จะแจก

| ☐ | ทดสอบ | คาดหวัง | ผล |
|---|---|---|---|
| ☐ | Welcome: เลือกห้องจาก dropdown, ใช้ `{user.mention}` | คนใหม่เข้า → ข้อความขึ้น, mention เฉพาะคนนั้น | |
| ☐ | Join DM | ได้ DM (ถ้าเปิดรับ) | |
| ☐ | Goodbye | ออกจากเซิร์ฟ → ข้อความขึ้น | |
| ☐ | Auto role ทันที + แบบหน่วง 1 นาที, target คน/บอท | ได้ role ตามเวลา, restart bot ระหว่างรอก็ยังได้ | |
| ☐ | role ที่สูงกว่า Bot | เลือกไม่ได้ใน dropdown | |
| ☐ | Reaction role แบบปุ่ม 4 โหมด (TOGGLE/UNIQUE/ADD_ONLY/REMOVE_ONLY) | ตอบกลับ ephemeral และ role เปลี่ยนถูกต้อง | |
| ☐ | Reaction role แบบ emoji (unicode + custom emoji) | react → ได้ role, เอา react ออก → ถอด (TOGGLE) | |
| ☐ | Edit เมนูแล้วเปลี่ยนห้อง | ข้อความเก่าถูกลบ, โพสต์ในห้องใหม่ | |
| ☐ | Slash commands ขึ้นในเซิร์ฟ | สมาชิกทั่วไปไม่เห็น, mod เห็นตามสิทธิ์ | |
| ☐ | /ban /kick /timeout 10m /warn /purge 5 /lock /unlock /case | ทำงาน + case ขึ้นใน mod log และหน้า Moderation | |
| ☐ | /ban คนที่ role สูงกว่าตัวเอง | ถูกปฏิเสธพร้อมเหตุผล | |
| ☐ | reason presets | ขึ้นเป็น autocomplete | |
| ☐ | Honeypot โหมด alert (ใช้บัญชีทดสอบ) | ข้อความถูกลบ + case HONEYPOT | |
| ☐ | Honeypot โหมด softban/ban | บัญชีทดสอบโดนจริง, แอดมินและ exempt role ไม่โดน | |
| ☐ | สร้างห้อง Honeypot ด้วยชื่อ custom | ห้องถูกสร้าง + ข้อความเตือน + ถูกเลือกอัตโนมัติ | |
| ☐ | **ตัดสินใจ:** Honeypot action เริ่มต้นใช้ `alert` ไปก่อน 1–2 วัน แล้วค่อยเปลี่ยนเป็น softban | | |

## K. เข้าสู่ระบบ (อีเมล + รหัสผ่าน) · ขอเข้าร่วม · Team · My Profile
| ☐ | ทดสอบ | คาดหวัง | ผล |
|---|---|---|---|
| ☐ | Owner ตั้งรหัสผ่านที่ My Profile แล้ว sign out → login ด้วยอีเมล + รหัสผ่าน | เข้าได้ | |
| ☐ | รหัสผ่านผิด 10 ครั้งใน 15 นาที | ถูกบล็อกชั่วคราว | |
| ☐ | หน้า login → ขอเข้าร่วมทีม (บัญชีทดสอบ) | ขึ้น "ส่งคำขอแล้ว", ยัง login ไม่ได้จนกว่าจะอนุมัติ | |
| ☐ | Team → คำขอเข้าร่วม → อนุมัติเป็น Editor | บัญชีทดสอบ login ได้ทันที เห็นเมนูเฉพาะของ Editor | |
| ☐ | ปฏิเสธคำขอ | คำขอหายไป, login ไม่ได้ | |
| ☐ | สร้างลิงก์เชิญ → เปิดในเบราว์เซอร์อื่น → ตั้งชื่อ + รหัสผ่าน | เข้าระบบได้, ลิงก์เดิมใช้ซ้ำไม่ได้ | |
| ☐ | ปิดใช้งานสมาชิกที่ login อยู่ | ถูกเด้งออกเมื่อโหลดหน้าถัดไป | |
| ☐ | Owner ลืมรหัสผ่าน → ลิงก์ใน Railway log | เข้าได้และพาไปหน้า My Profile | |
| ☐ | My Profile: เปลี่ยนชื่อ รูป รหัสผ่าน | มีผลกับบัญชีตัวเองเท่านั้น | |
| ☐ | UI: โลโก้ใหม่ที่ topbar/favicon, banner ที่หน้า login และภาพรวม, ไม่มีกล่อง Active Workspace, รายละเอียดรองถูกพับ (▾) | | |
