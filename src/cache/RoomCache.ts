import Redis from 'ioredis';

export class RoomCache {
  private redis: Redis;
  private keyPrefix: string = 'room:';

  constructor(redisConfig: { host: string; port: number }) {
    this.redis = new Redis(redisConfig);
  }

  async addUserToRoom(userId: string, roomId: string, socketId: string): Promise<void> {
    const key = `${this.keyPrefix}${roomId}`;
    await this.redis.hset(key, userId, socketId);
    console.log(`✓ Added user ${userId} to room ${roomId} with socket ${socketId}`);
  }

  async removeUserFromRoom(userId: string, roomId: string): Promise<void> {
    const key = `${this.keyPrefix}${roomId}`;
    await this.redis.hdel(key, userId);
    console.log(`✓ Removed user ${userId} from room ${roomId}`);
  }

  async getRoomUsers(roomId: string): Promise<Map<string, string>> {
    const key = `${this.keyPrefix}${roomId}`;
    const data = await this.redis.hgetall(key);

    const users = new Map<string, string>();
    Object.entries(data).forEach(([userId, socketId]) => {
      users.set(userId, socketId);
    });

    return users;
  }

  async getSocketIdsByRoom(roomId: string): Promise<string[]> {
    const users = await this.getRoomUsers(roomId);
    return Array.from(users.values());
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}
