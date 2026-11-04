import { Module } from '@nestjs/common';
import { AssetsController } from '../assets/assets.controller.js';
import { AssetsService } from '../assets/assets.service.js';
import { CollabModule } from '../collab/collab.module.js';
import { JobsService } from '../jobs/jobs.service.js';
import { AgentsController } from './agents.controller.js';

@Module({
  imports: [CollabModule],
  controllers: [AgentsController, AssetsController],
  providers: [AssetsService, JobsService],
})
export class AgentsModule {}
