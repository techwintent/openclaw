/**
 * TypeBox schemas for Wintent clothing store tools
 *
 * Defines OpenAI Function Calling-compatible parameter schemas
 * for sales, inventory, and report tools.
 */

import { Type } from "@sinclair/typebox";
import { optionalStringEnum, stringEnum } from "openclaw/plugin-sdk/core";

// ─── Sales Tool Schemas ───

export const CreateSaleSchema = Type.Object(
  {
    product_name: Type.String({ description: "Name of the product sold" }),
    quantity: Type.Integer({ description: "Quantity sold", minimum: 1 }),
    unit_price: Type.Number({ description: "Price per unit in CNY", minimum: 0 }),
    sale_date: Type.Optional(
      Type.String({ description: "Sale date in YYYY-MM-DD format. Defaults to today." }),
    ),
    notes: Type.Optional(Type.String({ description: "Optional notes about this sale" })),
  },
  { description: "Create a new sales record" },
);

export const QuerySalesSchema = Type.Object(
  {
    start_date: Type.Optional(
      Type.String({ description: "Filter sales from this date (YYYY-MM-DD)" }),
    ),
    end_date: Type.Optional(
      Type.String({ description: "Filter sales until this date (YYYY-MM-DD)" }),
    ),
    product_name: Type.Optional(
      Type.String({ description: "Filter by product name (partial match)" }),
    ),
    page: Type.Optional(Type.Integer({ description: "Page number (default: 1)", minimum: 1 })),
    page_size: Type.Optional(
      Type.Integer({ description: "Items per page (default: 20)", minimum: 1, maximum: 100 }),
    ),
  },
  { description: "Query sales records with optional filters" },
);

// ─── Inventory Tool Schemas ───

export const QueryInventorySchema = Type.Object(
  {
    product_name: Type.Optional(
      Type.String({ description: "Filter by product name (partial match)" }),
    ),
    category: Type.Optional(Type.String({ description: "Filter by product category" })),
    page: Type.Optional(Type.Integer({ description: "Page number (default: 1)", minimum: 1 })),
    page_size: Type.Optional(
      Type.Integer({ description: "Items per page (default: 50)", minimum: 1, maximum: 100 }),
    ),
  },
  { description: "Query current inventory/product stock levels" },
);

export const CheckLowStockSchema = Type.Object(
  {},
  { description: "Check for products with low stock levels that may need restocking" },
);

// ─── Report Tool Schemas ───

export const SalesReportSchema = Type.Object(
  {
    start_date: Type.Optional(Type.String({ description: "Report start date (YYYY-MM-DD)" })),
    end_date: Type.Optional(Type.String({ description: "Report end date (YYYY-MM-DD)" })),
    group_by: optionalStringEnum(["day", "week", "month"] as const, {
      description: "Group results by time period (default: day)",
    }),
  },
  { description: "Generate a sales report with revenue summary and top products" },
);

export const BusinessOverviewSchema = Type.Object(
  {},
  {
    description:
      "Generate a comprehensive business overview including sales, inventory status, and key metrics",
  },
);

// ─── Kanban Tool Schemas (Phase 4) ───

export const ShowKanbanSchema = Type.Object(
  {
    project_id: Type.Optional(
      Type.Integer({ description: "Filter by project ID. If omitted, shows all projects." }),
    ),
    plan_id: Type.Optional(
      Type.Integer({ description: "Filter by plan ID. If omitted, shows all plans." }),
    ),
    status_filter: optionalStringEnum(["pending", "in_progress", "completed"] as const, {
      description: "Filter tasks by status: pending, in_progress, completed",
    }),
  },
  { description: "Show kanban board with projects, plans, and tasks hierarchy" },
);

export const UpdateTaskStatusSchema = Type.Object(
  {
    task_id: Type.Integer({ description: "The ID of the task to update" }),
    new_status: stringEnum(["pending", "in_progress", "completed"] as const, {
      description: "New status: pending, in_progress, or completed",
    }),
  },
  { description: "Update a kanban task status" },
);

// ─── Methodology Tool Schemas (Phase 4) ───

export const ListMethodologiesSchema = Type.Object(
  {
    category: Type.Optional(Type.String({ description: "Filter by category: system or custom" })),
    industry: Type.Optional(Type.String({ description: "Filter by industry, e.g. 服装零售" })),
  },
  { description: "List available methodology templates for business operations" },
);

export const ShowMethodologySchema = Type.Object(
  {
    template_id: Type.Optional(
      Type.Integer({ description: "The ID of the methodology template to show" }),
    ),
    template_name: Type.Optional(
      Type.String({ description: "The name of the methodology template (partial match)" }),
    ),
  },
  { description: "Show a specific methodology template with its steps and checklists" },
);

// ─── Confirm Action Schema ───

export const ConfirmActionSchema = Type.Object(
  {
    action_description: Type.String({ description: "Description of the action to confirm" }),
    severity: optionalStringEnum(["info", "warning", "danger"] as const, {
      description: "Severity level of the action (default: info)",
    }),
    confirm_label: Type.Optional(
      Type.String({ description: "Custom label for the confirm button" }),
    ),
    cancel_label: Type.Optional(Type.String({ description: "Custom label for the cancel button" })),
  },
  { description: "Ask the user to confirm or cancel an action before proceeding" },
);
