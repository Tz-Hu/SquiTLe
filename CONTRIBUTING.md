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

## 发布版本

`package.json` 的 `version` 是应用版本，GitHub Release 标签使用对应的 `v<version>`。
发布前先更新包版本（不带 `v`），并执行：

```bash
pnpm check:version v<version>
pnpm check
```

提交版本更新后，为该提交创建并推送对应标签；确认标签的 CI 通过后再发布 GitHub Release。
CI 在 `v*` 标签推送和 Release 发布时读取该标签的代码，严格比较标签与包版本；不匹配时失败。
Release 发布事件的检查是事后校验，不能阻止手动发布，因此发布前必须确认标签 CI 成功。

当前 `pnpm-lock.yaml` 不保存根包版本；仅调整应用版本时无需修改锁文件。
已发布的历史标签保持不变，v0.3.1、v0.3.2 中遗留的包版本不追溯修改。
