import { PrismaClient } from '@prisma/client';

/** Seeds admin users from ADMIN_DISCORD_IDS and a default preset. Bots are added from the UI (token validation). */
const prisma = new PrismaClient();

async function main() {
  const ids = (process.env.ADMIN_DISCORD_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const discordId of ids) {
    await prisma.adminUser.upsert({ where: { discordId }, create: { discordId }, update: {} });
  }
  await prisma.profilePreset.upsert({
    where: { name: 'Default Gaming' },
    create: { name: 'Default Gaming', nick: 'Nexus Bot', bio: 'Your community, connected.' },
    update: {},
  });
  console.log(`Seeded ${ids.length} admin(s) and 1 preset`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
