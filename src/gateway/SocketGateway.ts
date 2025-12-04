import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { RoomCache } from '../cache/RoomCache.js';
import { AuthService } from '../services/AuthService.js';
import { RedisPubSub } from '../redis/RedisPubSub.js';

interface IGatewayEvent {
  eventType: string;
  userId: string;
  socketId: string;
  roomId?: string;
  payload: any;
  timestamp: number;
}

interface IBroadcastEvent {
  type: string;
  recipients: string[];
  payload: any;
  excludeSocketIds?: string[];
}

export class SocketGateway {
  private io: SocketIOServer;
  private roomCache: RoomCache;
  private authService: AuthService;
  private redisPubSub: RedisPubSub;
  private incomingChannel: string;
  private outgoingChannel: string;

  private socketToUser: Map<string, { userId: string; roomId: string }> = new Map();

  constructor(
    httpServer: HTTPServer,
    roomCache: RoomCache,
    authService: AuthService,
    redisPubSub: RedisPubSub,
    config: {
      incomingChannel: string;
      outgoingChannel: string;
    }
  ) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    this.roomCache = roomCache;
    this.authService = authService;
    this.redisPubSub = redisPubSub;
    this.incomingChannel = config.incomingChannel;
    this.outgoingChannel = config.outgoingChannel;
  }

  async start(): Promise<void> {
    await this.redisPubSub.subscribe(
      this.outgoingChannel,
      this.handleBroadcastEvent.bind(this)
    );

    this.io.on('connection', (socket: Socket) => {
      console.log(`🔌 Client connected: ${socket.id}`);

      socket.on('authenticate', async (data: { token: string; roomId: string }) => {
        await this.handleAuthenticate(socket, data);
      });

      socket.on('disconnect', async () => {
        await this.handleDisconnect(socket);
      });

      socket.onAny(async (eventType: string, payload: any) => {
        if (eventType !== 'authenticate' && eventType !== 'disconnect') {
          await this.handleClientEvent(socket, eventType, payload);
        }
      });
    });

    console.log('✓ Socket Gateway started');
  }

  private async handleAuthenticate(
    socket: Socket,
    data: { token: string; roomId: string }
  ): Promise<void> {
    const { token, roomId } = data;

    console.log(`🔐 Authenticating socket ${socket.id} for room ${roomId}`);

    const authResult = await this.authService.checkAccess(token, roomId);

    if (!authResult.success || !authResult.userId) {
      socket.emit('error', {
        code: 'AUTH_FAILED',
        message: authResult.message || 'Authentication failed',
      });
      socket.disconnect();
      return;
    }

    const userId = authResult.userId;

    await this.roomCache.addUserToRoom(userId, roomId, socket.id);

    this.socketToUser.set(socket.id, { userId, roomId });

    socket.join(roomId);

    socket.emit('authenticated', {
      success: true,
      userId,
      roomId,
    });

    console.log(`✓ Socket ${socket.id} authenticated as ${userId} in room ${roomId}`);
  }

  private async handleDisconnect(socket: Socket): Promise<void> {
    const userInfo = this.socketToUser.get(socket.id);

    if (userInfo) {
      const { userId, roomId } = userInfo;

      await this.roomCache.removeUserFromRoom(userId, roomId);

      this.socketToUser.delete(socket.id);

      console.log(`🔌 Socket ${socket.id} disconnected (user: ${userId}, room: ${roomId})`);
    } else {
      console.log(`🔌 Socket ${socket.id} disconnected (not authenticated)`);
    }
  }

  private async handleClientEvent(
    socket: Socket,
    eventType: string,
    payload: any
  ): Promise<void> {
    const userInfo = this.socketToUser.get(socket.id);

    if (!userInfo) {
      socket.emit('error', {
        code: 'NOT_AUTHENTICATED',
        message: 'Please authenticate first',
      });
      return;
    }

    const { userId, roomId } = userInfo;

    const gatewayEvent: IGatewayEvent = {
      eventType,
      userId,
      socketId: socket.id,
      roomId,
      payload,
      timestamp: Date.now(),
    };

    console.log(`📤 Publishing event: ${eventType} from ${userId} to ${this.incomingChannel}`);

    await this.redisPubSub.publish(this.incomingChannel, gatewayEvent);
  }

  private async handleBroadcastEvent(event: IBroadcastEvent): Promise<void> {
    console.log(`📥 Received broadcast event: ${event.type}`);

    if (!event.recipients || event.recipients.length === 0) {
      console.log('⚠ No recipients specified, broadcasting to all sockets in payload roomId');

      if (event.payload && event.payload.roomId) {
        const socketIds = await this.roomCache.getSocketIdsByRoom(event.payload.roomId);
        event.recipients = socketIds;
      }
    }

    if (!event.recipients || event.recipients.length === 0) {
      console.log('⚠ No recipients found, skipping broadcast');
      return;
    }

    const excludeSet = new Set(event.excludeSocketIds || []);

    event.recipients.forEach((socketId) => {
      if (!excludeSet.has(socketId)) {
        this.io.to(socketId).emit(event.type, event.payload);
      }
    });

    console.log(`✓ Broadcast sent to ${event.recipients.length} recipients`);
  }

  getIO(): SocketIOServer {
    return this.io;
  }
}
