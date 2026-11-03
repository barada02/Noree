import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { CameraModule } from './camera/camera.module.js';

@Module({
  imports: [CameraModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
