/**
 * Wintent OpenClaw Extension
 *
 * Architecture: OpenClaw is the SOLE AI entry point.
 * - Business tools (sales, inventory, reports, methodology) are passed
 *   via the `tools` parameter in the Responses API request from chat-web.
 *   OpenClaw forwards them to MiniMax, which uses native function calling.
 *   Since no server-side handler is registered, OpenClaw emits function_call
 *   events in the SSE stream → frontend renders ToolUI cards.
 * - Cron/scheduling tools are registered here with server-side handlers
 *   (executed by OpenClaw against NocoBase, no card rendering needed).
 */

import type { OpenClawPluginApi, PluginLogger } from "openclaw/plugin-sdk/core";

type AnyAgentTool = ReturnType<
  Extract<Parameters<OpenClawPluginApi["registerTool"]>[0], (...args: unknown[]) => unknown>
>;

function json(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export default function register(api: OpenClawPluginApi) {
  const log: PluginLogger = api.logger;

  log.info(
    "[wintent] Extension loaded. Business tools are client-rendered (passed via API tools param).",
  );
  log.info("[wintent] Registering server-side cron/scheduling tools...");

  // ─── Cron / Scheduling Tools (server-side execution) ───
  // These tools allow the AI to create, list, and manage scheduled tasks.
  // Cron configs are stored in NocoBase `scheduled_tasks` collection.
  // Execution is handled by OpenClaw's built-in cron infrastructure.

  const NOCOBASE_URL = process.env.NOCOBASE_API_URL || "http://nocobase:13000";

  async function getToken(): Promise<string> {
    const envToken = process.env.NOCOBASE_API_TOKEN;
    if (envToken) {
      return envToken;
    }
    const res = await fetch(`${NOCOBASE_URL}/api/auth:signIn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account: "nocobase", password: "admin123" }),
    });
    if (!res.ok) {
      throw new Error(`NocoBase auth failed: ${res.status}`);
    }
    const body = (await res.json()) as { data: { token: string } };
    return body.data.token;
  }

  async function nbFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
    const token = await getToken();
    const res = await fetch(`${NOCOBASE_URL}${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(opts.headers as Record<string, string>),
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`NocoBase ${path} → ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  // ── create_scheduled_task ──
  api.registerTool(
    () =>
      ({
        name: "create_scheduled_task",
        label: "Create Scheduled Task",
        description:
          "Create a recurring scheduled task. Supports cron expressions (e.g. '0 9 * * *' for daily 9AM) or simple intervals ('every 1h', 'every 30m'). Tasks can trigger tool executions like daily low-stock alerts, weekly sales reports, etc.",
        parameters: {
          type: "object" as const,
          properties: {
            name: { type: "string", description: "Human-readable name for the task" },
            description: { type: "string", description: "What this task does" },
            cron_expression: {
              type: "string",
              description:
                "Cron expression (e.g. '0 9 * * *' = daily 9AM, '0 0 * * 1' = weekly Monday). Use standard 5-field cron format.",
            },
            tool_name: {
              type: "string",
              description:
                "The tool to execute on schedule (e.g. check_low_stock, sales_report, business_overview)",
            },
            tool_args: {
              type: "object",
              description: "Arguments to pass to the tool when executed",
            },
            enabled: {
              type: "boolean",
              description: "Whether the task is active (default: true)",
            },
          },
          required: ["name", "cron_expression", "tool_name"],
        },
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          log.info(`[wintent] create_scheduled_task: ${JSON.stringify(params)}`);
          const result = await nbFetch<{ data: Record<string, unknown> }>(
            "/api/scheduled_tasks:create",
            {
              method: "POST",
              body: JSON.stringify({
                name: params.name,
                description: params.description || "",
                cronExpression: params.cron_expression,
                toolName: params.tool_name,
                toolArgs: params.tool_args ? JSON.stringify(params.tool_args) : "{}",
                enabled: params.enabled !== false,
                status: "active",
                lastRunAt: null,
                nextRunAt: null,
              }),
            },
          );
          return json({
            success: true,
            task: result.data,
            message: `定时任务「${String(params.name)}」已创建，Cron: ${String(params.cron_expression)}`,
          });
        },
      }) as unknown as AnyAgentTool,
  );

  // ── list_scheduled_tasks ──
  api.registerTool(
    () =>
      ({
        name: "list_scheduled_tasks",
        label: "List Scheduled Tasks",
        description:
          "List all scheduled/cron tasks with their status, cron expression, and last/next run times.",
        parameters: {
          type: "object" as const,
          properties: {
            enabled_only: {
              type: "boolean",
              description: "Only show enabled tasks (default: false, shows all)",
            },
          },
          required: [],
        },
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          log.info(`[wintent] list_scheduled_tasks: ${JSON.stringify(params)}`);
          const filter = params.enabled_only ? '&filter={"enabled":true}' : "";
          const result = await nbFetch<{
            data: Array<Record<string, unknown>>;
          }>(`/api/scheduled_tasks:list?pageSize=50&sort=-createdAt${filter}`);
          return json({
            tasks: (result.data || []).map((t) => ({
              id: t.id,
              name: t.name,
              description: t.description,
              cron_expression: t.cronExpression,
              tool_name: t.toolName,
              tool_args: t.toolArgs,
              enabled: t.enabled,
              status: t.status,
              last_run_at: t.lastRunAt,
              next_run_at: t.nextRunAt,
            })),
            total: result.data?.length ?? 0,
          });
        },
      }) as unknown as AnyAgentTool,
  );

  // ── update_scheduled_task ──
  api.registerTool(
    () =>
      ({
        name: "update_scheduled_task",
        label: "Update Scheduled Task",
        description:
          "Update a scheduled task. Can enable/disable, change cron expression, or modify the tool to execute.",
        parameters: {
          type: "object" as const,
          properties: {
            task_id: { type: "integer", description: "ID of the task to update" },
            name: { type: "string", description: "New name" },
            cron_expression: { type: "string", description: "New cron expression" },
            tool_name: { type: "string", description: "New tool to execute" },
            tool_args: { type: "object", description: "New tool arguments" },
            enabled: { type: "boolean", description: "Enable or disable the task" },
          },
          required: ["task_id"],
        },
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          log.info(`[wintent] update_scheduled_task: ${JSON.stringify(params)}`);
          const updateData: Record<string, unknown> = {};
          if (params.name !== undefined) {
            updateData.name = params.name;
          }
          if (params.cron_expression !== undefined) {
            updateData.cronExpression = params.cron_expression;
          }
          if (params.tool_name !== undefined) {
            updateData.toolName = params.tool_name;
          }
          if (params.tool_args !== undefined) {
            updateData.toolArgs = JSON.stringify(params.tool_args);
          }
          if (params.enabled !== undefined) {
            updateData.enabled = params.enabled;
          }

          const result = await nbFetch<{ data: Record<string, unknown> }>(
            `/api/scheduled_tasks:update?filterByTk=${String(params.task_id)}`,
            {
              method: "POST",
              body: JSON.stringify(updateData),
            },
          );
          return json({ success: true, task: result.data });
        },
      }) as unknown as AnyAgentTool,
  );

  // ── delete_scheduled_task ──
  api.registerTool(
    () =>
      ({
        name: "delete_scheduled_task",
        label: "Delete Scheduled Task",
        description: "Delete a scheduled task by ID.",
        parameters: {
          type: "object" as const,
          properties: {
            task_id: { type: "integer", description: "ID of the task to delete" },
          },
          required: ["task_id"],
        },
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          log.info(`[wintent] delete_scheduled_task: ${JSON.stringify(params)}`);
          await nbFetch(`/api/scheduled_tasks:destroy?filterByTk=${String(params.task_id)}`, {
            method: "POST",
          });
          return json({ success: true, message: "定时任务已删除" });
        },
      }) as unknown as AnyAgentTool,
  );

  log.info("[wintent] 4 cron/scheduling tools registered (server-side).");
}
