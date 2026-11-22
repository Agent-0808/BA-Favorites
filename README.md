# BA 角色人气排序

基于 [Favorite Picker](https://github.com/ndrwh/favorite-picker) 改造的《蔚蓝档案》角色人气排序工具。通过反复从一批角色中选出更喜欢的角色，逐轮淘汰，最终得到完整的人气排名。

角色数据来自 [BA-characters-internal-id](https://github.com/Agent-0808/BA-characters-internal-id)，以外置 JSON 的形式加载，名称使用 `family_name` / `given_name` 的 kivo 译名。

## 功能

- 347 个角色（含 NPC），按角色粒度参与排序
- 学校多选、仅可玩学生、仅国服已实装三种筛选条件
- BA 风格斜切卡片：固定尺寸头像、底部半透明名称条、悬停与选中高亮
- 进度条显示已筛选 / 总候选、剩余候选，以及预计还需多少次选择
- 已选列表显示排名，支持拖拽排序
- 自动保存到 localStorage，刷新后继续；支持 Undo / Redo / 重置

## 开发

需要 Node.js 20 及以上。

```bash
npm install
npm run dev       # 开发服务器
npm run build     # 类型检查 + 生产构建，输出到 dist/
npm run preview   # 预览生产构建
```

构建产物是纯静态文件，可直接部署到 GitHub Pages 等静态托管。`base` 已设置为相对路径，不需要额外配置。

## 部署

仓库包含 `.github/workflows/pages.yml`，推送到 `master` 或手动触发 workflow 时会自动构建并发布到 GitHub Pages。

首次部署前，需要在仓库的 **Settings → Pages → Build and deployment** 中将 **Source** 设为 **GitHub Actions**。

站点地址：<https://agent-0808.github.io/favorite-picker/>

## 数据

角色数据位于 `public/data/`，构建时会原样复制到 `dist/data/`：

- `students.json`：角色与皮肤页数据
- `schools.json`：学校名称与徽标

更新上游数据快照：

```bash
npm run update-data
```

数据映射在 [src/data/ba.ts](src/data/ba.ts) 中完成：每个角色生成一个 item，头像取基础形态页并补全 `https:` 协议，没有头像的条目会被跳过。

## 配置

- [src/config.ts](src/config.ts)：数据 URL、localStorage key、历史长度、默认批次大小与筛选默认值
- [src/core/types.ts](src/core/types.ts)：`PickerItem`、`PickerSettings`、`BaItem`、`BaSettings` 等类型
- [src/core/picker.ts](src/core/picker.ts)：从原版 `picker.js` 移植的排序算法与撤销历史，行为保持一致

筛选条件通过 `shouldIncludeItem` 实现，进度计算基于状态快照中的 `eliminated`、`survived`、`current`、`evaluating`、`favorites` 五组数据。

## 目录

```
index.html
src/
  main.ts                启动、数据加载、筛选绑定
  config.ts              项目配置
  core/picker.ts         排序算法（Picker / PickerState）
  core/types.ts          类型定义
  data/ba.ts             students.json → PickerItem
  ui/pickerView.ts       卡片网格、进度、已选列表、拖拽
  ui/schoolFilter.ts     学校多选下拉
  styles/                设计变量与组件样式
public/data/             外置角色数据
scripts/update-data.mjs  更新数据快照
legacy/                  旧版 JavaScript 实现，仅供对照，不参与构建
```

## 致谢

- [Favorite Picker](https://github.com/ndrwh/favorite-picker)：原始排序算法与交互设计
- [BA-characters-internal-id](https://github.com/Agent-0808/BA-characters-internal-id)：角色与学校数据
