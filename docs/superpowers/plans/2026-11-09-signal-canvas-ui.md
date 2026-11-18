# Signal Canvas UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 ML Fieldbook 全站重构为 Signal Canvas：保留真实学习闭环，用清晰布局、可读排版、教材式注释和有节制的轨迹动效统一 Welcome 之后的学习体验。

**Architecture:** 沿用现有 React 路由、TanStack Query 数据与 CSS 层，不新增运行时依赖。先建立共享排版令牌、`Annotation` 和 `SignalTrail`，再按页面迁移；`global.css` 负责基础与通用组件，`signal.css` 负责应用框架和 Signal Canvas 页面，`lesson.css`/`welcome.css` 保留各自职责。

**Tech Stack:** React 19、TypeScript、React Router 7、TanStack Query 5、Vite 7、Vitest 5、CSS、KaTeX、Lucide、现有 Three.js。

**Spec:** `docs/superpowers/specs/2026-11-09-signal-canvas-ui-design.md`

## Global Constraints

- 不新增运行时依赖，不修改 FastAPI、SQLite、内容 JSON、API 字段或学习状态计算。
- Welcome `/` 与 `/welcome` 保留；学习路由 `/today`、`/learn`、`/learn/:slug`、`/foundations`、`/foundations/:slug`、`/practice`、`/progress`、`/journal`、`/diagnostic` 不变。
- 长文正文 17–18px；普通界面正文 16–17px；功能辅助文字和注释 14–15px；导航与按钮 15–17px；不新增 10–13px 功能文字。
- 中文是导航和功能的主要标签，英文只作装饰性眉题；关键知识不依赖 hover。
- 320/390/768/1024/1440/1920px 无页面级横向溢出，触控目标至少 44×44px，满足 WCAG 2.2 AA 和 reduced-motion。
- 完成、作答、错题、分钟和诊断状态继续只来自真实事件；空数据显示证据不足，不生成演示学习数据。
- 普通 Practice 不新增提示或补救 API；Concept 反思复用日期 Journal；来源不暗示不存在的逐条 claim-level 映射。
- 当前目录不是 Git 仓库：不要初始化仓库，不执行提交步骤；每个任务以测试通过和变更清单作为检查点。
- 浏览器验收继续使用当前 8000 端口服务；构建后检查生产静态资源，不启动替代服务器。

## Review Focus

1. **空数据与加载/失败：** 页面不能把 0 分钟、0 作答或未诊断渲染成完成或掌握；Task 2、3、7 的静态/浏览器测试必须覆盖。
2. **键盘与深链：** 本章目录、命令面板、作答、自测和日志保存不能因 DOM 重排失效；Task 2、4、5、8 分别验证焦点、hash 和键盘路径。
3. **窄屏与长内容：** 长公式、代码、中文标题、筛选器和底部导航不能造成整页横向滚动；Task 4、6、8 用 320px 与长公式验证。
4. **减少动态与触屏：** 正文阅读不依赖动画，Welcome 保持静态降级，应用转场不阻塞操作；Task 2、4、8 检查 computed animation 和交互。
5. **答案与记录完整性：** 普通练习提交前不得出现正确答案，诊断不得写入概念 attempts，日志仍需真实保存；Task 5、7、8 走完整流程并核对 API/UI 状态。

---

### Task 1: 设计令牌与共享学习组件

**Files:**
- Modify: `frontend/src/styles/global.css`（文件头部令牌、基础排版、按钮和注释样式）
- Modify: `frontend/src/components/ui.tsx:5-26`
- Create: `frontend/src/components/learning/Annotation.tsx`
- Create: `frontend/src/components/learning/SignalTrail.tsx`
- Test: `frontend/src/components/learning/primitives.test.tsx`

**Interfaces:**
- Produces: `Annotation({ tone?: 'note' | 'misconception' | 'source'; title: string; children: ReactNode })`，渲染语义化 `<aside>` 和中文类型标签。
- Produces: `SignalTrailItem = { id: string; label: string; meta?: string; state: 'pending' | 'current' | 'complete'; href?: string }`。
- Produces: `SignalTrail({ items: SignalTrailItem[]; label: string; onSelect?: (id: string) => void })`；有 `onSelect` 时用 button，有 `href` 时用 Link，否则用普通文本；当前项带 `aria-current="step"`。

- [ ] **Step 1: 写失败的共享组件测试。** 用现有 `react-dom/server.renderToStaticMarkup`、Vitest 和 `MemoryRouter`，断言 Annotation 输出中文标签/正文，SignalTrail 输出有序列表、真实 `meta`、完成状态和 `aria-current="step"`；不得接收或生成掌握率。
- [ ] **Step 2: 运行测试确认失败。** 运行 `npm test -- --run frontend/src/components/learning/primitives.test.tsx`，预期因模块不存在而 FAIL。
- [ ] **Step 3: 实现两个组件和 PageHeader 结构。** 保持 PageHeader 现有 props 不变，只增加清晰的标题/描述/动作容器；组件不请求 API，不自行计算学习状态。
- [ ] **Step 4: 建立排版与色彩令牌。** 使用现有 violet `#6757e7`、lime `#d9f99d`、ink `#0d1412`；定义页面标题、正文、注释、间距、内容宽度和 240–420ms 转场令牌，清除通用功能样式中的微型字号。
- [ ] **Step 5: 验证。** 重跑上述测试预期 PASS，再运行 `npm test -- --run` 和 `npm run build`；记录检查点，不执行 Git 提交。

### Task 2: 应用框架、导航与搜索

**Files:**
- Modify: `frontend/src/components/AppShell.tsx`
- Modify: `frontend/src/components/CommandPalette.tsx`
- Modify: `frontend/src/styles/global.css`
- Modify: `frontend/src/styles/signal.css`（导航、页面画布、移动底栏）
- Test: `frontend/src/components/AppShell.test.tsx`

**Interfaces:**
- Consumes: Task 1 的排版/间距/动效令牌。
- Preserves: 六个主导航、Ctrl/Cmd+K、路由 Outlet、ScrollProgress、route announcer 和移动菜单。

- [ ] **Step 1: 写失败的框架测试。** 用 SSR + MemoryRouter 断言桌面和移动导航都含“今日学习、学习路径、概念库、理解检验、学习进度、学习日志”，搜索按钮具有明确中文 accessible name；英文不是唯一导航标签。
- [ ] **Step 2: 运行测试确认失败。** 运行 `npm test -- --run frontend/src/components/AppShell.test.tsx`，确认新断言在旧结构上失败。
- [ ] **Step 3: 重排 AppShell。** 桌面顶栏约 72–80px，导航 15px；品牌、导航、搜索和今日记录按同一轴线布局。移动底栏标签 13–14px，图标+文字整体至少 44px。
- [ ] **Step 4: 统一页面画布和转场。** 主内容最大宽度约 1440px，采用稳定 12 列容器；路由转场 240–420ms，不引入持续正文动效。
- [ ] **Step 5: 浏览器验证框架。** 检查六个路由、Ctrl/Cmd+K、上下键/Enter/Esc、焦点恢复、移动底栏和 200% 缩放；reduced-motion 下取消非必要动画。
- [ ] **Step 6: 回归。** 运行框架测试、全量前端测试和构建，保存桌面/移动截图；记录检查点。

### Task 3: 今日学习主路径与章节路径

**Files:**
- Modify: `frontend/src/pages/TodayPage.tsx`
- Modify: `frontend/src/components/DailyBrief.tsx`
- Modify: `frontend/src/pages/LearnPage.tsx`
- Create: `frontend/src/components/learning/LearningPath.tsx`
- Modify: `frontend/src/styles/signal.css`
- Test: `frontend/src/components/learning/LearningPath.test.tsx`
- Test: `frontend/src/components/DailyBrief.test.tsx`

**Interfaces:**
- Consumes: `Bootstrap`、`DailyPlan`、`ConceptSummary` 和 Task 1 的 `SignalTrail`。
- Produces: `LearningPath({ concepts }: { concepts: ConceptSummary[] })`，只呈现已有先修顺序和真实 `completed_sections/total_sections/status`。
- Preserves: `suggestedStepIndex` 的推进规则、真实步骤链接、诊断邀请和完成标准。

- [ ] **Step 1: 写失败的主路径测试。** 构造空数据和部分完成 fixture：DailyBrief 仍显示真实步骤与 CTA，未完成项不带完成语义；LearningPath 输出三章顺序、概念标题、真实小节计数，不输出掌握率。
- [ ] **Step 2: 运行两个测试确认失败。** 运行 `npm test -- --run frontend/src/components/learning/LearningPath.test.tsx frontend/src/components/DailyBrief.test.tsx`，预期新组件缺失或旧结构不满足断言。
- [ ] **Step 3: 重构 Today。** 首屏按“今日命题 → 唯一主 CTA → 学习轨迹 → 当前任务/完成标准”排列；分钟、待复习和完成小节进入第二层摘要，路径/周活动放到第二屏。
- [ ] **Step 4: 重构 Learn。** 用三个大型章节带替代同权重卡片网格，每章包含概念图、核心问题、真实进度和进入动作；章节间轨迹表达预测→泛化→约束。
- [ ] **Step 5: 验证状态与布局。** 浏览器覆盖未诊断/已诊断、0 记录/有记录、320/768/1024/1440px；主 CTA 的 href 必须继续指向 API 给出的下一步。
- [ ] **Step 6: 回归。** 运行本任务测试、全量前端测试和构建；记录检查点。

### Task 4: 概念正文、教材注释与实验阅读

**Files:**
- Modify: `frontend/src/pages/ConceptPage.tsx`
- Modify: `frontend/src/components/LessonNarrative.tsx`
- Modify: `frontend/src/components/ConceptToolkit.tsx`
- Modify: `frontend/src/components/experiments/ExperimentPanel.tsx`（仅结构与 className）
- Modify: `frontend/src/styles/lesson.css`
- Modify: `frontend/src/styles/signal.css`
- Test: `frontend/src/components/LessonNarrative.test.tsx`

**Interfaces:**
- Consumes: Task 1 的 `Annotation` 和排版令牌。
- Preserves: `LessonContent`、`ConceptDetail`、`onComplete(minutes, metadata)`、`#section-*`、`#section-experiment` 和完成记录 mutation。

- [ ] **Step 1: 写失败的阅读结构测试。** SSR 渲染完整 LessonContent fixture，断言例题、代码、常见误解、自测顺序保留；注释具有中文标签，自测仍是原生 details/summary，答案初始不被 `open` 展开。
- [ ] **Step 2: 运行测试确认失败。** 运行 `npm test -- --run frontend/src/components/LessonNarrative.test.tsx`，记录旧结构与新语义的差异。
- [ ] **Step 3: 建立正文阅读轴。** 桌面正文 7–8 列、目录/注释 3–4 列，有效正文约 720–800px；减少嵌套卡片，把关键说明放回相关段落附近。
- [ ] **Step 4: 迁移注释与实验外观。** 注/常见误解/来源使用统一样式；实验观察区允许局部深色，但控件、单位和反馈清楚。不得改实验数学、参数或事件记录。
- [ ] **Step 5: 验证深链和阅读交互。** 测试本章目录、当前位置、自测键盘展开、代码/公式局部滚动、`#section-experiment`、完成记录；手机目录回到正文流，reduced-motion 使用即时定位。
- [ ] **Step 6: 回归。** 运行本任务测试、实验 math 测试、全量前端测试和构建；三章均检查 320–1920px 横向溢出，记录检查点。

### Task 5: 练习与诊断的聚焦作答

**Files:**
- Modify: `frontend/src/pages/PracticePage.tsx`
- Modify: `frontend/src/pages/DiagnosticPage.tsx`
- Modify: `frontend/src/styles/signal.css`
- Modify: `frontend/src/styles/global.css`
- Create: `frontend/src/components/learning/ConfidenceScale.tsx`
- Test: `frontend/src/components/learning/ConfidenceScale.test.tsx`

**Interfaces:**
- Produces: `ConfidenceScale({ value: 1 | 2 | 3 | 4 | 5; onChange: (value: 1 | 2 | 3 | 4 | 5) => void; disabled?: boolean })`。
- Consumes: 现有 `Question`、`AttemptResult`、诊断 Draft 和提交 mutation；不增加题目 hint、remediation 或 API 字段。

- [ ] **Step 1: 写失败的置信度测试。** SSR 分别渲染 value=1 和 5，断言五个按钮、中文标签和唯一 `aria-pressed="true"`；标签不能仅靠 title。
- [ ] **Step 2: 运行测试确认失败。** 运行 `npm test -- --run frontend/src/components/learning/ConfidenceScale.test.tsx`，预期模块不存在。
- [ ] **Step 3: 实现并复用 ConfidenceScale。** Practice 和 Diagnostic 保留原状态值与提交语义，只把重复 UI 提取为共享组件。
- [ ] **Step 4: 重排练习。** 当前题目和选项成为主体，顺序为作答→置信度→提交→反馈；提交后正误、解释、误解和回到概念的动作位于同一反馈区。
- [ ] **Step 5: 统一诊断。** intro/8 题/结果沿用同一排版和置信度组件，题干 focus、提示使用次数、幂等 session 和答案隐藏逻辑不变。
- [ ] **Step 6: 完整流程验证。** 普通练习提交前 DOM 不出现正确答案；按钮 pending 防重复；失败可重试；诊断完成不产生概念 attempts。键盘完成两种流程。
- [ ] **Step 7: 回归。** 运行组件测试、全量前端测试、后端 `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 .venv/bin/pytest -q`（若从 backend 运行则使用 `../.venv/bin/pytest`）和构建；记录检查点。

### Task 6: 概念库检索与词条阅读

**Files:**
- Modify: `frontend/src/pages/FoundationsPage.tsx`
- Modify: `frontend/src/styles/signal.css`
- Modify: `frontend/src/styles/global.css`
- Test: `frontend/src/pages/foundations.test.ts`

**Interfaces:**
- Preserves: `matches(term: FoundationTerm, query: string): boolean` 的中英文/摘要/定义/公式/代码说明检索语义。
- Produces: 可测试的 `filterFoundationTerms(terms, query, category)` 纯函数；页面仍使用同一 `useMemo` 数据和现有 URL 结构。

- [ ] **Step 1: 写失败的筛选测试。** 覆盖空查询、英文大小写、分类组合和无结果；无结果必须返回空数组而不是推荐不相关词条。
- [ ] **Step 2: 运行测试确认失败。** 运行 `npm test -- --run frontend/src/pages/foundations.test.ts`，预期函数尚未导出或不存在。
- [ ] **Step 3: 提取纯筛选函数并重构搜索区。** 搜索框为主操作，筛选显示选中状态和真实结果数；保留清空与无结果恢复。
- [ ] **Step 4: 重排词条和详情。** 索引使用清晰词条行或宽松双栏；详情共享正文/公式/代码/注释排版，相关词条、前后翻页、读本和外链保持可用。
- [ ] **Step 5: 验证。** 用键盘完成搜索、筛选、清空、进入详情和前后翻页；320px 下筛选可换行/局部滚动，长公式不撑开页面。
- [ ] **Step 6: 回归。** 运行筛选测试、全量前端测试和构建；记录检查点。

### Task 7: 学习证据与日志时间线

**Files:**
- Modify: `frontend/src/pages/ProgressPage.tsx`
- Modify: `frontend/src/pages/JournalPage.tsx`
- Modify: `frontend/src/components/charts.tsx`（仅图形语义、标注与 className）
- Modify: `frontend/src/styles/signal.css`
- Test: `frontend/src/components/charts.test.tsx`

**Interfaces:**
- Consumes: 现有 `ProgressData`、`Reflection`、`LearningEvent` 和 `DayActivity`。
- Preserves: `api.progress`、`api.journal(date)`、`api.saveJournal(date, reflection)`、日期切换和 query invalidation。

- [ ] **Step 1: 写失败的图表语义测试。** SSR 渲染空周和有数据周：空周不伪造柱形/结论，有数据周保留单位与可访问文本；状态不能只靠颜色。
- [ ] **Step 2: 运行测试确认失败。** 运行 `npm test -- --run frontend/src/components/charts.test.tsx`，确认新语义断言失败。
- [ ] **Step 3: 重排 Progress。** 首屏突出已有记录、证据局限和下一步；只重述 stats、完成小节、weekly、recent mistakes/activity，不新增证据模型或掌握率。
- [ ] **Step 4: 重排 Journal。** 编辑器拥有大正文区、清楚保存状态和日期时间线；字段 hint 使用注释样式，2000 字限制、脏状态和失败提示不变。
- [ ] **Step 5: 完整流程验证。** 检查空数据/有数据、前一天/后一天、未来日期禁止、未保存状态、真实保存后刷新仍在；不写入演示记录作为验收。
- [ ] **Step 6: 回归。** 运行图表测试、全量前端测试和构建；记录检查点。

### Task 8: 整站统一与最终验收

**Files:**
- Modify: `README.md`
- Modify: 前述文件中仅为修复验收发现的问题而需要改动的部分
- Create: `artifacts/signal-canvas-desktop.png`
- Create: `artifacts/signal-canvas-mobile.png`

**Interfaces:**
- Consumes: Tasks 1–7 的全部共享组件和页面。
- Preserves: Welcome 的 3D 回归场、水流、WebGL fallback、进入 `/today` 过渡和 Three.js 懒加载。

- [ ] **Step 1: 建立浏览器验收矩阵。** 对 `/`、`/today`、`/learn`、三章 Concept、Foundations 索引/详情、Practice、Progress、Journal、Diagnostic 检查标题层级、主行动、可见字体、死按钮和控制台错误。
- [ ] **Step 2: 检查响应式与缩放。** 每个核心路由覆盖 320/390/768/1024/1440/1920px，另测 200% 缩放；断言 `document.documentElement.scrollWidth <= window.innerWidth`，公式/代码只允许局部滚动。
- [ ] **Step 3: 检查可访问性。** 对主要路由、命令面板、练习反馈和诊断作答运行 axe，目标 0 violations；人工验证键盘、焦点、非颜色状态和 reduced-motion。
- [ ] **Step 4: 验证功能与数据边界。** 走通 Welcome→Today→Concept→Experiment→Practice→Journal；确认无答案提前泄露、无重复提交、无伪造空数据，诊断与练习记录仍按原规则分离。
- [ ] **Step 5: 运行完整回归。** 执行 `npm test -- --run`、`npm run build`、后端 `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 ../.venv/bin/pytest -q`（工作目录 `backend`）；构建不得新增大型依赖，Three.js 引擎不得回到 >500kB 警告。
- [ ] **Step 6: 更新文档与交付。** README 只描述已实际完成的 UI 系统与验证；保存桌面/移动截图，列出所有修改文件、测试结果和仍需用户主观审阅的视觉事项。当前目录无 Git，不创建提交或分支。

## Self-Review Notes

- Spec coverage: Tasks 1–2 对应全局框架/排版/动效；3 对应 Today/Learn；4 对应 Concept/Experiment；5 对应 Practice/Diagnostic；6 对应 Foundations；7 对应 Progress/Journal；8 对应 Welcome 保持、全路由响应式、a11y 和功能回归。
- Type consistency: 新组件只消费已有类型；`ConfidenceScale` 在 Practice 与 Diagnostic 使用相同 1–5 值；没有引入 API 类型。
- Proportion: 计划只固定接口、文件、测试断言和命令；CSS 细节与组件内部实现留给执行者。
- Environment correction: 前端 `package.json` 位于项目根目录，Vite root 为 `frontend`；前端命令从项目根目录运行，不按旧摘要误切到 `frontend/`。
