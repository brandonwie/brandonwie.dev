---
title: "NestJS WebSocket 레퍼런스"
description: "NestJS에서 WebSocket 기능을 구현하기 위한 종합 레퍼런스."
date: 2026-01-23T00:00:00.000Z
updated: 2026-01-23T00:00:00.000Z
tags:
  - backend
  - nestjs
  - websockets
  - work
category: backend
draft: false
lang: ko
source_lang: en
source_slug: nestjs-websockets
source_updated: "2026-01-23"
translation_date: "2026-03-04"
references:
  - url: "https://docs.nestjs.com/websockets/gateways"
    title: Gateways — NestJS WebSockets Documentation
    type: official
---

## 기본 Gateway

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

## 설정 옵션

```typescript
// 포트와 namespace
@WebSocketGateway(80, { namespace: 'events' })

// Transport 옵션
@WebSocketGateway(81, { transports: ['websocket'] })
```

## 메시지 핸들러

### 권장: @MessageBody()

```typescript
@SubscribeMessage('events')
handleEvent(@MessageBody() data: string): string {
  return data;
}
```

### WsResponse 반환

```typescript
@SubscribeMessage('events')
handleEvent(client: Client, data: unknown): WsResponse<unknown> {
  return { event: 'events', data };
}
```

## Redis Adapter(다중 인스턴스 지원)

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

main.ts에서 적용:

```typescript
const redisIoAdapter = new RedisIoAdapter(app);
await redisIoAdapter.connectToRedis();
app.useWebSocketAdapter(redisIoAdapter);
```

## 인증 Guard

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

## 예외 처리

```typescript
// 예외 발생
throw new WsException("Invalid credentials.");

// 커스텀 필터
@Catch(WsException)
export class WsExceptionFilter {
  catch(exception: WsException, host: ArgumentsHost) {
    const client = host.switchToWs().getClient();
    client.emit("error", {
      code:
        typeof exception.getError() === "string"
          ? exception.getError()
          : "INTERNAL_ERROR",
      message: exception.message,
    });
  }
}
```

## Pipe를 이용한 유효성 검사

```typescript
@UsePipes(new ValidationPipe({
  exceptionFactory: (errors) => new WsException(errors)
}))
@SubscribeMessage('events')
handleEvent(@MessageBody() dto: CreateMessageDto): WsResponse<unknown> {
  return { event: 'message-created', data: dto };
}
```

## 일반적인 패턴

### 사용자 Room 구독

```typescript
handleConnection(client: Socket) {
  const userId = client.data.userId;
  client.join(`user:${userId}`);
}

notifyUser(userId: number, data: any) {
  this.server.to(`user:${userId}`).emit('notification', data);
}
```

### Namespace로 브로드캐스트

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

## 모범 사례

1. **인증**: handshake에서 JWT를 추출하고 구체적인 에러 코드를 사용하세요
2. **에러 처리**: 항상 `WsException`을 사용하고 구조화된 응답을 제공하세요
3. **다중 인스턴스**: 컨테이너 간 브로드캐스팅에 Redis adapter를 사용하세요
4. **테스트**: 테스트하기 쉬운 `@MessageBody()`를 선호하세요
