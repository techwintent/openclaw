# Heartbeat Policy

> What heartbeat checks, when it nags, and what it logs. Updated by tenant or vertical pack.

## Cadence

- Default interval: **120m** (controlled by `OPENCLAW_HEARTBEAT_INTERVAL_SEC`, default 7200)
- Trigger: container-internal sleep-loop spawned at boot by `scripts/openclaw-docker-init.sh`

## What Each Heartbeat Does

1. **Daily log roll-over:** ensure `memory/daily/YYYY-MM-DD.md` exists; create if missing
2. **Git checkpoint:**
   - Skip if working tree is clean (no diff, no untracked)
   - Otherwise: `git add -A && git commit -m "heartbeat: <ISO-ts> checkpoint"`
3. **Health checks** (see below); log to `state/heartbeat-errors.log` on failure (**fail-soft**, never blocks main process)
4. **Append a brief execution record** to the bottom of this file

## Health Checks

### Cron Tasks Watched

(Filled in by the vertical pack; tenant may add.)

| Task | Schedule | Notify on error |
| --- | --- | --- |

### File-System Checks

- `MEMORY.md` over 200 lines? → suggest distillation in tomorrow's daily log
- Past 3 days of `memory/daily/*.md` all present? → if missing, create empty stubs

### Quiet Hours

Don't surface non-critical notifications outside the tenant's active hours:

- Active window: (filled by tenant, e.g. 09:00–22:00 in their timezone)
- Critical errors override quiet hours

## Last Run

(Heartbeat will append rolling status here.)

---

*Heartbeat does **not** generate content (e.g. daily reports). It only **monitors**. Content tasks belong in cron jobs.*
