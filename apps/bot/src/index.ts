import { createServer } from 'node:http';
import { prisma } from '@nexus/db';
import { env } from './env';
import { logger } from './logger';
import { store } from './assets';
import { closeRedis, connection } from './redis';
import { runningBots, startBot, startPingLoop, stopAll } from './manager';
import { startControlWorker } from './workers/control';
import { startProfileWorker } from './workers/profile';
import { startDispatchWorker } from './workers/dispatch';
import { startDeliveryWorker } from './workers/delivery';
import { startManageWorker } from './workers/manage';

async function main() {
  logger.info({ assetStore: store.kind }, 'asset storage');
  const workers = [startControlWorker(), startProfileWorker(), startDispatchWorker(), startDeliveryWorker(), startManageWorker()];
  const ping = startPingLoop();

  // Bots that were OFFLINE/ERROR in DB but meant to run: start them (worker restart / deploy).
  await prisma.bot.updateMany({ data: { status: 'OFFLINE' } });
  const bots = await prisma.bot.findMany({ where: { desiredRunning: true }, select: { id: true } });
  for (const b of bots) await startBot(b.id);

  const health = createServer(async (req, res) => {
    if (req.url !== '/health') {
      res.writeHead(404).end();
      return;
    }
    let db = false;
    let redis = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = true;
    } catch {}
    try {
      redis = (await connection.ping()) === 'PONG';
    } catch {}
    const ok = db && redis;
    res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok, db, redis, workers: workers.map((w) => ({ name: w.name, running: w.isRunning() })), bots: runningBots(), uptimeSec: Math.round(process.uptime()) }));
  });
  health.listen(env.HEALTH_PORT, () => logger.info({ port: env.HEALTH_PORT }, 'bot worker ready'));

  const shutdown = async (sig: string) => {
    logger.info({ sig }, 'shutting down');
    clearInterval(ping);
    health.close();
    await Promise.allSettled(workers.map((w) => w.close()));
    await stopAll();
    await closeRedis();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'bot worker crashed');
  process.exit(1);
});
