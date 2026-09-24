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

## 时间轴视口与滚动

`TimelineApp` 只负责 hydration 占位，完成后挂载 `TimelineWorkspace`。工作区的尺寸监听与实际 DOM 同时挂载；首次布局立即测量时间轴宽度和顶部栏高度，后续由 `ResizeObserver` 跟踪窗口、侧栏等布局变化。折叠占位、月份标题和连接点裁剪共用测量后的视口宽度。

触控板在时间窗口内部使用浏览器原生滚动，包括斜向手势与惯性产生的滚动事件。只有越过有限滚动区边界时，`wheelBoundaryPan` 才接管该次位移：保留完整日期偏移，并按整列补充前后缓冲。`Ctrl+wheel` 留给浏览器缩放。鼠标按住空白拖动继续使用已有的逐帧平移逻辑。

回归验证除了 `tests/pan.test.ts` 的位移不变量，还应检查真实浏览器：首次加载后的测量宽度等于 `clientWidth`；展开/关闭设置侧栏后宽度同步变化；屏幕外事项标记始终位于左右可见边界；从最左端向过去滚动、连续换向、日/周/月切换均保持日期和事项对齐。Mac 触控板惯性的实际手感需要在 Mac 上验收，远程鼠标滚动不能替代。
