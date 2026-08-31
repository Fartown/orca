# 观察与建议：从 dreamina 工作历史与 Forge 看 Issue 与"轮到我"

日期：2026-08-19
看了什么：`~/workspace/dreamina/`（父仓 workspace：`AGENTS.md`、`docs/context/STATE.md`、`DECISIONS.md`、`docs/issue/`、`docs/bugfree/`、`docs/research/`、`tmp/tasks/` 313 个任务目录与 `INDEX.md`）、`@byted/forge` 0.3.1 的 README 与命令面、几个真实产出样本（MR review findings、logid RCA、Issue journal）。
对应：`并行任务-Issue与轮到我-产品方案.md`（v5）

---

## 一、观察（都有数）

### 1. 你真实的工作单位是"任务目录"，不是 task-leader Issue

| 落点 | 数量（7 周） | 说明 |
| --- | --- | --- |
| `tmp/tasks/{日期}-{任务名}/` | **313** | 过程、证据、一次性结论；`INDEX.md` 每任务一行 |
| `docs/issue/{需求名}/` | **2** | task-leader 全生命周期（journal / REQ / D / TC） |
| `docs/bugfree/`、`docs/research/` | 少量 | 跨任务可复用的方法与调研 |

近两周每天 4–20 个任务目录，均值约 9。绝大多数"一件事"是短生命周期的任务，有证据、有一句话结论，**不需要** requirements / solutions / tests 那一套；只有真正的开发需求才升级到 task-leader。

→ 产品里的 Issue 必须轻到能承载这 313 个，而不是只承载那 2 个。

### 2. 系列存在，但没有容器

同一件事被拆成多个平级任务目录，只靠命名前缀关联：

- `carrier-webui-*` 一天 5 个（acceptance / protocol-migration / hitl / run-split / steer-queue-ui）
- `derived-semantics-review → -verify → -mr` 三天三个
- `mr-1664-ci` + `mr-1664-comments`；`mr-1522-protocol-review` + `agent-input-protocol-mr1522-update`
- 飞书同步同一篇文档 `update-r2`、`update-r3`
- 一个 RCA 任务目录下按 logid 分三个子目录

→ 这正是"一个 Issue 下多个会话 / 多次产出"的实证。容器在你脑子里和命名里，不在结构里。

### 3. 类型分布和你口述的不完全一样

按目录名粗分：验证 / E2E / 验收 ≈ 49，Oncall / logid RCA / triage ≈ 42，MR review / MR 修复 ≈ 35，**飞书文档同步 ≈ 27**，部署若干，调研 ≈ 6（但单个体量最大）。

→ "文档同步 / 发布"是一个独立的大类；它的产物是远端文档 + 版本号（rev 93 → 126 → 143）。Issue 类型的默认列表应来自这份历史，而不是我拍的五个。

### 4. Forge 已经把"文档与目录的规范"做成了机制

| Forge 已有 | 与产品方案的关系 |
| --- | --- |
| 写入路由 6 条（能查到就不写；需求长期事实→Issue；可复用方法→bugfree；过程证据→`tmp/tasks/`；workspace 当前快照→STATE；跨 Issue 取舍→DECISIONS） | 产品的"产物：全部 / 关键"和"归档 = 整理"正好落在路由 4 和 2/3/6 上 |
| `STATE.md`：小节白名单（当前目标 / 当前阶段 / 下一步 / 阻塞 / Repo 分支 / 关键约束 / 关联文档），**同字段只留最新值、整段覆盖、禁止流水** | 这就是"整理稿"的写入语义，而且词表已经存在 |
| `forge brief` = STATE + git 状态 + 最近 DECISIONS + 活跃 Issue journal + lint | 这就是"切回来读什么"；产品的"以 Issue 上下文新开会话"要的就是它的 Issue 级版本 |
| `forge new {name} [repos]` = 建 feature worktree + `docs/issue/{name}/` 骨架；`forge add` 中途追加 repo；`Repo 分支`表由它维护 | 这就是"Issue 管理的目录（专属 worktree）"；`Repo 分支`表就是 Issue 的目录列表 |
| `forge doctor` 对 STATE 做内容级 lint（warn 不阻断） | Issue 记录也该有同样的 doctor |
| 阶段枚举：初始化 / 排查 / 需求理解 / 技术方案 / 开发 / 自测 / MR修复 / 灰度 / 已交付 | 现成的"阶段"词表，journal 开发记录表已在用 |
| 阶段结束仪式：`INDEX.md` 追一行 → 更新 journal → STATE / DECISIONS 变更列给用户确认 → `forge doctor` | 这就是产品的"归档前清单"，只是今天靠 agent 记得做 |

但 Forge **只管文档与目录**，完全没有会话、停止事件、"轮到我"——那是 Orca 的地盘。

### 5. STATE 是单目标的，你是十目标的

`STATE.md` 的"当前目标"只能写一句，"当前阶段"只能一个标签。它回答"这个 workspace 现在的主线是什么"，回答不了"我同时在推的十件事各自在哪"。

→ 十件事各自的"当前快照"没有地方放。产品的 Issue 级整理稿就是这个缺口。

### 6. 索引在漂移

`tmp/tasks/INDEX.md` 一部分是表格行、一部分是无序列表、格式不一——agent 手写追加的索引不可靠。

### 7. 一个真实反例：产出落错了地方

`tmp/tasks/2026-08-19-review-agent-debug-entry/findings.md` 开头自述：为 MR !2407 发起的 code-review，评审器把 target 解析到了**另一个 worktree**（`dreamina-octo-debug`），审的是别的分支——于是这份 15 条发现的评审报告只能"暂存于此备用"。

→ 产出与 Issue 的绑定、卡片上显示目录与主机、"迁移不复制"，都有真实事故支撑。

---

## 二、建议的最终判定（2026-08-21 复审后）

> 本节取代早期的建议正文。原 A–I 建议中照搬 Forge 机制的部分已被产品决策否决；为避免"正文一套、末尾作废注一套"的双重口径，这里按**采纳 / 部分采纳 / 否决**逐项定案。最终以产品方案（`并行任务-Issue与轮到我-产品方案.md`）为唯一规范。

### 保留下来的四条原则（进入产品）

| 原则 | 产品落点 |
| --- | --- |
| 信息按生命周期分落点：一次性证据 ≠ 单件事当前事实 ≠ 跨事沉淀 | 证据挂轮次记录；当前事实是整理稿；跨事沉淀走归档分流（agent 列候选、用户勾选并指定落点） |
| 快照与流水分开；快照同字段只留最新值、整段覆盖 | 整理稿写入语义；流水归时间线 |
| 开工先拿快照，不翻历史 | Issue brief（整理稿 + 目录 git 状态 + 最近介入点） |
| 记录会腐化，需要机械检查 | 归档前清单；整理稿"已过期"新鲜度标记 |

### 被否决的机制（不进产品）

父仓 workspace 作为产品对象；`STATE.md` / `DECISIONS.md` / `bugfree/` / `INDEX.md` 这些具体文件与目录名；`forge new / add / brief / doctor / status` 命令面；"检测 Forge workspace 走不同路径"的两分法（普通单 git 仓库零配置是唯一默认形态）；由系统自动写 INDEX / DECISIONS / bugfree（落点必须由用户指定）。

### A–I 逐项定案

| 项 | 原建议 | 判定 | 说明 |
| --- | --- | --- | --- |
| A | Orca 只管绑定，内容按"是否 Forge workspace"分两路落点 | **部分采纳** | "Orca 不重建存储、证据在磁盘目录"保留；两分法否决——单仓零配置是默认，存量约定只在迁移导入时被尊重一次 |
| B | 轻 Issue 默认，task-leader 是升级 | **采纳** | 进产品 §3.1。但 2:313 不能当升级率：313 是任务目录数，多个目录常属同一件事（`carrier-webui-*` 一天 5 个），分母不成立；这组数据只证明"绝大多数执行不需要完整文档骨架" |
| C | 整理稿直接用 STATE 的词表与语义 | **部分采纳** | 写入语义（最新值、整段覆盖、禁流水）采纳；"沿用 STATE 词表"否决，分段是 Issue 自己定义的 |
| D | 目录两类映射到 `forge new / add`、Repo 分支表 | **否决** | 两类目录关系保留（进 §3.4，含所有权规则），但创建用 Orca 已有 worktree 能力；repo 清单在迁移时一次性导入 Orca 的 repo 列表 |
| E | 归档 = Forge 阶段结束仪式自动化 + 自动写 INDEX/DECISIONS/bugfree | **部分采纳** | 归档前清单与三向分流的**形态**保留；自动写入否决——agent 只列候选，用户勾选并指定落点，不勾不写 |
| F | Issue 级 brief；给 Forge 加 `forge brief --issue` | **部分采纳** | Issue brief 采纳（Orca 自己拼）；给 forge 加命令否决（forge 下线） |
| G | 类型默认列表来自历史分布（含"文档同步/发布"大类） | **采纳** | 类型仍只是标签；产物需支持"远端文档 + 版本号"形态 |
| H | 按前缀 / MR 号 / logid 自动提示归组 | **采纳** | 进新会话流程的归组提示 |
| I | 卡片限高可展开、产物按子项展示（两条实证） | **采纳** | 进 §5 |

## 三、结论

观察部分（第一节 1–7 条）全部成立，继续作为背景证据。建议部分以上表为准；与产品方案冲突处，**一律以产品方案为准**。

Forge 融入 Orca 的最终口径：吸收上面四条原则，不搬任何机制；存量 dreamina workspace 完成一次性迁移（repo 清单入 Orca、存量内容原地不动、AGENTS 指引零 forge 残留）并验证后，`forge` CLI 才下线，无长期过渡态。
