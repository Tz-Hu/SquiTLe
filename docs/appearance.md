# 外观系统

`app/tokens.css` 定义主题颜色、字体、间距、透明度、边框和动效变量，`app/globals.css` 负责产品布局与组件样式。

`lib/presentation/appearance.ts` 保存可配置外观默认值、范围和事项几何；`table-colors.ts` 与 `color-presets.ts` 管理表格和主题预设。事项条、连接端点和路由障碍使用同一套几何参数。

设置中可调整主题、事项高度与圆角、完成透明度、折叠项目颜色、连线样式、周末显示和工作类型颜色。用户自定义值随 TimeLine 数据持久化。

Inter Variable 字体位于 `public/fonts/`，许可证与字体文件一同保留。
