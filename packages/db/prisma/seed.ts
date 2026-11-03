import { PrismaClient } from '@prisma/client';

/** Seeds the owner account from OWNER_EMAIL and a default preset. Other people are invited from the Team page. */
const prisma = new PrismaClient();

async function main() {
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (email) await prisma.teamMember.upsert({ where: { email }, create: { email, role: 'OWNER', status: 'ACTIVE' }, update: { role: 'OWNER' } });
  await prisma.profilePreset.upsert({
    where: { name: 'Default Gaming' },
    create: { name: 'Default Gaming', nick: 'Nexus Bot', bio: 'Your community, connected.' },
    update: {},
  });
  console.log(`Seeded owner ${email ?? '(none — set OWNER_EMAIL)'} and 1 preset`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
