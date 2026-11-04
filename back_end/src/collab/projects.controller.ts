import { Body, Controller, Get, HttpException, HttpStatus, NotFoundException, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { CollabService } from './collab.service.js';
import { ProjectsStore } from './projects.store.js';

const CreateProject = z.object({ title: z.string().trim().min(1).max(200).optional() }).optional();

/** There's deliberately no list endpoint. With no login, a list would expose every project link. */
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly collab: CollabService,
    private readonly store: ProjectsStore,
  ) {}

  @Post()
  async create(@Body() body: unknown) {
    const parsed = CreateProject.safeParse(body);
    const project = await this.collab.createProject((parsed.success && parsed.data?.title) || 'Untitled project');
    if (!project) throw new HttpException('Too many new projects. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    return { id: project.id, title: project.title };
  }

  @Get(':id')
  get(@Param('id') id: string) {
    const project = this.store.get(id);
    if (!project) throw new NotFoundException();
    return { id: project.id, title: project.title, updatedAt: project.updatedAt };
  }
}
