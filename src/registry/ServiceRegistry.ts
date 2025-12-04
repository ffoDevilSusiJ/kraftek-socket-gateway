export interface ServiceConfig {
  serviceName: string;
  channel: string;
}

export class ServiceRegistry {
  private services: Map<string, ServiceConfig> = new Map();

  /**
   * Привязка названия сервиса с его очередью в redis
   * @param serviceName Имя сервиса (которое приходит от клиента)
   * @param channel Канал Redis этого сервиса
   */
  public registerService(serviceName: string, channel: string): void {
    if (this.services.has(serviceName)) {
      throw new Error(`Сервис '${serviceName}' уже зарегестрирован`);
    }

    const config: ServiceConfig = {
      serviceName,
      channel,
    };

    this.services.set(serviceName, config);
    console.log(`Зарегестрирован сервис: ${serviceName} → ${channel}`);
  }

  /**
   * Получает конфигурацию сервиса по имени
   */
  public getService(serviceName: string): ServiceConfig | undefined {
    return this.services.get(serviceName);
  }

  /**
   * Получает канал для сервиса
   */
  public getChannel(serviceName: string): string | undefined {
    const service = this.services.get(serviceName);
    return service?.channel;
  }

  /**
   * Проверяет, зарегистрирован ли сервис
   */
  public hasService(serviceName: string): boolean {
    return this.services.has(serviceName);
  }

  /**
   * Получает список всех зарегистрированных сервисов
   */
  public getAllServices(): ServiceConfig[] {
    return Array.from(this.services.values());
  }
}
