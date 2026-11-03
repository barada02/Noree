import { Module } from '@nestjs/common';
import { CameraGateway } from './camera.gateway.js';
import { CameraSessionsService } from './camera-sessions.service.js';

@Module({
  providers: [CameraGateway, CameraSessionsService],
})
export class CameraModule {}
