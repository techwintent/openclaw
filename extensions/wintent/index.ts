/**
 * Wintent OpenClaw Extension
 *
 * Registers clothing store management tools:
 * - create_sale: Create a new sales record
 * - query_sales: Query sales records
 * - query_inventory: Query product inventory
 * - check_low_stock: Check for low stock items
 * - sales_report: Generate sales report
 * - business_overview: Generate business overview
 * - confirm_action: Ask user to confirm an action
 */

import type { Static } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginApi, PluginLogger } from "openclaw/plugin-sdk/core";
import {
  createSale,
  querySales,
  queryInventory,
  checkLowStock,
  generateSalesReport,
  generateBusinessOverview,
  listKanbanProjects,
  listKanbanPlans,
  listKanbanTasks,
  updateKanbanTaskStatus,
  listMethodologyTemplates,
  getMethodologyTemplate,
} from "./src/nocobase-client.js";
import {
  CreateSaleSchema,
  QuerySalesSchema,
  QueryInventorySchema,
  CheckLowStockSchema,
  SalesReportSchema,
  BusinessOverviewSchema,
  ConfirmActionSchema,
  ShowKanbanSchema,
  UpdateTaskStatusSchema,
  ListMethodologiesSchema,
  ShowMethodologySchema,
} from "./src/schemas.js";

type CreateSaleParams = Static<typeof CreateSaleSchema>;
type QuerySalesParams = Static<typeof QuerySalesSchema>;
type QueryInventoryParams = Static<typeof QueryInventorySchema>;
type SalesReportParams = Static<typeof SalesReportSchema>;
type ConfirmActionParams = Static<typeof ConfirmActionSchema>;
type ShowKanbanParams = Static<typeof ShowKanbanSchema>;
type UpdateTaskStatusParams = Static<typeof UpdateTaskStatusSchema>;
type ListMethodologiesParams = Static<typeof ListMethodologiesSchema>;
type ShowMethodologyParams = Static<typeof ShowMethodologySchema>;

function json(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    details: data,
  };
}

function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    details: { error: message },
  };
}

export default function register(api: OpenClawPluginApi) {
  const log: PluginLogger = api.logger;

  // ─── BE1: Sales Tools ───

  api.registerTool(
    () =>
      ({
        name: "create_sale",
        label: "Create Sale",
        description:
          "Create a new sales record in the system. Use this when the user wants to record a sale or transaction.",
        parameters: CreateSaleSchema,
        async execute(_toolCallId: string, params: CreateSaleParams) {
          log.info(`[wintent] create_sale: ${JSON.stringify(params)}`);
          try {
            const result = await createSale(params);
            return json({
              success: true,
              message: "Sale created successfully",
              sale: result.data,
            });
          } catch (err) {
            log.error(`[wintent] create_sale error: ${err}`);
            return errorResult(
              `Failed to create sale: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        },
      }) as unknown as AnyAgentTool,
    { optional: true },
  );

  api.registerTool(
    () =>
      ({
        name: "query_sales",
        label: "Query Sales",
        description: "Query sales records with optional date range and product name filters.",
        parameters: QuerySalesSchema,
        async execute(_toolCallId: string, params: QuerySalesParams) {
          log.info(`[wintent] query_sales: ${JSON.stringify(params)}`);
          try {
            const result = await querySales(params);
            return json({
              sales: result.data,
              total: result.meta?.count ?? result.data?.length ?? 0,
            });
          } catch (err) {
            log.error(`[wintent] query_sales error: ${err}`);
            return errorResult(
              `Failed to query sales: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        },
      }) as unknown as AnyAgentTool,
    { optional: true },
  );

  // ─── BE2: Inventory Tools ───

  api.registerTool(
    () =>
      ({
        name: "query_inventory",
        label: "Query Inventory",
        description: "Query current product inventory and stock levels.",
        parameters: QueryInventorySchema,
        async execute(_toolCallId: string, params: QueryInventoryParams) {
          log.info(`[wintent] query_inventory: ${JSON.stringify(params)}`);
          try {
            const result = await queryInventory(params);
            return json({
              items: result.data,
              total: result.meta?.count ?? result.data?.length ?? 0,
            });
          } catch (err) {
            log.error(`[wintent] query_inventory error: ${err}`);
            return errorResult(
              `Failed to query inventory: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        },
      }) as unknown as AnyAgentTool,
    { optional: true },
  );

  api.registerTool(
    () =>
      ({
        name: "check_low_stock",
        label: "Check Low Stock",
        description: "Check for products with low stock levels that may need restocking.",
        parameters: CheckLowStockSchema,
        async execute(_toolCallId: string) {
          log.info("[wintent] check_low_stock");
          try {
            const result = await checkLowStock();
            const items = result.data || [];
            return json({
              low_stock_items: items.map((item) => ({
                product_name: item.product_name,
                sku: item.sku,
                category: item.category,
                current_stock: item.quantity,
                min_stock: item.min_stock || 10,
                needs_restock: item.quantity <= (item.min_stock || 10),
              })),
              total: items.length,
              alert:
                items.length > 0
                  ? `${items.length} products have low stock`
                  : "All products are well stocked",
            });
          } catch (err) {
            log.error(`[wintent] check_low_stock error: ${err}`);
            return errorResult(
              `Failed to check low stock: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        },
      }) as unknown as AnyAgentTool,
    { optional: true },
  );

  // ─── BE3: Report Tools ───

  api.registerTool(
    () =>
      ({
        name: "sales_report",
        label: "Sales Report",
        description:
          "Generate a sales report with revenue summary, top products, and daily trends.",
        parameters: SalesReportSchema,
        async execute(_toolCallId: string, params: SalesReportParams) {
          log.info(`[wintent] sales_report: ${JSON.stringify(params)}`);
          try {
            const result = await generateSalesReport(params);
            return json(result.data);
          } catch (err) {
            log.error(`[wintent] sales_report error: ${err}`);
            return errorResult(
              `Failed to generate sales report: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        },
      }) as unknown as AnyAgentTool,
    { optional: true },
  );

  api.registerTool(
    () =>
      ({
        name: "business_overview",
        label: "Business Overview",
        description:
          "Generate a comprehensive business overview including sales summary, inventory status, and key metrics.",
        parameters: BusinessOverviewSchema,
        async execute(_toolCallId: string) {
          log.info("[wintent] business_overview");
          try {
            const result = await generateBusinessOverview();
            return json(result.data);
          } catch (err) {
            log.error(`[wintent] business_overview error: ${err}`);
            return errorResult(
              `Failed to generate business overview: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        },
      }) as unknown as AnyAgentTool,
    { optional: true },
  );

  // ─── Confirm Action Tool (human-in-the-loop) ───

  api.registerTool(
    () =>
      ({
        name: "confirm_action",
        label: "Confirm Action",
        description:
          "Ask the user to confirm or cancel an action before proceeding. Use this before destructive or important operations.",
        parameters: ConfirmActionSchema,
        async execute(_toolCallId: string, params: ConfirmActionParams) {
          log.info(`[wintent] confirm_action: ${JSON.stringify(params)}`);
          // This tool returns the params for the frontend ConfirmCard to render.
          // The frontend will call addResult() with {confirmed: true/false}.
          return json({
            action_description: params.action_description,
            severity: params.severity || "info",
            confirm_label: params.confirm_label || "确认",
            cancel_label: params.cancel_label || "取消",
            awaiting_confirmation: true,
          });
        },
      }) as unknown as AnyAgentTool,
    { optional: true },
  );

  // ─── Phase 4: Kanban Tools ───

  api.registerTool(
    () =>
      ({
        name: "show_kanban",
        label: "Show Kanban Board",
        description:
          "Show the kanban board with projects, plans, and tasks. Use this when the user asks to see project progress, task lists, or the kanban board.",
        parameters: ShowKanbanSchema,
        async execute(_toolCallId: string, params: ShowKanbanParams) {
          log.info(`[wintent] show_kanban: ${JSON.stringify(params)}`);
          try {
            // Fetch projects
            const projectsRes = await listKanbanProjects(params.project_id);
            const projects = projectsRes.data || [];

            // Build hierarchy: projects → plans → tasks
            const result = [];
            let totalTasks = 0,
              pending = 0,
              inProgress = 0,
              completed = 0;

            for (const project of projects) {
              const plansRes = await listKanbanPlans(project.id, params.plan_id);
              const plans = plansRes.data || [];

              const planResults = [];
              for (const plan of plans) {
                const tasksRes = await listKanbanTasks(plan.id, params.status_filter);
                const tasks = tasksRes.data || [];

                for (const t of tasks) {
                  totalTasks++;
                  if (t.status === "pending") pending++;
                  else if (t.status === "in_progress") inProgress++;
                  else if (t.status === "completed") completed++;
                }

                planResults.push({
                  id: plan.id,
                  name: plan.name,
                  description: plan.description,
                  status: plan.status,
                  tasks: tasks.map((t) => ({
                    id: t.id,
                    name: t.name,
                    description: t.description,
                    status: t.status,
                    assignee: t.assignee,
                    due_date: t.due_date,
                    estimated_hours: t.estimated_hours,
                  })),
                });
              }

              result.push({
                id: project.id,
                name: project.name,
                description: project.description,
                status: project.status,
                plans: planResults,
              });
            }

            return json({
              projects: result,
              summary: {
                total_tasks: totalTasks,
                pending,
                in_progress: inProgress,
                completed,
              },
            });
          } catch (err) {
            log.error(`[wintent] show_kanban error: ${err}`);
            return errorResult(
              `Failed to load kanban: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        },
      }) as unknown as AnyAgentTool,
    { optional: true },
  );

  api.registerTool(
    () =>
      ({
        name: "update_task_status",
        label: "Update Task Status",
        description:
          "Update the status of a kanban task. Use this when the user wants to mark a task as in progress or completed.",
        parameters: UpdateTaskStatusSchema,
        async execute(_toolCallId: string, params: UpdateTaskStatusParams) {
          log.info(`[wintent] update_task_status: ${JSON.stringify(params)}`);
          try {
            const result = await updateKanbanTaskStatus(params.task_id, params.new_status);
            const statusLabels: Record<string, string> = {
              pending: "待处理",
              in_progress: "进行中",
              completed: "已完成",
            };
            return json({
              success: true,
              task: result.data,
              message: `任务已更新为「${statusLabels[params.new_status] || params.new_status}」`,
            });
          } catch (err) {
            log.error(`[wintent] update_task_status error: ${err}`);
            return errorResult(
              `Failed to update task: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        },
      }) as unknown as AnyAgentTool,
    { optional: true },
  );

  // ─── Phase 4: Methodology Tools ───

  api.registerTool(
    () =>
      ({
        name: "list_methodologies",
        label: "List Methodology Templates",
        description:
          "List available methodology templates for business operations. Use this when the user asks about methodologies, business processes, or operational guides.",
        parameters: ListMethodologiesSchema,
        async execute(_toolCallId: string, params: ListMethodologiesParams) {
          log.info(`[wintent] list_methodologies: ${JSON.stringify(params)}`);
          try {
            const result = await listMethodologyTemplates(params);
            const templates = result.data || [];
            return json({
              templates: templates.map((t) => ({
                id: t.id,
                name: t.name,
                category: t.category,
                industry: t.industry,
                description: t.description,
                icon: t.icon,
                steps: t.steps || [],
                trigger_words: t.trigger_words,
              })),
              total: templates.length,
            });
          } catch (err) {
            log.error(`[wintent] list_methodologies error: ${err}`);
            return errorResult(
              `Failed to list methodologies: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        },
      }) as unknown as AnyAgentTool,
    { optional: true },
  );

  api.registerTool(
    () =>
      ({
        name: "show_methodology",
        label: "Show Methodology Template",
        description:
          "Show a specific methodology template with detailed steps, checklists, and expected outputs. Use this when the user wants to follow a specific methodology or asks about a business process like '新店开业', '换季上新', 'VIP客户维护'.",
        parameters: ShowMethodologySchema,
        async execute(_toolCallId: string, params: ShowMethodologyParams) {
          log.info(`[wintent] show_methodology: ${JSON.stringify(params)}`);
          try {
            const result = await getMethodologyTemplate({
              id: params.template_id,
              name: params.template_name,
            });
            return json({
              template: {
                id: result.data.id,
                name: result.data.name,
                category: result.data.category,
                industry: result.data.industry,
                description: result.data.description,
                icon: result.data.icon,
                steps: result.data.steps || [],
              },
            });
          } catch (err) {
            log.error(`[wintent] show_methodology error: ${err}`);
            return errorResult(
              `Failed to show methodology: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        },
      }) as unknown as AnyAgentTool,
    { optional: true },
  );

  log.info("[wintent] Wintent clothing store tools registered (11 tools)");
}
