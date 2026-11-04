import { Server as HocuspocusServer, type DirectConnection } from '@hocuspocus/server';
import { Injectable, type BeforeApplicationShutdown } from '@nestjs/common';
import type { Server as HttpServer } from 'node:http';
import * as Y from 'yjs';
import { docParts, initDoc } from '../shared/schema.js';
import { ProjectsStore, type ProjectRecord } from './projects.store.js';

/** nginx strips /api, so browsers connect to /api/collab and it arrives here as /collab. */
export const COLLAB_PATH = '/collab';
const MAX_MESSAGE_BYTES = 5 * 1024 * 1024;

/**
 * The Yjs sync server. It shares Nest's HTTP server with the camera's Socket.IO, so there's no extra
 * port. Hocuspocus's own server is never told to listen. We only hand it the upgrades meant for it.
 */
@Injectable()
export class CollabService implements BeforeApplicationShutdown {
  private readonly server: HocuspocusServer;

  constructor(private readonly store: ProjectsStore) {
    this.server = new HocuspocusServer({
      quiet: true,
      debounce: 2000,
      maxDebounce: 10_000,
      websocketOptions: { maxPayload: MAX_MESSAGE_BYTES },
      onConnect: async ({ documentName }) => {
        // Rejecting here means a made-up name never creates a document or touches the disk.
        if (!this.store.idFromDocName(documentName)) throw new Error('Unknown project');
      },
      onLoadDocument: async ({ document, documentName }) => {
        const id = this.store.idFromDocName(documentName);
        if (!id) throw new Error('Unknown project');
        const state = this.store.loadDoc(id);
        if (state) Y.applyUpdate(document, state);
        // No job can be running when a document first loads, so any marked running died in a restart.
        document.transact(() => {
          for (const job of docParts(document).jobs.values()) {
            if (job.get('status') === 'running') {
              job.set('status', 'failed');
              job.set('error', 'The server restarted during this run. Try again.');
            }
          }
        });
      },
      onStoreDocument: async ({ document, documentName }) => {
        const id = this.store.idFromDocName(documentName);
        if (!id) return;
        const title = docParts(document).meta.get('title');
        this.store.saveDoc(id, Y.encodeStateAsUpdate(document), typeof title === 'string' ? title : undefined);
      },
    });
  }

  /** Call once, before the app starts listening. */
  attach(httpServer: HttpServer) {
    httpServer.on('upgrade', (request, socket, head) => {
      const path = (request.url ?? '').split('?')[0].replace(/\/$/, '');
      if (path === COLLAB_PATH) this.server.httpServer.emit('upgrade', request, socket, head);
    });
  }

  /** Creates the project and its document, so everyone who opens the link starts from the same state. */
  async createProject(title: string): Promise<ProjectRecord | null> {
    const project = this.store.create(title);
    if (!project) return null;
    const connection = await this.open(project.id);
    await connection.transact((doc) => initDoc(doc, title));
    await connection.disconnect();
    return project;
  }

  /** Connects to a document as a server-side peer. Agents write through this. */
  open(projectId: string, context?: unknown): Promise<DirectConnection> {
    return this.server.hocuspocus.openDirectConnection(this.store.docName(projectId), context);
  }

  beforeApplicationShutdown() {
    // Save anything waiting on its delay. Open WebSockets would also keep the HTTP server from
    // closing. Browsers reconnect on their own when the server comes back.
    this.server.hocuspocus.flushPendingStores();
    this.server.hocuspocus.closeConnections();
  }
}
