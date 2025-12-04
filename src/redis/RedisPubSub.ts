import Redis from 'ioredis';

export class RedisPubSub {
  private publisher: Redis;
  private subscriber: Redis;

  constructor(redisConfig: { host: string; port: number }) {
    this.publisher = new Redis(redisConfig);
    this.subscriber = new Redis(redisConfig);
  }

  async publish(channel: string, message: any): Promise<void> {
    const data = typeof message === 'string' ? message : JSON.stringify(message);
    await this.publisher.publish(channel, data);
  }

  async subscribe(channel: string, callback: (message: any) => void): Promise<void> {
    await this.subscriber.subscribe(channel);

    this.subscriber.on('message', (ch, msg) => {
      if (ch === channel) {
        try {
          const data = JSON.parse(msg);
          callback(data);
        } catch (error) {
          console.error('Failed to parse message:', error);
          callback(msg);
        }
      }
    });

    console.log(`✓ Subscribed to Redis channel: ${channel}`);
  }

  async disconnect(): Promise<void> {
    await this.publisher.quit();
    await this.subscriber.quit();
  }
}
