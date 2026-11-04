import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AgentsModule } from './agents/agents.module.js';
import { CameraModule } from './camera/camera.module.js';
import { CollabModule } from './collab/collab.module.js';

@Module({
  imports: [CameraModule, CollabModule, AgentsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
