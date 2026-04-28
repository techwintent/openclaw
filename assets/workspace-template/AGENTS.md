# Workspace Operations Manual

> The runbook for operating in this workspace. Read this when you boot.

## Every Session Boot Sequence

Before doing anything else:

1. Read `SOUL.md` — who you are
2. Read `USER.md` — who you serve
3. Read `IDENTITY.md` — your concrete identity card
4. Read `TOOLS.md` — your environment-specific tooling
5. Read today's `memory/daily/YYYY-MM-DD.md` if it exists
6. **If this is a main session** (direct conversation with the tenant): also read `MEMORY.md`

Don't ask permission for any of the above. Just do it.

## Memory Layers

- **Daily logs** (`memory/daily/YYYY-MM-DD.md`): raw context for the day. Heartbeat creates the file each day.
- **Long-term curated** (`MEMORY.md`): the distilled, durable memory. Loaded only in main sessions.
- **Decisions** (`memory/decisions/`): one file per significant decision.
- **People** (`memory/people/`): customer / contact profiles.
- **Projects** (`memory/projects/`): per-project long-term context.

### MEMORY.md Loading Rule (security)

- Load MEMORY.md **only** in direct (main) sessions with the tenant
- **Do NOT load** MEMORY.md in shared / group / customer-facing contexts
- Reason: MEMORY.md may contain personal information that should not leak to other parties

## Multi-Agent Coordination

If multiple Agents share this workspace (e.g. main agent + cron worker + dreaming worker):

- Each commit is a unit of "this agent did this work"
- Don't overwrite another agent's recent file changes without reading them first
- Heartbeat batches commits; don't `git push` from inside an agent action

## Heartbeat

`scripts/heartbeat.sh` runs every `OPENCLAW_HEARTBEAT_INTERVAL_SEC` seconds (default 7200 = 120m). Each heartbeat:

1. Writes a daily log entry to `memory/daily/YYYY-MM-DD.md` if missing
2. Snapshots the workspace via `git commit -m "heartbeat: <ts> checkpoint"` if there are changes
3. Logs failures to `state/heartbeat-errors.log` (fail-soft, never blocks main process)

See `HEARTBEAT.md` for tenant-specific heartbeat policy and health checks.

## Long Conversation Refresh

After ~20 conversation turns in a single session, re-read:

- Today's `memory/daily/<today>.md`
- `MEMORY.md` (if main session)

This prevents context drift in long sessions.

## What to Persist vs Skip

**Persist** (write to memory):
- Decisions made and the reasoning
- New facts about the user, business, customers
- Lessons learned
- Insights and patterns

**Skip** (don't pollute memory):
- Idle chitchat
- One-off questions with no context value
- Secrets unless explicitly asked to remember

---

*See `workspace-contract.md` in the OpenClaw source repo for the formal contract.*
