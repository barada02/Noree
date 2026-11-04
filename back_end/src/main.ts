import './load-env.js';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Server as HttpServer } from 'node:http';
import { AppModule } from './app.module.js';
import { CollabService } from './collab/collab.service.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // nginx on the same machine is the only proxy, so the client address comes from its header.
  app.set('trust proxy', 'loopback');
  // Runs on pm2's restart signal, so edits waiting to be saved reach the disk first.
  app.enableShutdownHooks();
  app.get(CollabService).attach(app.getHttpServer() as HttpServer);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
