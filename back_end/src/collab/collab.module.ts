import { Module } from '@nestjs/common';
import { CollabService } from './collab.service.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsStore } from './projects.store.js';

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsStore, CollabService],
  exports: [ProjectsStore, CollabService],
})
export class CollabModule {}
