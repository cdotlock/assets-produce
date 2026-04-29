# SSE 连接与状态更新修复

## 问题描述
SSE（Server-Sent Events）连接可能永远无法建立或中途断开，但任务仍在后台执行，同时状态也不再更新，导致 UI 卡死在"running"状态。

## 根因分析

### 1. pushEvent 串行队列死锁
**问题**：`pushEvent` 使用串行队列确保事件按序写入 DB，但如果某个 `prisma.taskEvent.create()` 失败或永远不 resolve，整个队列永久阻塞。

**影响**：后续所有事件（delta、tool、done 等）无法发送，客户端永远收不到更新，UI 卡在 loading 状态。

**原修复前代码**：
```typescript
function pushEvent(taskId: string, type: string, data: Prisma.InputJsonValue): Promise<TaskEventRow> {
  const prev = pushQueues.get(taskId) ?? Promise.resolve();
  const next = prev.then(async () => {
    const row = await prisma.taskEvent.create({ data: { taskId, type, data } });
    emitter.emit(`event:${taskId}`, row);
    return row;
  });
  pushQueues.set(taskId, next);
  return next;
}
```

**修复后**：
- 添加 `.catch()` 捕获 DB 写入错误
- 即使写入失败，也通过 EventEmitter 发送事件（使用临时 ID）
- 记录错误日志，但不阻塞队列

### 2. 客户端错误处理缺失
**问题**：EventSource 的 `error` 事件监听器只处理带 `data` 的 MessageEvent，但连接错误（网络断开、超时等）通常是普通的 Event，导致错误被忽略。

**影响**：连接断开后，UI 仍然显示"running"，用户无法得知发生了什么。

**修复**：
- 区分处理两种错误：
  - 服务端发送的错误事件（MessageEvent with data）
  - 连接错误（readyState === CLOSED）
- 连接错误时主动关闭连接，重置状态，显示错误提示

### 3. 服务端异常静默吞掉
**问题**：SSE stream 中的异常被空 `catch {}` 吞掉，客户端无法得知服务端发生了什么。

**修复**：
- 记录服务端错误日志
- 尝试发送错误事件给客户端（best effort）
- 添加心跳机制（每 30 秒发送一次），保持连接活跃

### 4. 缺少连接存活检测
**问题**：长时间无事件时（如复杂任务执行中），无法检测连接是否仍然存活。

**修复**：
- 服务端：每 30 秒发送心跳（命名事件 `heartbeat`）
- 客户端：每 15 秒检查一次，如果 90 秒内没有收到任何消息（包括心跳），认为连接已死，主动关闭并显示错误

### 5. 心跳机制 bug
**问题**：服务端发送的心跳是 SSE 注释 (`: heartbeat\n\n`)，但 SSE 注释不会触发任何 EventSource 事件，导致客户端无法更新 `lastMessageTime`，最终误报超时。

**修复**：
- 服务端：将心跳改为命名事件 `toSse(Date.now(), "heartbeat", {})`
- 客户端：添加 `heartbeat` 事件监听器，调用 `touchLastMessageTime()`

## 修改清单

### 后端修改
1. **src/lib/services/task-service.ts**
   - `pushEvent()` 添加错误捕获和 fallback 发送
   - 所有 `void pushEvent()` 调用改为显式 `.catch()`
   - onKeyResource 回调添加错误处理链

2. **src/app/api/tasks/[id]/events/route.ts**
   - 添加心跳计时器（30 秒间隔）
   - catch 块记录错误日志并尝试发送错误事件给客户端
   - finally 清理心跳计时器

### 前端修改
1. **src/app/components/hooks/useTaskStream.ts**
   - 添加连接超时检测（90 秒无消息 → 视为死连接）
   - 所有事件监听器调用 `touchLastMessageTime()`
   - error 事件监听器区分两种错误类型
   - done/error/stopStreaming/unmount 时清理超时计时器
   - 添加 `timeoutCheckIntervalRef` ref 存储计时器句柄

## 验证步骤

### 1. 正常流程测试
```bash
# 启动服务
pnpm dev

# 发送任务，观察正常完成
curl -X POST http://localhost:8001/api/tasks \\
  -H "Content-Type: application/json" \\
  -d '{"message":"测试任务","sessionId":"test-session"}'
```
**预期**：任务正常执行，UI 显示 running → done，无任何错误。

### 2. DB 写入失败测试
```bash
# 模拟 DB 故障：停止 PostgreSQL
docker-compose stop db

# 发送任务
curl -X POST http://localhost:8001/api/tasks \\
  -H "Content-Type: application/json" \\
  -d '{"message":"测试DB故障","sessionId":"test-session"}'
```
**预期**：
- 服务端日志显示 pushEvent 错误
- 客户端仍能收到事件（通过内存 fallback）
- 任务继续执行不受影响

### 3. 网络中断测试
```bash
# 发送长任务
curl -X POST http://localhost:8001/api/tasks \\
  -H "Content-Type: application/json" \\
  -d '{"message":"生成一个 1000 字的小说","sessionId":"test-session"}'

# 在任务执行中途：断开网络或停止 nginx
docker-compose stop nginx
```
**预期**：
- 客户端 90 秒内未收到心跳，自动关闭连接
- UI 显示"连接超时，请刷新页面重试"
- 任务在后台继续执行完成

### 4. 长时间静默测试
```bash
# 发送一个需要很长时间但输出很少的任务（如复杂计算）
curl -X POST http://localhost:8001/api/tasks \\
  -H "Content-Type: application/json" \\
  -d '{"message":"计算斐波那契数列第 10000 项","sessionId":"test-session"}'
```
**预期**：
- 即使长时间无输出，客户端每 30 秒收到心跳
- 连接保持活跃，不会超时断开

### 5. 手动停止测试
```bash
# 发送任务后立即点击"停止"按钮
```
**预期**：
- 超时计时器被清理
- EventSource 正确关闭
- 无内存泄漏（检查浏览器 devtools）

## 监控建议

### 服务端日志关键词
```bash
# 监控 pushEvent 失败
grep "pushEvent.*failed" logs/app.log

# 监控 SSE 连接问题
grep "SSE.*error" logs/app.log

# 监控客户端断连
grep "client disconnected" logs/app.log
```

### 客户端 Console 关键词
```bash
# 浏览器 console
[task:xxx] EventSource error event
[task:xxx] No message received for Xms, considering connection dead
[task:xxx] EventSource connection closed unexpectedly
```

## 回滚方案
如果修复引入新问题，回滚步骤：
```bash
git revert <commit-hash>
pnpm install
pnpm build
pm2 restart all
```

## 未来优化方向
1. **重连机制**：EventSource 自动重连，但可能需要优化重连策略（指数退避）
2. **状态恢复**：重连后从 Last-Event-ID 恢复，但需要确保 DB 中事件的持久性
3. **监控告警**：添加 Prometheus metrics，监控事件队列深度、连接存活时长等
4. **降级策略**：当 SSE 不可用时，fallback 到 long-polling
