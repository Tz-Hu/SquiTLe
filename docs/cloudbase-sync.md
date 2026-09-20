# Squitle CloudBase 同步方案

## 已确定的产品边界

- 本地模式始终可用，不要求注册账号。
- 用户主动开启云同步时才登录。
- 第一版只同步同一用户自己的设备，不提供分享和多人协作。
- 网站使用 CloudBase 默认 `tcloudbaseapp.com` 地址，不购买域名，不建立双区域后端。
- 中国大陆环境是唯一数据源；海外设备连接同一环境。

## 数据所有权与版本

本地 `ScheduleDocument.revision` 只表示当前设备保存文档的次数。云端另外维护单调递增的 `serverRevision`，两者禁止混用。

云端文档记录包含：

```ts
type CloudScheduleRecord = {
  ownerId: string;
  documentId: string;
  serverRevision: number;
  updatedAt: string;
  document: ScheduleDocument;
};
```

客户端保存上次同步检查点：`documentId`、`serverRevision`、同步时文档指纹和同步时间。上传必须携带预期的 `serverRevision`，云函数在事务中比较后再写入并加一。

## 同步状态转换

| 本地变化 | 云端变化 | 行为 |
|---|---|---|
| 否 | 否 | 保持当前状态 |
| 是 | 否 | 条件上传 |
| 否 | 是 | 下载云端文档 |
| 是 | 是 | 停止自动同步并提示冲突 |

首次开启同步时，如果云端为空，上传本地文档。如果云端已有不同文档，要求用户明确选择本地或云端版本，任何一方都不会被静默覆盖。

## CloudBase 资源

创建一个中国大陆 CloudBase 环境，并启用：

1. 静态网站托管；
2. 身份认证；
3. 云数据库；
4. 一个同步云函数；
5. 云存储，用于后续 macOS 安装包与更新清单。

数据库集合名为 `squitle_documents`。读写只经过云函数；客户端不直接获得任意数据库写权限。云函数从已验证登录上下文取得 `ownerId`，禁止客户端提交或替换所有者身份。

## 后续接入所需配置

CloudBase 环境创建后，需要把以下公开配置加入网页和桌面构建：

```text
NEXT_PUBLIC_CLOUDBASE_ENV_ID=
NEXT_PUBLIC_CLOUDBASE_REGION=
NEXT_PUBLIC_CLOUDBASE_ACCESS_KEY=
NEXT_PUBLIC_SQUITLE_SYNC_FUNCTION=squitle-sync
```

`NEXT_PUBLIC_CLOUDBASE_ACCESS_KEY` 使用控制台生成的 Publishable Key。服务端私钥和管理凭据不得使用 `NEXT_PUBLIC_` 前缀，也不得提交到 Git。
