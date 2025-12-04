# Kraftek Socket Gateway

WebSocket Gateway служит единой точкой подключения для клиентов и маршрутизирует события между сервисами

## Архитектура

```
Client → Gateway → Auth Check → Room Cache → Redis Pub/Sub → Service
   ↑         ↓                                      ↓
   └─────────┴─ Redis Room Cache ←─────────────────┘
```

## Применение

WebSocket Gateway выполняет следующие функции:

- Маршрутизирует запросы между сервисами через брокер очередей
- Держит пул сокет соединений с клиентами
- При первом запросе отправляет запросы в auth на проверку авторизации и доступов - сохраняет в кеше доступы и токен пользователя (при изменении доступов, auth очищает кеш)
- Добавляет к клиентскому пакету пользователя userId
- **Маршрутизирует события на основе формата `serviceName:module:name`

## Система маршрутизации событий

### Формат событий

Все события используют унифицированный формат: `serviceName:module:name`

Примеры:
- `stickyNotes:note:create` - создание заметки
- `stickyNotes:note:move` - перемещение заметки
- `chat:message:send` - отправка сообщения в чате
- `whiteboard:shape:draw` - рисование на whiteboard

### Компоненты

#### ServiceRegistry
Управляет регистрацией сервисов и их каналами Redis:

```typescript
const serviceRegistry = new ServiceRegistry();
serviceRegistry.registerService('stickyNotes', 'events:stickyNotes');
serviceRegistry.registerService('chat', 'events:chat');
```

#### EventRouter
Маршрутизирует события к соответствующим сервисам:
- Парсит eventType (`stickyNotes:note:create`)
- Извлекает serviceName (`stickyNotes`)
- Находит канал Redis (`events:stickyNotes`)
- Публикует событие в канал сервиса


### Добавление нового сервиса

В `src/server.ts`:
```typescript
const serviceRegistry = new ServiceRegistry();
serviceRegistry.registerService('myService', 'events:myService');
```

Gateway будет маршрутизировать события `myService:*:*` в канал `events:myService`.

### Валидация

Gateway автоматически валидирует:
- Формат события должен быть `serviceName:module:name`
- Сервис должен быть зарегистрирован в ServiceRegistry

При ошибке клиент получит:
```typescript
{
  code: 'INVALID_EVENT',
  message: 'Event type is not valid or service is not registered'
}
```

## Диаграммы

- [Последовательность подключения](./connectionSequence.mermaid)

