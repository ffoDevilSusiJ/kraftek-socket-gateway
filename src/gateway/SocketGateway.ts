import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { RoomCache } from '../cache/RoomCache.js';
import { AuthService } from '../services/AuthService.js';
import { RedisPubSub } from '../redis/RedisPubSub.js';
import { ServiceRegistry } from '../registry/ServiceRegistry.js';
import { EventRouter } from '../router/EventRouter.js';

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
  private serviceRegistry: ServiceRegistry;
  private eventRouter: EventRouter;
  private incomingChannel: string;
  private outgoingChannel: string;

  private socketToUser: Map<string, { userId: string; roomId: string }> = new Map();

  constructor(
    httpServer: HTTPServer,
    roomCache: RoomCache,
    authService: AuthService,
    redisPubSub: RedisPubSub,
    serviceRegistry: ServiceRegistry,
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
    this.serviceRegistry = serviceRegistry;
    this.eventRouter = new EventRouter(serviceRegistry);
    this.incomingChannel = config.incomingChannel;
    this.outgoingChannel = config.outgoingChannel;
  }

  async start(): Promise<void> {
    await this.redisPubSub.subscribe(
      this.outgoingChannel,
      this.handleBroadcastEvent.bind(this)
    );

    this.io.on('connection', (socket: Socket) => {
      console.log(`Новое Socket.IO подключение: ${socket.id}`);

      socket.on('authenticate', async (data: { token: string; roomId: string }) => {
        console.log(`Получен authenticate от ${socket.id}:`, data);
        await this.handleAuthenticate(socket, data);
      });

      socket.on('disconnect', async () => {
        console.log(`Отключение: ${socket.id}`);
        await this.handleDisconnect(socket);
      });

      socket.onAny(async (eventType: string, payload: any) => {
        if (eventType !== 'authenticate' && eventType !== 'disconnect') {
          console.log(`Событие ${eventType} от ${socket.id}:`, payload);
          await this.handleClientEvent(socket, eventType, payload);
        }
      });
    });

    console.log('Socket Gateway запущен успешно!');
  }

  private async handleAuthenticate(
    socket: Socket,
    data: { token: string; roomId: string }
  ): Promise<void> {
    const { token, roomId } = data;
    // Отправка данных в auth или попытка забрать данные из кеша (также получаем userId по токену)
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

    // Проверяем, есть ли уже подключение этого пользователя к этой комнате
    const existingSocketId = await this.roomCache.getRoomUsers(roomId);
    const oldSocketId = existingSocketId.get(userId);

    if (oldSocketId && oldSocketId !== socket.id) {
      const oldSocket = this.io.sockets.sockets.get(oldSocketId);
      if (oldSocket) {
        console.log(`Отключаем старый сокет ${oldSocketId} для пользователя ${userId} в комнате ${roomId}`);
        oldSocket.emit('error', {
          code: 'DUPLICATE_CONNECTION',
          message: 'You have connected from another session',
        });
        oldSocket.disconnect(true);
      }
    }

    // Кешируем подключение, очищается при отключении сокета
    await this.roomCache.addUserToRoom(userId, roomId, socket.id);

    // Маппим сокет и пользователя
    this.socketToUser.set(socket.id, { userId, roomId });

    socket.join(roomId);

    socket.emit('authenticated', {
      success: true,
      userId,
      roomId,
    });

    console.log(`Сокет ${socket.id} зарегестрирован как пользовалеть: ${userId} на доске ${roomId}`);
  }

  private async handleDisconnect(socket: Socket): Promise<void> {
    const userInfo = this.socketToUser.get(socket.id);

    if (userInfo) {
      const { userId, roomId } = userInfo;

      await this.roomCache.removeUserFromRoom(userId, roomId);

      this.socketToUser.delete(socket.id);

      console.log(`Сокет ${socket.id} отключился (user: ${userId}, board: ${roomId})`);
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

    const targetChannel = this.eventRouter.routeEvent(eventType);

    if (!targetChannel) {
      socket.emit('error', {
        code: 'INVALID_EVENT',
        message: `Event type '${eventType}' is not valid or service is not registered. Expected format: serviceName:module:name`,
      });
      return;
    }

    const gatewayEvent: IGatewayEvent = {
      eventType,
      userId,
      socketId: socket.id,
      roomId,
      payload,
      timestamp: Date.now(),
    };

    console.log(`Отправляем событие: ${eventType} от userId: ${userId} в ${targetChannel}`);

    await this.redisPubSub.publish(targetChannel, gatewayEvent);
  }

  private async handleBroadcastEvent(event: IBroadcastEvent): Promise<void> {
    console.log(`Получено событие ретрансляции: ${event.type}`);

    if (!event.recipients || event.recipients.length === 0) {
      console.log('Сервис не вернул получателей, транслируем событие всем подключенным к доске пользователям');

      if (event.payload && event.payload.roomId) {
        const socketIds = await this.roomCache.getSocketIdsByRoom(event.payload.roomId);
        event.recipients = socketIds;
      }
    }

    if (!event.recipients || event.recipients.length === 0) {
      console.log('К доске никто не подключен, удаляем событие.');
      return;
    }

    const excludeSet = new Set(event.excludeSocketIds || []);

    event.recipients.forEach((socketId) => {
      if (!excludeSet.has(socketId)) {
        this.io.to(socketId).emit(event.type, event.payload);
      }
    });

    console.log(`Событие транслированно: ${event.recipients.length} получателям`);
  }

  getIO(): SocketIOServer {
    return this.io;
  }
}
