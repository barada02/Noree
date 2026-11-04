import { Body, Controller, Get, HttpException, HttpStatus, NotFoundException, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { boardMarkdown } from '../shared/outline.js';
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

  /** The board as a Markdown file, in the same order as the Read view. */
  @Get(':id/export.md')
  async exportMarkdown(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const project = this.store.get(id);
    if (!project) throw new NotFoundException();
    const base = `${req.protocol}://${req.get('host')}`;
    const markdown = await this.collab.read(id, (doc) => boardMarkdown(doc, base));
    const filename = project.title.replace(/[^\w -]+/g, '').trim().slice(0, 80) || 'board';
    res
      .set({
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}.md"`,
        'X-Content-Type-Options': 'nosniff',
      })
      .send(markdown);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    const project = this.store.get(id);
    if (!project) throw new NotFoundException();
    return { id: project.id, title: project.title, updatedAt: project.updatedAt };
  }
}
