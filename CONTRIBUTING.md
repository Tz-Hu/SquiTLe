# Contributing

## 开发原则

- 业务规则放在 `lib/domain/`，界面状态和交互放在 `features/`。
- 本地保存始终可用；同步功能不得成为使用核心功能的前置条件。
- 修改文档格式时同步提升数据版本、提供迁移并补充测试。
- 同一条业务规则只保留一个实现入口，避免界面层重复实现。

## 提交前检查

```bash
pnpm check
```

请勿提交 `node_modules/`、`dist/`、`.next/`、`.wrangler/`、`.sites-runtime/`、构建产物或本地环境变量。
