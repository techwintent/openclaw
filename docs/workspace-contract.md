# OpenClaw Workspace Contract

> 本文档定义 OpenClaw Agent Workspace 的目录约定、文件契约与持久化策略。所有
> 接入 OpenClaw 平台的部署（容器、Daemon、CI Runner）都必须遵守此契约。
>
> 本契约对齐 `~/.openclaw/workspace-feishu-default/` 的实际运行形态；任何工具
> 与本文档不一致时，**以本文档为准**。

---

## 1. 概述

每个 OpenClaw Agent 绑定一个独立的 **workspace 目录**。这个目录同时是：

- **Agent 的"家"**：身份、性格、记忆、技能、运行状态全部沉淀在这里
- **一个 git 仓库**：所有文本沿 git history 累积，跨重启 / 跨会话可恢复
- **跨工具协作锚点**：Claude Code、Codex、Copilot、Cursor 等不同 AI 工具通过
  读 workspace 内固定文件即可同步 Agent 状态，无需依赖会话上下文

### 1.1 设计原则

1. **文本优先**：除媒体素材外，所有持久化内容都是 markdown / yaml / json，
   利于 grep、利于 diff、利于 LLM 直接读
2. **git 即时序**：每次 heartbeat 触发一次 `git commit`；工作树无变动则跳过
3. **覆盖永远友好**：容器二启时只补缺失文件，**绝不**覆盖 Agent 或用户已修改
   的内容
4. **隔离即默认**：每个 Agent 一个 workspace，多租户场景下每个租户独立卷
5. **可被 LLM 直接消化**：核心文件位于 workspace 根，文件名固定且语义明显

### 1.2 与多租户的关系

在 Wintent 平台多租户场景下，workspace 形态扩展为：

```
{tenant 卷}/                                  # docker named volume
├── .git/                                     # 每租户独立 git 历史
├── IDENTITY.md     {{agentId}} {{tenantId}} {{vertical}}
├── USER.md         {{tenant 主的画像}}
├── SOUL.md         {{vertical 包注入的性格}}
├── AGENTS.md       {{操作约定}}
├── TOOLS.md        {{vertical 包 + 租户自定义}}
├── MEMORY.md       {{长期记忆}}
├── HEARTBEAT.md    {{最近一次 heartbeat 状态}}
├── memory/         {{长期记忆细节}}
├── skills/         {{vertical 包注入}}
└── state/          {{运行时状态，可恢复}}
```

`{{...}}` 是初始化时由 docker-init 脚本做的占位替换，详见 §6。

---

## 2. 七个核心文件

workspace 根目录下固定七份 markdown 文件，**文件名不可更改**（OpenClaw runtime
按文件名查找）。

| 文件           | 作用                                   | 写入方                                               | 读取频率             |
| -------------- | -------------------------------------- | ---------------------------------------------------- | -------------------- |
| `IDENTITY.md`  | Agent 身份元数据                       | 初始化时；运维更新                                   | 每会话首次读         |
| `USER.md`      | 用户画像                               | 访谈写入；用户编辑                                   | 每会话首次读         |
| `SOUL.md`      | 性格 / 风格 / 价值观 / 模型路由策略    | 平台预设 + 用户调优                                  | 每会话首次读         |
| `AGENTS.md`    | Workspace 操作手册 / 多 Agent 协作约定 | 平台预设                                             | 每会话首次读         |
| `TOOLS.md`     | 该 Agent 可用工具清单 / 设备别名       | 平台预设 + Vertical Pack 注入 + 用户编辑             | 工具调用前读         |
| `MEMORY.md`    | 长期记忆主索引                         | `memory-extractor` 写入；定期由 dreaming worker 收敛 | **仅**主会话载入     |
| `HEARTBEAT.md` | 最近一次 heartbeat 状态 + 健康检查规则 | `heartbeat.sh` 与 cron worker 写入                   | heartbeat 触发时读写 |

### 2.1 IDENTITY.md

定义"我是谁"。最小字段：

```markdown
# Agent Identity

- agentId: {{agentId}} # DNS-safe slug，全平台唯一
- name: {{display name}} # 用户可读的名字
- vertical: {{vertical}} # 行业垂直包 slug，例如 clothing-shop / fitness-trainer
- tenantId: {{tenantId}} # 租户唯一标识
- bornAt: {{ISO-8601}} # 首次 git init 时间戳
- vibe: {{个性一行简介}}
```

可选段落：核心职责、熟悉领域、对外身份说明。

### 2.2 USER.md

定义"我服务谁"。包含：

- 用户基本信息（姓名、时区、联系方式）
- 技术 / 行业背景
- 关键项目目录与权限边界
- 偏好（例如"称呼我 Damer 而非全名"）

### 2.3 SOUL.md

定义"我是怎样的人"。包含：

- 核心价值观（"genuinely helpful, not performatively helpful"）
- 边界（"private things stay private"）
- 沟通风格
- **Token 管理策略 / 模型路由规则**（哪些任务走哪个 backend）

`SOUL.md` 由 Vertical Pack 提供默认版本，用户可调优。

### 2.4 AGENTS.md

Agent 的运行手册。规定：

- 首次启动流程（如有 `BOOTSTRAP.md` 怎么处理）
- 每会话开始必读哪些文件（`SOUL.md` → `USER.md` → `memory/daily/<today>.md`）
- 主会话 vs 群组会话的差异（`MEMORY.md` 仅主会话载入）
- 多 Agent 协作约定
- 长会话内的记忆刷新节奏

### 2.5 TOOLS.md

环境特定的工具映射表：

- 设备别名（`living-room` → 客厅摄像头）
- SSH host 别名
- TTS 偏好语音
- 联系人 ID 映射（例如 Discord / Telegram 用户 ID）
- Vertical Pack 注入的工具说明

`TOOLS.md` 与 `skills/` 目录下的技能定义解耦：技能是共享的"how"，TOOLS.md 是
本地的"what"。

### 2.6 MEMORY.md

Agent 长期记忆主索引。**安全约束**：

- **仅在主会话载入**（直接对话场景）
- **不在群组 / 共享上下文中载入**（避免向陌生人泄漏个人信息）
- 由 `memory-extractor` 写入；由 `dreaming` worker 周期收敛

格式约定：

```markdown
# MEMORY.md — {{Agent 名字}} 长期记忆

> 只保留稳定的、长期有价值的信息。日常工作记录在 daily/YYYY-MM-DD.md。

---

## 🎯 关键定位 / 项目状态

...

## 💡 核心洞察

- 洞察 1
- 洞察 2

---

## 最近条目（由 memory-extractor append）

---

at: 2026-04-27T10:23:45Z
source: msg-001
tags: [sku, inventory]

---

User asked about the new SKU import flow...
```

行数预算：MEMORY.md > 200 行时由 heartbeat 提示需要精简（避免 LLM 上下文撑爆）。

### 2.7 HEARTBEAT.md

定义"心跳要做什么"。是 **配置 + 状态** 的混合体：

- 关注的 cron 任务列表
- 健康检查规则（哪些状态需要打扰用户、哪些静默处理）
- 静默时段（"只在 10:00-22:00 之间提醒"）
- Git 快照逻辑说明
- **每次 heartbeat 后追加最近一次执行结果**

---

## 3. 三个子目录

### 3.1 `memory/` — 长期记忆细节

```
memory/
├── MEMORY.md                       # 长期记忆主索引（与根 MEMORY.md 二者保留一份；当前规范以根为主）
├── SYNC_RULES.md                   # 记忆同步规则
├── daily/
│   └── YYYY-MM-DD.md               # 每日原始日志（heartbeat 自动创建）
├── decisions/
│   └── DECISION-{slug}.md          # 重要决策记录
├── dreaming/                       # idle 时的反思产物
├── people/                         # 关键联系人画像
├── projects/                       # 项目级长期记忆
└── *.md                            # 主题型长期笔记（例如 indie-lessons-log.md）
```

**写入规则**：

- `daily/<today>.md`：每次 chat 触发的原始日志
- `MEMORY.md`：由 `memory-extractor` 从 daily 中蒸馏
- `decisions/`、`people/`、`projects/`：由 dreaming worker 周期归档

### 3.2 `skills/` — Vertical Pack 注入的技能目录

```
skills/
├── <skill-name>/
│   ├── SKILL.md           # 元数据 + 调用约定
│   ├── prompts/           # 提示词模板
│   ├── tools/             # 工具实现
│   └── seed-memory/       # 该技能的种子记忆
```

**注入时机**：容器启动时由 init 脚本拉取 Vertical Pack repo，把 `openclaw/skills/`
内容拷贝到 workspace `skills/`。版本绑定遵循 `pack.yaml` 的 `version` 字段。

### 3.3 `state/` — 运行时状态（**进 git**）

```
state/
├── heartbeat-errors.log         # heartbeat 失败时写入；进 git
├── cron-runs/                    # cron 执行记录；进 git
├── *.tmp                         # 临时锁 / 中间产物；**不进 git**（见 §4）
```

**关键澄清**：`state/` **整体进 git**，仅 `state/*.tmp` 被 `.gitignore` 排除。
这是因为 git-backed workspace 的核心价值就是"跨重启可恢复"——cron 状态、
heartbeat 历史、错误日志都要随 git 历史走，才能让重启 / 迁移后的 Agent 知道
"上一次我活到了哪一步"。

---

## 4. `.gitignore` 政策

workspace 根 `.gitignore` 模板：

```text
.DS_Store
.openclaw/
*.bak
*.tmp
*.swp
memory/.git/
memory/.dreams/
state/*.tmp
```

**逐条解释**：

| 模式                    | 原因                                                             |
| ----------------------- | ---------------------------------------------------------------- |
| `.DS_Store`             | macOS 噪音                                                       |
| `.openclaw/`            | OpenClaw runtime 在 workspace 内可能创建的私有目录（如临时缓存） |
| `*.bak` `*.tmp` `*.swp` | 编辑器 / 工具产生的临时文件                                      |
| `memory/.git/`          | 防止嵌套 git 仓库（极少数场景下 memory/ 本身被另一仓追踪）       |
| `memory/.dreams/`       | dreaming worker 的中间产物，体积大且非确定性                     |
| `state/*.tmp`           | 锁文件、并发临时态；**注意只是 \*.tmp，state/ 本身进 git**       |

**不在排除列表里**（即"应该进 git"）的：

- `state/heartbeat-errors.log`、`state/cron-runs/`：跨重启可恢复的核心
- `*.sqlite`：SQLite 数据库**不在 workspace 内**（位于 `~/.openclaw/memory/*.sqlite`，
  与 workspace 同级），因此不需要在 workspace .gitignore 中列出
- 所有 `.md`：永远进 git

---

## 5. Heartbeat 与 Git 节奏

### 5.1 节奏

- **默认间隔**：120m（120 minutes）
- **可调环境变量**：`OPENCLAW_HEARTBEAT_INTERVAL_SEC`（默认 7200）
- **触发器**：容器内 sleep-loop 子进程（不依赖 crond）

### 5.2 每次 heartbeat 做什么

```
1. 检测 .git/index.lock —— 存在则 fail-soft（写 state/heartbeat-errors.log，跳过）
2. cd workspace
3. 检查工作树：git diff --quiet && git diff --cached --quiet && 无 untracked
   —— 都满足则跳过 commit（"无变动"）
4. git add -A
5. git commit -m "heartbeat: <ISO-8601 ts> checkpoint"
6. （可选）追加 HEARTBEAT.md 末尾一段执行记录
7. （可选，未来 Iteration）git push origin <branch>
```

### 5.3 fail-soft 原则

**heartbeat 失败绝不阻塞 OpenClaw 主进程**。任何异常都：

- 写到 `state/heartbeat-errors.log`
- 退出码 0
- 等下个周期再试

这是 git-backed workspace 的核心稳定性保证。

### 5.4 Push 策略（Iteration 3+ 才落地）

Iteration 1 仅本地 commit，**不配 remote、不 push**。
Iteration 3 起每个租户 workspace 配 origin remote 指向中央 git 服务器
（`{org}/wintent-tenant-{slug}`），heartbeat commit 后异步 push。

---

## 6. 容器化初始化流程

### 6.1 首次启动（`workspace/.git` 不存在）

```
1. mkdir -p $WORKSPACE_DIR
2. git -C $WORKSPACE_DIR init -b main
3. 拷贝 $WORKSPACE_TEMPLATE_DIR/*.md 到 $WORKSPACE_DIR/，做占位替换：
     {{agentId}} → $OPENCLAW_AGENT_ID
     {{tenantId}} → $OPENCLAW_TENANT_ID
     {{vertical}} → $OPENCLAW_VERTICAL
     {{bornAt}} → 当前 ISO-8601 UTC
4. 创建子目录 memory/ skills/ state/ 各放 .gitkeep
5. git add -A && git commit -m "workspace bootstrap"
6. 启动 OpenClaw 主进程
7. fork sleep-loop heartbeat 子进程
```

### 6.2 二次启动（`workspace/.git` 已存在）

**绝不覆盖现有文件**。只做：

```
1. 检查七个核心 .md 与三个子目录是否存在；不存在则补
2. **已存在的文件原样保留**（包括用户自定义、Agent 自演化）
3. 不再产生 "workspace bootstrap" commit；新增的补缺由下次 heartbeat 收纳
4. 启动 OpenClaw 主进程 + heartbeat
```

### 6.3 占位符语法

模板文件中的变量统一使用 `{{name}}` 语法（双大括号）。docker-init 脚本用 `awk`
做替换以避免跨平台 sed 转义陷阱。占位符清单：

| 占位符         | 来源环境变量                  | 示例                    |
| -------------- | ----------------------------- | ----------------------- |
| `{{agentId}}`  | `OPENCLAW_AGENT_ID`           | `clothing-shop-default` |
| `{{tenantId}}` | `OPENCLAW_TENANT_ID`          | `pumpkin-001`           |
| `{{vertical}}` | `OPENCLAW_VERTICAL`           | `clothing-shop`         |
| `{{bornAt}}`   | `date -u +%Y-%m-%dT%H:%M:%SZ` | `2026-04-27T08:31:00Z`  |

未来扩展需要的占位符必须先回写本文档，再加入模板。

---

## 7. 与 Vertical Pack 的关系

Vertical Pack 通过启动期 git pull 注入以下内容到 workspace：

| Pack 来源               | 注入到 workspace                                 |
| ----------------------- | ------------------------------------------------ |
| `openclaw/skills/`      | `workspace/skills/`                              |
| `openclaw/tools/`       | 通过 `TOOLS.md` 引用，文件留在 pack 内（不拷贝） |
| `openclaw/seed-memory/` | append 到 `workspace/MEMORY.md`（仅首启）        |

Pack 升级走 git revision 切换；workspace 内已有用户编辑的文件**不被覆盖**——
冲突由 Iteration 4 的 admin-console 上面板提示并人工合并。

---

## 8. 跨 AI 工具的契约

任何接入此 workspace 的 AI 工具都应遵守：

1. 启动时按 `AGENTS.md` 的"Every Session"列表读文件
2. **MEMORY.md 仅在主会话载入**（防止信息泄漏）
3. 修改文件后由 heartbeat 统一 commit；不绕过 heartbeat 直接 push
4. 不创建未在本契约定义的根级文件（用 subdir 或加入本契约后再创建）
5. 不读 / 不写 `state/*.tmp`（运行时锁定空间）

---

## 9. 演化策略

本契约本身放在 `openclaw-src/docs/workspace-contract.md`，与 OpenClaw 源码同
仓库。新版本通过 Pull Request 演化，必须在变更说明里明确：

- 哪些字段是 breaking change（需要 workspace migration）
- 哪些字段向后兼容（旧 workspace 自动可用）
- 对应的 init 脚本与 vertical pack 是否需要联动升级

---

## 10. 参考实现

`~/.openclaw/workspace-feishu-default/` 是本契约的**参考实现**。任何工具实现
本契约时，应当 diff 自己的 workspace 输出和该参考实现，确认结构一致。

参考实现的 git 历史长达数百次 heartbeat checkpoint，是验证"workspace 形态长期
可演化"的活样本。
