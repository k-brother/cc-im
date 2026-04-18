---
name: pending-bugs-tofix
description: 待修复的 bug 列表，来自 2026-04-18 全仓扫描
type: reference
---

# 待修复 Bug（按优先级）

## 高优先级

### Bug 6: ApprovalManager senders 参数类型不匹配
- **文件**: `src/access/approval-manager.ts:24-27`
- **问题**: 构造函数签名是 `Map<Platform, ApprovalSender>`，但实际调用时只传入了单平台 sender（`new Map([['feishu', approvalSender]])`）。类型不一致但能运行。
- **调用处**:
  - Feishu: `new Map([['feishu', approvalSender]])`
  - Telegram: `new Map([['telegram', approvalSender]])`
  - WeCom: `new Map([['wecom', approvalSender]])`
  - Dingtalk: `new Map([['dingtalk', approvalSender]])`
- **修复方案**: 修改 ApprovalSender 接口或调整调用方式，使类型一致

### Bug 4: Timer 清理顺序问题
- **文件**: `src/index.ts:366-369,376`
- **问题**: `imageCleanupTimer` 使用 `unref()` 后再 `clearInterval`，可能不正确清理
- **代码**:
```typescript
const imageCleanupTimer = setInterval(...);
imageCleanupTimer.unref();

// shutdown 顺序:
clearInterval(imageCleanupTimer);  // Line 376
closeLogger();                    // Line 396
```

## 中优先级

### Bug 5: Telegram cooldownCleanupTimer 未清理
- **文件**: `src/telegram/message-sender.ts:24,32`
- **问题**: `cooldownCleanupTimer` 在模块级别创建并 `unref()`，但 shutdown 时没有任何代码清理它
- **对比**: 其他平台的定时器都有对应的清理逻辑
- **修复方案**: 在 shutdown 时清理此定时器，或暴露清理函数

### Bug 3: Promise rejection 静默吞掉（部分）
- **文件**: `src/index.ts:363-364,367,381`
- **问题**: 多处 `.catch(() => {})` 导致错误难以追踪
- **说明**: 大部分是故意的（后台任务不影响主流程），但需要评估哪些可以改进日志
- **已修复**: `cleanOldImages` 的静默吞错已改为记录日志

## 低优先级（设计决策）

### Bug 9: SessionManager.save 错误处理不一致
- **文件**: `src/session/session-manager.ts`
- **问题**: `save` 用 try-catch 只 log 不 throw，但 `flushSync` 会 throw
- **说明**: 这是设计决策 - 异步保存失败静默（日志记录后下次重试），同步保存是关键时刻需要抛出
- **决定**: 保持现状

### Bug 10: 测试 mock 使用 Partial<any> 绕过类型检查
- **文件**: `tests/unit/shared/claude-task.test.ts:42-51`
- **问题**: `makeConfig` 使用 `Partial<any>`，无法发现 PrivilegedConfig 相关类型问题
- **修复方案**: 使用正确的 Config 类型替代 `Partial<any>`
