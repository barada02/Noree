import {
  BadRequestException,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Res,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ProjectsStore } from '../collab/projects.store.js';
import { AssetsService, imageExtension, IMAGE_TYPES, MAX_UPLOAD_BYTES } from './assets.service.js';

@Controller()
export class AssetsController {
  constructor(
    private readonly assets: AssetsService,
    private readonly store: ProjectsStore,
  ) {}

  /** Images only. Only the server ever writes generated code, so a link can't be used to plant it. */
  @Post('projects/:id/assets')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  upload(@Param('id') id: string, @UploadedFile() file?: { buffer: Buffer }) {
    if (!this.store.get(id)) throw new NotFoundException();
    if (!file) throw new BadRequestException('Send the image in a field named "file".');
    if (!this.assets.allowUpload()) throw new HttpException('Too many uploads. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    const extension = imageExtension(file.buffer);
    if (!extension) throw new UnsupportedMediaTypeException('Only PNG, JPEG and WebP images are accepted.');
    return { url: this.assets.save(id, file.buffer, extension) };
  }

  @Get('assets/:projectId/:file')
  serve(@Param('projectId') projectId: string, @Param('file') file: string, @Res() res: Response) {
    const path = this.assets.filePath(projectId, file);
    if (!path) throw new NotFoundException();
    res.sendFile(path, {
      headers: {
        // Generated code is served as plain text, so it can only ever run inside the sandboxed iframe.
        'Content-Type': IMAGE_TYPES[file.split('.')[1]] ?? 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        // Names are content hashes, so a file at a given URL never changes.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  }
}
