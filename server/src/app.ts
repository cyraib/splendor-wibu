import { existsSync } from 'node:fs';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { resolve } from 'node:path';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/types/events';
import { RoomManager } from '../rooms/RoomManager';
import { registerSockets } from '../sockets/registerSockets';

export function createAppServer(): { httpServer: HttpServer; rooms: RoomManager } {
  const app = express();
  const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:5173';
  const allowedOrigins = new Set([clientUrl, 'http://localhost:5173', 'http://127.0.0.1:5173']);
  const corsOptions = { origin: (origin: string | undefined, done: (error: Error | null, allow?: boolean) => void) => done(null, !origin || allowedOrigins.has(origin)), credentials: true };
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '32kb' }));
  app.get('/health', (_request, response) => response.json({ ok: true }));
  app.use('/card-assets', express.static(resolve(process.cwd(), 'Raw Asset', 'Assets', '_created'), { fallthrough: false, maxAge: '7d' }));

  const dist = resolve(process.cwd(), 'dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (_request, response) => response.sendFile(resolve(dist, 'index.html')));
  }

  const httpServer = createHttpServer(app);
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, { cors: corsOptions });
  const rooms = new RoomManager();
  registerSockets(io, rooms);
  return { httpServer, rooms };
}
