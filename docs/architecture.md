# Squitle 架构

## 设计边界

Squitle 使用同一份 `ScheduleDocument` 驱动本地保存和云同步，事项、轨道、依赖、存储和同步规则保持一致。

## 分层

- `app/`：框架路由、页面入口和服务端 API。`app/page.tsx` 只挂载主应用。
- `features/`：用户可见功能及交互状态。当前以时间轴和 TodoList 为主要边界。
- `components/`：跨功能复用的 Provider、字段和基础 UI。
- `lib/domain/`：纯业务规则，不依赖 React。
- `lib/persistence/`：版本化文档、本地读写和多个 TimeLine 的索引。
- `lib/sync/`：统一同步状态机与不同服务适配器。
- `lib/presentation/`：布局、颜色、日期显示、连线路由和翻译。
- `db/`、`drizzle/`：Sites D1 数据定义和迁移。

## 依赖方向

`app` 和 `features` 可以依赖 `components` 与 `lib`；`lib` 不依赖界面层。同步适配器依赖版本化文档，业务规则不依赖任何云服务。

## 主入口

`app/page.tsx` 负责 Provider 和 `TimelineApp` 的组合。时间轴示例数据、连线路由与主要交互分别位于 `features/timeline/`，避免路由文件再次演变成业务单体。
