import 'dotenv/config';
import { createAppServer } from './app';

const port = Number(process.env.PORT ?? 3001);
const ttl = Number(process.env.ROOM_TTL_MS ?? 6 * 60 * 60 * 1000);
const { httpServer, rooms } = createAppServer();

httpServer.listen(port, () => console.log(`Custom Splendor server listening on http://localhost:${port}`));
setInterval(() => rooms.cleanup(ttl), Math.min(ttl, 60 * 60 * 1000)).unref();
