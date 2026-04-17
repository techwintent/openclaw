/**
 * NocoBase REST API client for Wintent OpenClaw Skills
 *
 * Calls NocoBase REST API to manage clothing store data.
 * IMPORTANT: NocoBase uses camelCase field names (productName, saleDate, etc.)
 * while the tool interface uses snake_case. This client handles the mapping.
 *
 * Configuration via environment variables:
 *   NOCOBASE_API_URL  — NocoBase base URL (default: http://nocobase:13000)
 *   NOCOBASE_API_TOKEN — Bearer token for authentication
 */

const NOCOBASE_URL = process.env.NOCOBASE_API_URL || "http://nocobase:13000";
const NOCOBASE_ACCOUNT = process.env.NOCOBASE_ACCOUNT || "nocobase";
const NOCOBASE_PASSWORD = process.env.NOCOBASE_PASSWORD || "admin123";

type NocoBaseResponse<T = unknown> = {
  data: T;
  meta?: { count?: number; page?: number; pageSize?: number };
};

/** Cached auth token with expiry */
let cachedToken = process.env.NOCOBASE_API_TOKEN || "";
let tokenExpiresAt = 0;

/** Sign in to NocoBase and cache the token */
async function ensureToken(): Promise<string> {
  if (cachedToken && (tokenExpiresAt === 0 || Date.now() < tokenExpiresAt)) {
    return cachedToken;
  }

  const res = await fetch(`${NOCOBASE_URL}/api/auth:signIn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: NOCOBASE_ACCOUNT, password: NOCOBASE_PASSWORD }),
  });

  if (!res.ok) {
    throw new Error(`NocoBase auth failed: ${res.status}`);
  }

  const body = (await res.json()) as { data?: { token?: string } };
  const token = body?.data?.token;
  if (!token) {
    throw new Error("NocoBase auth: no token in response");
  }

  cachedToken = token;
  // Refresh 20 minutes before expiry (JWT default is usually 24h)
  tokenExpiresAt = Date.now() + 23 * 60 * 60 * 1000;
  return cachedToken;
}

/** Make a request to NocoBase REST API */
async function nbFetch<T = unknown>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    params?: Record<string, string | number | undefined>;
  } = {},
): Promise<NocoBaseResponse<T>> {
  const url = new URL(`${NOCOBASE_URL}/api${path}`);

  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const token = await ensureToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  let response = await fetch(url.toString(), {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  // If 401, token might have expired — refresh and retry once
  if (response.status === 401) {
    cachedToken = "";
    tokenExpiresAt = 0;
    const newToken = await ensureToken();
    headers.Authorization = `Bearer ${newToken}`;
    response = await fetch(url.toString(), {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`NocoBase API error ${response.status}: ${errorText}`);
  }

  return response.json() as Promise<NocoBaseResponse<T>>;
}

// ─── Sales ───
// NocoBase fields: productName, quantity, unitPrice, totalAmount, saleDate, notes, category

export interface SaleRecord {
  id?: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_amount?: number;
  sale_date?: string;
  notes?: string;
  created_at?: string;
}

/** Map NocoBase camelCase to snake_case tool format */
function mapSaleRecord(nb: Record<string, unknown>): SaleRecord {
  return {
    id: nb.id as number,
    product_name: (nb.productName as string) || "",
    quantity: (nb.quantity as number) || 0,
    unit_price: (nb.unitPrice as number) || 0,
    total_amount: (nb.totalAmount as number) || 0,
    sale_date: nb.saleDate as string,
    notes: nb.notes as string,
    created_at: nb.createdAt as string,
  };
}

/** Create a new sale record */
export async function createSale(sale: Omit<SaleRecord, "id" | "created_at">) {
  const result = await nbFetch<Record<string, unknown>>("/sales:create", {
    method: "POST",
    body: {
      productName: sale.product_name,
      quantity: sale.quantity,
      unitPrice: sale.unit_price,
      totalAmount: sale.quantity * sale.unit_price,
      saleDate: sale.sale_date || new Date().toISOString().split("T")[0],
      notes: sale.notes,
    },
  });
  return { data: mapSaleRecord(result.data) };
}

/** Query sales records with optional filters */
export async function querySales(params?: {
  start_date?: string;
  end_date?: string;
  product_name?: string;
  page?: number;
  page_size?: number;
}) {
  const filter: Record<string, unknown> = {};
  if (params?.start_date) {
    filter.saleDate = { $gte: params.start_date };
  }
  if (params?.end_date) {
    filter.saleDate = { ...(filter.saleDate as object), $lte: params.end_date };
  }
  if (params?.product_name) {
    filter.productName = { $includes: params.product_name };
  }

  const result = await nbFetch<Record<string, unknown>[]>("/sales:list", {
    params: {
      filter: JSON.stringify(filter),
      page: params?.page || 1,
      pageSize: params?.page_size || 20,
    },
  });
  return {
    data: (result.data || []).map(mapSaleRecord),
    meta: result.meta,
  };
}

// ─── Inventory ───
// NocoBase fields: productName, sku, category, quantity, unitPrice, minStock

export interface InventoryItem {
  id?: number;
  product_name: string;
  sku?: string;
  category?: string;
  quantity: number;
  min_stock?: number;
  unit_price?: number;
  status?: string;
}

/** Map NocoBase camelCase to snake_case tool format */
function mapInventoryItem(nb: Record<string, unknown>): InventoryItem {
  return {
    id: nb.id as number,
    product_name: (nb.productName as string) || "",
    sku: nb.sku as string,
    category: nb.category as string,
    quantity: (nb.quantity as number) || 0,
    min_stock: (nb.minStock as number) || 10,
    unit_price: (nb.unitPrice as number) || 0,
  };
}

/** Query inventory items */
export async function queryInventory(params?: {
  product_name?: string;
  category?: string;
  page?: number;
  page_size?: number;
}) {
  const filter: Record<string, unknown> = {};
  if (params?.product_name) {
    filter.productName = { $includes: params.product_name };
  }
  if (params?.category) {
    filter.category = params.category;
  }

  const result = await nbFetch<Record<string, unknown>[]>("/products:list", {
    params: {
      filter: JSON.stringify(filter),
      page: params?.page || 1,
      pageSize: params?.page_size || 50,
    },
  });
  return {
    data: (result.data || []).map(mapInventoryItem),
    meta: result.meta,
  };
}

/** Check for low stock items (quantity <= 10) */
export async function checkLowStock() {
  const result = await nbFetch<Record<string, unknown>[]>("/products:list", {
    params: {
      filter: JSON.stringify({ quantity: { $lte: 10 } }),
      sort: "quantity",
      pageSize: "100",
    },
  });
  return {
    data: (result.data || []).map(mapInventoryItem),
    meta: result.meta,
  };
}

// ─── Methodology Templates (Phase 4) ───

export interface MethodologyTemplate {
  id: number;
  name: string;
  category: string;
  industry: string;
  description: string;
  icon?: string;
  steps: Array<{
    order: number;
    name: string;
    description: string;
    checklist: string[];
    outputs: string[];
  }>;
  trigger_words?: string[];
}

/** List methodology templates */
export async function listMethodologyTemplates(params?: { category?: string; industry?: string }) {
  const filter: Record<string, unknown> = {};
  if (params?.category) {
    filter.category = params.category;
  }
  if (params?.industry) {
    filter.industry = { $includes: params.industry };
  }
  return nbFetch<MethodologyTemplate[]>("/methodology_templates:list", {
    params: {
      filter: JSON.stringify(filter),
      pageSize: "50",
    },
  });
}

/** Get a single methodology template by ID or name */
export async function getMethodologyTemplate(params: { id?: number; name?: string }) {
  if (params.id) {
    return nbFetch<MethodologyTemplate>(`/methodology_templates:get/${params.id}`);
  }
  if (params.name) {
    const result = await nbFetch<MethodologyTemplate[]>("/methodology_templates:list", {
      params: {
        filter: JSON.stringify({ name: { $includes: params.name } }),
        pageSize: "1",
      },
    });
    const items = (result as unknown as { data: MethodologyTemplate[] }).data;
    if (items && items.length > 0) {
      return { data: items[0] };
    }
    throw new Error(`Template not found: ${params.name}`);
  }
  throw new Error("Either id or name is required");
}

// ─── Reports ───

export interface SalesSummary {
  total_revenue: number;
  total_orders: number;
  avg_order_value: number;
  top_products: Array<{ product_name: string; quantity: number; revenue: number }>;
  daily_sales?: Array<{ date: string; revenue: number; orders: number }>;
}

/** Generate sales report */
export async function generateSalesReport(params?: {
  start_date?: string;
  end_date?: string;
  group_by?: "day" | "week" | "month";
}) {
  const salesResult = await querySales({
    start_date: params?.start_date,
    end_date: params?.end_date,
    page_size: 1000,
  });

  const sales = salesResult.data || [];
  const totalRevenue = sales.reduce((sum, s) => sum + (s.total_amount || 0), 0);
  const totalOrders = sales.length;

  const productMap = new Map<string, { quantity: number; revenue: number }>();
  for (const sale of sales) {
    const existing = productMap.get(sale.product_name) || { quantity: 0, revenue: 0 };
    existing.quantity += sale.quantity;
    existing.revenue += sale.total_amount || 0;
    productMap.set(sale.product_name, existing);
  }
  const topProducts = Array.from(productMap.entries())
    .map(([product_name, stats]) => ({ product_name, ...stats }))
    .toSorted((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const dayMap = new Map<string, { revenue: number; orders: number }>();
  for (const sale of sales) {
    const date = sale.sale_date || sale.created_at?.split("T")[0] || "unknown";
    const existing = dayMap.get(date) || { revenue: 0, orders: 0 };
    existing.revenue += sale.total_amount || 0;
    existing.orders += 1;
    dayMap.set(date, existing);
  }
  const dailySales = Array.from(dayMap.entries())
    .map(([date, stats]) => ({ date, ...stats }))
    .toSorted((a, b) => a.date.localeCompare(b.date));

  return {
    data: {
      total_revenue: totalRevenue,
      total_orders: totalOrders,
      avg_order_value: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      top_products: topProducts,
      daily_sales: dailySales,
    } satisfies SalesSummary,
  };
}

/** Generate business overview */
export async function generateBusinessOverview() {
  const [salesResult, inventoryResult, lowStockResult] = await Promise.all([
    querySales({ page_size: 1000 }),
    queryInventory({ page_size: 1000 }),
    checkLowStock(),
  ]);

  const sales = salesResult.data || [];
  const inventory = inventoryResult.data || [];
  const lowStock = lowStockResult.data || [];

  const totalRevenue = sales.reduce((sum, s) => sum + (s.total_amount || 0), 0);
  const totalProducts = inventory.length;
  const totalStockValue = inventory.reduce(
    (sum, item) => sum + item.quantity * (item.unit_price || 0),
    0,
  );

  return {
    data: {
      sales_summary: {
        total_revenue: totalRevenue,
        total_orders: sales.length,
        avg_order_value: sales.length > 0 ? totalRevenue / sales.length : 0,
      },
      inventory_summary: {
        total_products: totalProducts,
        total_stock_value: totalStockValue,
        low_stock_count: lowStock.length,
        low_stock_items: lowStock.slice(0, 5).map((item) => ({
          product_name: item.product_name,
          quantity: item.quantity,
          min_stock: item.min_stock || 10,
        })),
      },
    },
  };
}
