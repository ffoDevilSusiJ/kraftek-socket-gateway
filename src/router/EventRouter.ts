import { ServiceRegistry } from '../registry/ServiceRegistry.js';

export interface EventRoute {
  serviceName: string;
  module: string;
  eventName: string;
}

export class EventRouter {
  private serviceRegistry: ServiceRegistry;

  constructor(serviceRegistry: ServiceRegistry) {
    this.serviceRegistry = serviceRegistry;
  }

  /**
   * Парсит строку события в формате serviceName:module:name
   * Например: stickyNotes:note:move
   */
  public parseEventType(eventType: string): EventRoute | null {
    const parts = eventType.split(':');

    if (parts.length !== 3) {
      return null;
    }

    const [serviceName, module, eventName] = parts;

    if (!serviceName || !module || !eventName) {
      return null;
    }

    return {
      serviceName,
      module,
      eventName,
    };
  }

  /**
   * Определяет канал для отправки события на основе eventType
   * @param eventType Тип события в формате serviceName:module:name
   * @returns Канал Redis или null, если сервис не найден
   */
  public routeEvent(eventType: string): string | null {
    const route = this.parseEventType(eventType);

    if (!route) {
      return null;
    }

    const channel = this.serviceRegistry.getChannel(route.serviceName);

    if (!channel) {
      return null;
    }

    return channel;
  }

  /**
   * Проверяет, что eventType соответствует формату serviceName:module:name
   */
  public isValidEventFormat(eventType: string): boolean {
    return this.parseEventType(eventType) !== null;
  }

  /**
   * Извлекает serviceName из eventType
   */
  public getServiceName(eventType: string): string | null {
    const route = this.parseEventType(eventType);
    return route ? route.serviceName : null;
  }
}
