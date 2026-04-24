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

  // ─── File Parsing Tool (workspace pipeline) ───
  // Reads files from the shared /workspace volume and returns parsed content.
  // Excel → CSV text, CSV → raw text, images → metadata, others → raw text preview.

  const WORKSPACE_DIR = process.env.WORKSPACE_DIR || "/home/node/.openclaw/workspace";

  api.registerTool(
    () =>
      ({
        name: "parse_file",
        label: "Parse File",
        description:
          "Parse a file from the workspace and return its content as text. Supports Excel (.xlsx/.xls → CSV), CSV, and text files. For images, returns file metadata. Use this when the user has uploaded a file and you need to read its content.",
        parameters: {
          type: "object" as const,
          properties: {
            path: {
              type: "string",
              description:
                "Relative path of the file in the workspace (e.g. 'uploads/abc_data.xlsx')",
            },
          },
          required: ["path"],
        },
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          const filePath = typeof params.path === "string" ? params.path : "";
          log.info(`[wintent] parse_file: ${filePath}`);

          if (!filePath) {
            return json({ error: "Missing required parameter: path" });
          }

          // Security: prevent path traversal
          const { resolve, join, basename } = await import("node:path");
          const fullPath = resolve(join(WORKSPACE_DIR, filePath));
          if (!fullPath.startsWith(resolve(WORKSPACE_DIR))) {
            return json({ error: "Path traversal not allowed" });
          }

          const { readFile, stat } = await import("node:fs/promises");

          try {
            const fileStat = await stat(fullPath);
            const ext = basename(fullPath).toLowerCase().split(".").pop() || "";

            // Excel files → CSV conversion
            if (["xlsx", "xls"].includes(ext)) {
              try {
                const XLSX = await import("xlsx");
                const workbook = XLSX.read(await readFile(fullPath));
                const sheets: string[] = [];
                for (const sheetName of workbook.SheetNames) {
                  const sheet = workbook.Sheets[sheetName];
                  const csv = XLSX.utils.sheet_to_csv(sheet);
                  sheets.push(`--- Sheet: ${sheetName} ---\n${csv}`);
                }
                return json({
                  filename: basename(fullPath),
                  type: "excel",
                  size: fileStat.size,
                  content: sheets.join("\n\n"),
                });
              } catch (xlsErr) {
                return json({
                  error: `Failed to parse Excel: ${String(xlsErr)}`,
                  filename: basename(fullPath),
                });
              }
            }

            // Image files → metadata only.
            // Visual analysis is currently UNAVAILABLE (no vision provider configured).
            // The AI must NOT fabricate image content — it should ask the user to describe it.
            if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) {
              return json({
                filename: basename(fullPath),
                type: "image",
                size: fileStat.size,
                mimetype: `image/${ext === "jpg" ? "jpeg" : ext}`,
                vision_available: false,
                limitation:
                  "图片视觉分析当前不可用。请告知用户：暂时无法识别图片内容，请用文字描述图片中的商品、单据或关键信息。不要编造图片内容。",
              });
            }

            // CSV and text files → raw content (cap at PARSE_FILE_READ_LIMIT).
            // For oversized files we stream the first N bytes rather than
            // reading the whole file into memory and slicing afterwards.
            const PARSE_FILE_READ_LIMIT = 100 * 1024;
            if (fileStat.size > PARSE_FILE_READ_LIMIT) {
              const { createReadStream } = await import("node:fs");
              const stream = createReadStream(fullPath, {
                encoding: "utf-8",
                start: 0,
                end: PARSE_FILE_READ_LIMIT - 1,
              });
              let partial = "";
              for await (const chunk of stream) {
                partial += chunk as string;
                if (partial.length >= PARSE_FILE_READ_LIMIT) {
                  break;
                }
              }
              return json({
                filename: basename(fullPath),
                type: "text",
                size: fileStat.size,
                truncated: true,
                content: partial.slice(0, PARSE_FILE_READ_LIMIT),
              });
            }

            const content = await readFile(fullPath, "utf-8");
            return json({
              filename: basename(fullPath),
              type: ext === "csv" ? "csv" : "text",
              size: fileStat.size,
              content,
            });
          } catch (err) {
            if ((err as NodeJS.ErrnoException).code === "ENOENT") {
              return json({ error: `File not found: ${filePath}` });
            }
            return json({ error: `Failed to read file: ${String(err)}` });
          }
        },
      }) as unknown as AnyAgentTool,
  );

  log.info("[wintent] parse_file tool registered (workspace pipeline).");
}
