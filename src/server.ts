import { createServer } from 'http';
import dotenv from 'dotenv';
import { SocketGateway } from './gateway/SocketGateway.js';
import { RoomCache } from './cache/RoomCache.js';
import { MockAuthService } from './services/AuthService.js';
import { RedisPubSub } from './redis/RedisPubSub.js';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3001', 10);
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const INCOMING_CHANNEL = process.env.REDIS_INCOMING_CHANNEL || 'events:gateway';
const OUTGOING_CHANNEL = process.env.REDIS_OUTGOING_CHANNEL || 'events:broadcast';

const httpServer = createServer();

const roomCache = new RoomCache({
  host: REDIS_HOST,
  port: REDIS_PORT,
});

const authService = new MockAuthService();

const redisPubSub = new RedisPubSub({
  host: REDIS_HOST,
  port: REDIS_PORT,
});

const gateway = new SocketGateway(httpServer, roomCache, authService, redisPubSub, {
  incomingChannel: INCOMING_CHANNEL,
  outgoingChannel: OUTGOING_CHANNEL,
});

const startServer = async (): Promise<void> => {
  try {
    await gateway.start();

    httpServer.listen(PORT, () => {
      console.log(`✓ Gateway server running on port ${PORT}`);
      console.log(`✓ Redis: ${REDIS_HOST}:${REDIS_PORT}`);
      console.log(`✓ Incoming channel: ${INCOMING_CHANNEL}`);
      console.log(`✓ Outgoing channel: ${OUTGOING_CHANNEL}`);
    });

    const gracefulShutdown = async () => {
      console.log('\n⏳ Shutting down gracefully...');
      httpServer.close(async () => {
        await roomCache.disconnect();
        await redisPubSub.disconnect();
        process.exit(0);
      });
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  } catch (error) {
    console.error('✗ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
