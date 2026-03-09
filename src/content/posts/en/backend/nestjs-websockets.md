---
title: NestJS WebSockets Reference
description: Complete reference for implementing WebSocket functionality in NestJS.
date: 2026-01-23T00:00:00.000Z
updated: 2026-01-23T00:00:00.000Z
tags:
  - backend
  - nestjs
  - websockets
  - work
category: backend
draft: false
lang: en
references:
  - url: 'https://docs.nestjs.com/websockets/gateways'
    title: Gateways — NestJS WebSockets Documentation
    type: official
---

## Basic Gateway

```typescript
@WebSocketGateway(80, { namespace: "events" })
export class EventsGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage("events")
  handleEvent(@MessageBody() data: string): string {
    return data;
  }
}
```

## Configuration Options

```typescript
// Port and namespace
@WebSocketGateway(80, { namespace: 'events' })

// Transport options
@WebSocketGateway(81, { transports: ['websocket'] })
```

## Message Handlers

### Recommended: @MessageBody()

```typescript
@SubscribeMessage('events')
handleEvent(@MessageBody() data: string): string {
  return data;
}
```

### Returning WsResponse

```typescript
@SubscribeMessage('events')
handleEvent(client: Client, data: unknown): WsResponse<unknown> {
  return { event: 'events', data };
}
```

## Redis Adapter (Multi-Instance Support)

```bash
npm i --save redis socket.io @socket.io/redis-adapter
```

```typescript
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;

  async connectToRedis(): Promise<void> {
    const pubClient = createClient({ url: `redis://localhost:6379` });
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }
}
```

Apply in main.ts:

```typescript
const redisIoAdapter = new RedisIoAdapter(app);
await redisIoAdapter.connectToRedis();
app.useWebSocketAdapter(redisIoAdapter);
```

## Authentication Guard

```typescript
@Injectable()
export class WsAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const client = context.switchToWs().getClient();
    const token =
      client.handshake?.auth?.token || client.handshake?.query?.token;

    if (!token) {
      throw new WsException("MISSING_TOKEN");
    }

    try {
      const decoded = this.jwtService.verify(token);
      client.data.userId = decoded.userId;
      return true;
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        throw new WsException("EXPIRED_TOKEN");
      }
      throw new WsException("INVALID_TOKEN");
    }
  }
}
```

## Exception Handling

```typescript
// Throwing exceptions
throw new WsException("Invalid credentials.");

// Custom filter
@Catch(WsException)
export class WsExceptionFilter {
  catch(exception: WsException, host: ArgumentsHost) {
    const client = host.switchToWs().getClient();
    client.emit("error", {
      code:
        typeof exception.getError() === "string"
          ? exception.getError()
          : "INTERNAL_ERROR",
      message: exception.message
    });
  }
}
```

## Validation with Pipes

```typescript
@UsePipes(new ValidationPipe({
  exceptionFactory: (errors) => new WsException(errors)
}))
@SubscribeMessage('events')
handleEvent(@MessageBody() dto: CreateMessageDto): WsResponse<unknown> {
  return { event: 'message-created', data: dto };
}
```

## Common Patterns

### User Room Subscription

```typescript
handleConnection(client: Socket) {
  const userId = client.data.userId;
  client.join(`user:${userId}`);
}

notifyUser(userId: number, data: any) {
  this.server.to(`user:${userId}`).emit('notification', data);
}
```

### Broadcast to Namespace

```typescript
@WebSocketGateway({ namespace: "chat" })
export class ChatGateway {
  @WebSocketServer()
  server: Server;

  broadcastMessage(message: string) {
    this.server.emit("message", message);
  }
}
```

## Best Practices

1. **Authentication**: Extract JWT from handshake, use specific error codes
2. **Error Handling**: Always use `WsException`, provide structured responses
3. **Multi-Instance**: Use Redis adapter for broadcasting across containers
4. **Testing**: Prefer `@MessageBody()` for easier testing
