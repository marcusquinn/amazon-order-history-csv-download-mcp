#!/usr/bin/env node

/**
 * Amazon Order History CSV Download MCP Server
 *
 * MCP server for extracting Amazon order history and exporting to CSV.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  ProgressNotification,
} from "@modelcontextprotocol/sdk/types.js";
import { chromium, BrowserContext, Page } from "playwright";
import { join } from "path";
import { homedir } from "os";

import { AmazonPlugin } from "./amazon/adapter";
import { getRegionCodes } from "./amazon/regions";
import {
  fetchOrders,
  exportOrdersCSV,
  exportItemsCSV,
  exportShipmentsCSV,
  exportTransactionsCSV,
  exportGiftCardTransactionsCSV,
  getOutputPath,
  estimateExtractionTime,
  GiftCardTransactionCSVData,
} from "./tools";
import { extractTransactionsFromPage } from "./amazon/extractors/transactions-page";
import {
  extractGiftCardData,
  GiftCardData,
} from "./amazon/extractors/gift-card";

// Initialize the Amazon plugin
const amazonPlugin = new AmazonPlugin();

// Browser context instance (lazy initialized)
let browserContext: BrowserContext | null = null;
let page: Page | null = null;

// Browser data directory for session persistence
const BROWSER_DATA_DIR = join(
  homedir(),
  ".amazon-order-history-mcp",
  "browser-data",
);

/**
 * Get or create browser context instance.
 */
async function getBrowserContext(): Promise<BrowserContext> {
  if (!browserContext) {
    browserContext = await chromium.launchPersistentContext(BROWSER_DATA_DIR, {
      headless: false, // Need visible browser for login
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
  }
  return browserContext;
}

/**
 * Get or create page instance.
 */
async function getPage(): Promise<Page> {
  const context = await getBrowserContext();
  if (!page || page.isClosed()) {
    const pages = context.pages();
    page = pages[0] || (await context.newPage());
  }
  return page;
}

/**
 * Validate region parameter and return error response if invalid.
 */
function validateRegion(
  region: string | undefined,
  args: Record<string, unknown> | undefined,
): { content: Array<{ type: string; text: string }>; isError: true } | null {
  if (!region) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: "region parameter is required",
              validRegions: getRegionCodes(),
              receivedArgs: args,
            },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }

  if (!getRegionCodes().includes(region)) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: `Invalid region: "${region}"`,
              validRegions: getRegionCodes(),
              receivedArgs: args,
            },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }

  return null; // Valid region
}

// Define MCP tools
const tools: Tool[] = [
  {
    name: "get_amazon_orders",
    description:
      "Fetch Amazon order history for a specified date range or year. Returns order summaries including: order ID, date, total amount, status, item count, shipping address (7 lines), payment method, and Subscribe & Save frequency. Optionally includes detailed item data (ASIN, name, price, quantity, seller, condition) and shipment tracking. Use for browsing order history or building reports.",
    inputSchema: {
      type: "object",
      properties: {
        region: {
          type: "string",
          description: `Amazon region code. Supported: ${getRegionCodes().join(", ")}`,
          enum: getRegionCodes(),
        },
        year: {
          type: "number",
          description:
            "Year to fetch orders from (e.g., 2024). If omitted, uses current year.",
        },
        start_date: {
          type: "string",
          description:
            "Start date in ISO format (YYYY-MM-DD). Overrides year if provided.",
        },
        end_date: {
          type: "string",
          description:
            "End date in ISO format (YYYY-MM-DD). Overrides year if provided.",
        },
        include_items: {
          type: "boolean",
          description:
            "Extract item details (ASIN, name, price, quantity, seller, condition) from each order's invoice page. Adds ~2s per order.",
          default: false,
        },
        include_shipments: {
          type: "boolean",
          description:
            "Extract shipment info (delivery status, tracking link) from each order's detail page. Adds ~2s per order. Note: tracking link URL is captured but not the carrier tracking number - use fetch_tracking_numbers for that.",
          default: false,
        },
        fetch_tracking_numbers: {
          type: "boolean",
          description:
            "Extract actual carrier tracking numbers (e.g., AZ218181365JE) by visiting each shipment's 'Track package' page. Adds ~2s per shipment. Only works when include_shipments is true.",
          default: false,
        },
        max_orders: {
          type: "number",
          description:
            "Maximum number of orders to fetch. Use to limit results for large accounts or avoid timeouts.",
        },
      },
      required: ["region"],
    },
  },
  {
    name: "get_amazon_order_details",
    description:
      "Get comprehensive details for a specific Amazon order by order ID. Returns full order data including: items (ASIN, name, price, quantity, seller, condition), financial breakdown (subtotal, shipping, tax, VAT, promotions, total), shipping address, payment methods, and optionally shipment tracking and transaction history.",
    inputSchema: {
      type: "object",
      properties: {
        order_id: {
          type: "string",
          description:
            "Amazon order ID in format XXX-XXXXXXX-XXXXXXX (e.g., 123-4567890-1234567)",
        },
        region: {
          type: "string",
          description: "Amazon region code where the order was placed",
          enum: getRegionCodes(),
        },
        include_shipments: {
          type: "boolean",
          description:
            "Extract shipment info from order detail page (default: true)",
          default: true,
        },
        fetch_tracking_numbers: {
          type: "boolean",
          description:
            "Extract actual carrier tracking number (e.g., AZ218181365JE) by visiting the 'Track package' page. Adds ~2s per shipment.",
          default: false,
        },
        include_transactions: {
          type: "boolean",
          description: "Include payment transaction details (default: false)",
          default: false,
        },
      },
      required: ["order_id", "region"],
    },
  },
  {
    name: "export_amazon_orders_csv",
    description:
      "Export Amazon orders summary to CSV file. Fast extraction from order list page (~0.5s per 10 orders). CSV columns: Order ID, Date, Total, Status, Item Count, Address (7 lines), Subscribe & Save, Platform, Region, Order URL. Defaults to ~/Downloads with auto-generated filename. For large accounts (500+ orders), use max_orders to batch exports and avoid timeouts.",
    inputSchema: {
      type: "object",
      properties: {
        region: {
          type: "string",
          description: "Amazon region code",
          enum: getRegionCodes(),
        },
        year: {
          type: "number",
          description: "Year to export (defaults to current year)",
        },
        start_date: {
          type: "string",
          description: "Start date in ISO format (YYYY-MM-DD)",
        },
        end_date: {
          type: "string",
          description: "End date in ISO format (YYYY-MM-DD)",
        },
        output_path: {
          type: "string",
          description:
            "Full path to save CSV file. Defaults to ~/Downloads/amazon-{region}-orders-{year}-{date}.csv",
        },
        max_orders: {
          type: "number",
          description:
            "Maximum number of orders to export. Recommended: 100-200 per batch for large accounts.",
        },
      },
      required: ["region"],
    },
  },
  {
    name: "export_amazon_items_csv",
    description:
      "Export detailed Amazon order items to CSV file. Visits each order's invoice page to extract item-level data (~2s/order). CSV columns: Order ID, Date, ASIN, Product Name, Condition, Quantity, Unit Price, Item Total, Seller, Subscribe & Save, Order financials (Subtotal, Shipping, Tax, VAT, Promotion, Total), Status, Address (7 lines), Payment Method, Product URL, Order URL, Region. Ideal for expense tracking, inventory analysis, or accounting exports.",
    inputSchema: {
      type: "object",
      properties: {
        region: {
          type: "string",
          description: "Amazon region code",
          enum: getRegionCodes(),
        },
        year: {
          type: "number",
          description: "Year to export (defaults to current year)",
        },
        start_date: {
          type: "string",
          description: "Start date in ISO format (YYYY-MM-DD)",
        },
        end_date: {
          type: "string",
          description: "End date in ISO format (YYYY-MM-DD)",
        },
        output_path: {
          type: "string",
          description:
            "Full path to save CSV file. Defaults to ~/Downloads/amazon-{region}-items-{year}-{date}.csv",
        },
        max_orders: {
          type: "number",
          description:
            "Maximum number of orders to process. Recommended: 50-100 per batch due to ~2s/order extraction time.",
        },
      },
      required: ["region"],
    },
  },
  {
    name: "export_amazon_shipments_csv",
    description:
      "Export Amazon shipment tracking data to CSV file. Visits each order's detail page to extract tracking info (~4s/order). CSV columns: Order ID, Date, Shipment ID, Status, Delivered (Yes/No/Unknown), Tracking ID, Tracking URL, Items in Shipment, Item Names, Payment Amount, Refund. Useful for tracking deliveries and reconciling shipments.",
    inputSchema: {
      type: "object",
      properties: {
        region: {
          type: "string",
          description: "Amazon region code",
          enum: getRegionCodes(),
        },
        year: {
          type: "number",
          description: "Year to export (defaults to current year)",
        },
        start_date: {
          type: "string",
          description: "Start date in ISO format (YYYY-MM-DD)",
        },
        end_date: {
          type: "string",
          description: "End date in ISO format (YYYY-MM-DD)",
        },
        output_path: {
          type: "string",
          description:
            "Full path to save CSV file. Defaults to ~/Downloads/amazon-{region}-shipments-{year}-{date}.csv",
        },
        max_orders: {
          type: "number",
          description:
            "Maximum number of orders to process. Recommended: 25-50 per batch due to ~4s/order extraction time.",
        },
        fetch_tracking_numbers: {
          type: "boolean",
          description:
            "Extract actual carrier tracking numbers (e.g., AZ218181365JE) by visiting each shipment's 'Track package' page. Adds ~2s per shipment.",
          default: false,
        },
      },
      required: ["region"],
    },
  },
  {
    name: "export_amazon_transactions_csv",
    description:
      "Export Amazon payment transactions to CSV file. Extracts transaction data from each order's detail page. CSV columns include: date, order ID, amount, payment method, card info. For faster bulk transaction export, consider get_amazon_transactions which scrapes the dedicated transactions page.",
    inputSchema: {
      type: "object",
      properties: {
        region: {
          type: "string",
          description: "Amazon region code",
          enum: getRegionCodes(),
        },
        year: {
          type: "number",
          description: "Year to export (defaults to current year)",
        },
        start_date: {
          type: "string",
          description: "Start date in ISO format (YYYY-MM-DD)",
        },
        end_date: {
          type: "string",
          description: "End date in ISO format (YYYY-MM-DD)",
        },
        output_path: {
          type: "string",
          description:
            "Full path to save CSV file. Defaults to ~/Downloads/amazon-{region}-transactions-{year}-{date}.csv",
        },
        max_orders: {
          type: "number",
          description: "Maximum number of orders to process",
        },
      },
      required: ["region"],
    },
  },
  {
    name: "get_amazon_transactions",
    description:
      "Fetch all Amazon payment transactions from the dedicated transactions page. Faster than per-order extraction as it scrapes the infinite-scroll transactions list. Returns: date, order IDs, amount, payment method, card info (last 4 digits), vendor. Useful for reconciling payments, tracking spending, or exporting for accounting.",
    inputSchema: {
      type: "object",
      properties: {
        region: {
          type: "string",
          description: "Amazon region code",
          enum: getRegionCodes(),
        },
        start_date: {
          type: "string",
          description: "Start date filter in ISO format (YYYY-MM-DD)",
        },
        end_date: {
          type: "string",
          description: "End date filter in ISO format (YYYY-MM-DD)",
        },
        max_scrolls: {
          type: "number",
          description:
            "Maximum scroll attempts to load more transactions. Default: 50. Increase for longer history.",
        },
      },
      required: ["region"],
    },
  },
  {
    name: "get_amazon_gift_card_balance",
    description:
      "Get current Amazon gift card balance and transaction history. Returns: current balance, last updated timestamp, and paginated transaction history (date, description, amount, closing balance, type, associated order ID, claim code, serial number). Supports fetching complete history across multiple pages.",
    inputSchema: {
      type: "object",
      properties: {
        region: {
          type: "string",
          description: "Amazon region code",
          enum: getRegionCodes(),
        },
        max_pages: {
          type: "number",
          description:
            "Maximum pages of transaction history to fetch. Default: 10. Set to 0 for unlimited.",
          default: 10,
        },
        fetch_all_pages: {
          type: "boolean",
          description:
            "Automatically paginate through all available transaction history. Default: true.",
          default: true,
        },
      },
      required: ["region"],
    },
  },
  {
    name: "export_amazon_gift_cards_csv",
    description:
      "Export Amazon gift card transaction history to CSV file. CSV columns: Date, Description, Amount, Closing Balance, Type (credit/debit), Order ID, Claim Code, Serial Number, Region. Useful for tracking gift card usage and reconciling balances.",
    inputSchema: {
      type: "object",
      properties: {
        region: {
          type: "string",
          description: "Amazon region code",
          enum: getRegionCodes(),
        },
        output_path: {
          type: "string",
          description:
            "Full path to save CSV file. Defaults to ~/Downloads/amazon-{region}-gift-cards-{date}.csv",
        },
        max_pages: {
          type: "number",
          description:
            "Maximum pages of transaction history to fetch. Default: 10. Set to 0 for unlimited.",
          default: 10,
        },
      },
      required: ["region"],
    },
  },
  {
    name: "get_amazon_gift_card_transactions",
    description:
      "Get Amazon gift card transaction history with full details. Returns: current balance, transaction count, and detailed transactions (date, description, amount, closing balance, transaction type, order ID, claim code, serial number). Supports pagination for complete history.",
    inputSchema: {
      type: "object",
      properties: {
        region: {
          type: "string",
          description: "Amazon region code",
          enum: getRegionCodes(),
        },
        max_pages: {
          type: "number",
          description:
            "Maximum pages of transaction history to fetch. Default: 10. Set to 0 for unlimited.",
          default: 10,
        },
      },
      required: ["region"],
    },
  },
  {
    name: "check_amazon_auth_status",
    description:
      "Check if the browser session is authenticated with Amazon for a specific region. Returns authentication status (authenticated/not authenticated), current URL, and any error messages. Use this to verify login status before running other tools, or to prompt user to log in if session expired.",
    inputSchema: {
      type: "object",
      properties: {
        region: {
          type: "string",
          description: "Amazon region code to check authentication for",
          enum: getRegionCodes(),
        },
      },
      required: ["region"],
    },
  },
];

// Create server instance
const server = new Server(
  {
    name: "amazon-order-history-csv-download-mcp",
    version: "0.3.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

/**
 * Send progress notification to client.
 */
async function sendProgress(
  progressToken: string | number | undefined,
  progress: number,
  total: number,
  message: string,
): Promise<void> {
  if (!progressToken) return;

  try {
    await server.notification({
      method: "notifications/progress",
      params: {
        progressToken,
        progress,
        total,
        message,
      },
    } as unknown as ProgressNotification);
  } catch (e) {
    // Progress notifications are optional, don't fail on errors
    console.error(`[progress] Failed to send: ${e}`);
  }
}

/**
 * Shared gift card data structure for export.
 */
interface GiftCardExportData {
  balance: {
    amount: number;
    currency: string;
    formatted: string;
  };
  lastUpdated: string;
  region: string;
  transactionCount: number;
  transactions: Array<{
    date: string;
    description: string;
    amount: {
      amount: number;
      currency: string;
      currencySymbol: string;
      formatted: string;
    };
    closingBalance: {
      amount: number;
      currency: string;
      currencySymbol: string;
      formatted: string;
    };
    type: string;
    orderId?: string;
    claimCode?: string;
    serialNumber?: string;
  }>;
}

/**
 * Convert GiftCardData to export format (shared by CSV and JSON exports).
 */
function formatGiftCardDataForExport(
  giftCardData: GiftCardData,
): GiftCardExportData {
  return {
    balance: {
      amount: giftCardData.balance.balance.amount,
      currency: giftCardData.balance.balance.currency,
      formatted: giftCardData.balance.balance.formatted,
    },
    lastUpdated: giftCardData.balance.lastUpdated.toISOString(),
    region: giftCardData.region,
    transactionCount: giftCardData.transactions.length,
    transactions: giftCardData.transactions.map((t) => ({
      date: t.date.toISOString(),
      description: t.description,
      amount: {
        amount: t.amount.amount,
        currency: t.amount.currency,
        currencySymbol: t.amount.currencySymbol,
        formatted: t.amount.formatted,
      },
      closingBalance: {
        amount: t.closingBalance.amount,
        currency: t.closingBalance.currency,
        currencySymbol: t.closingBalance.currencySymbol,
        formatted: t.closingBalance.formatted,
      },
      type: t.type,
      orderId: t.orderId,
      claimCode: t.claimCode,
      serialNumber: t.serialNumber,
    })),
  };
}

/**
 * Convert GiftCardData to CSV export format.
 */
function formatGiftCardDataForCSV(
  giftCardData: GiftCardData,
): GiftCardTransactionCSVData[] {
  return giftCardData.transactions.map((t) => ({
    date: t.date,
    description: t.description,
    amount: t.amount,
    closingBalance: t.closingBalance,
    type: t.type,
    orderId: t.orderId,
    claimCode: t.claimCode,
    serialNumber: t.serialNumber,
    region: giftCardData.region,
  }));
}

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "get_amazon_orders": {
        const regionParam = args?.region as string | undefined;
        const regionError = validateRegion(regionParam, args);
        if (regionError) return regionError;
        const region = regionParam!; // Validated above

        // Get progress token from request meta
        const progressToken = request.params._meta?.progressToken;

        const currentPage = await getPage();
        const result = await fetchOrders(currentPage, amazonPlugin, {
          region,
          year: args?.year as number | undefined,
          startDate: args?.start_date as string | undefined,
          endDate: args?.end_date as string | undefined,
          includeItems: args?.include_items as boolean | undefined,
          includeShipments: args?.include_shipments as boolean | undefined,
          fetchTrackingNumbers: args?.fetch_tracking_numbers as
            | boolean
            | undefined,
          maxOrders: args?.max_orders as number | undefined,
          onProgress: async (message, current, total) => {
            await sendProgress(progressToken, current, total, message);
          },
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "success",
                  // Echo input parameters for debugging
                  params: {
                    region,
                    year: args?.year,
                    startDate: args?.start_date,
                    endDate: args?.end_date,
                    includeItems: args?.include_items,
                    includeShipments: args?.include_shipments,
                    fetchTrackingNumbers: args?.fetch_tracking_numbers,
                    maxOrders: args?.max_orders,
                  },
                  totalOrders: result.totalFound,
                  orders: result.orders.map((o) => ({
                    id: o.id,
                    date: o.date?.toISOString(),
                    total: o.total,
                    status: o.status?.label || "Unknown",
                    // Use itemCount from order header (extracted from list page) or fall back to items array length
                    itemCount: o.itemCount ?? o.items?.length ?? 0,
                    shipmentCount: o.shipments?.length || 0,
                    // Enhanced order header data from list page
                    subtotal: o.subtotal,
                    shipping: o.shipping,
                    tax: o.tax,
                    vat: o.vat,
                    promotion: o.promotion,
                    grandTotal: o.grandTotal,
                    // Shipping address
                    shippingAddress: o.shippingAddress,
                    // Payment method from list page
                    paymentMethod: o.paymentMethod,
                    // Recipient (simple name)
                    recipient:
                      typeof o.recipient === "object"
                        ? o.recipient
                        : { name: o.recipient },
                    // Payments from detail/invoice
                    payments: o.payments,
                    // Include items when extracted
                    items: o.items?.map((i) => ({
                      name: i.name,
                      asin: i.asin,
                      quantity: i.quantity,
                      unitPrice: i.unitPrice,
                      condition: i.condition,
                      seller: i.seller?.name,
                      subscriptionFrequency: i.subscriptionFrequency,
                    })),
                    // Include shipments when extracted
                    shipments: o.shipments?.map((s) => ({
                      shipmentId: s.shipmentId,
                      status: s.status,
                      delivered: s.delivered,
                      trackingId: s.trackingId,
                      carrier: s.carrier,
                      trackingLink: s.trackingLink,
                      itemCount: s.items?.length || 0,
                    })),
                  })),
                  itemCount: result.items.length,
                  shipmentCount: result.shipments.length,
                  errors: result.errors,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "get_amazon_order_details": {
        const regionParam = args?.region as string | undefined;
        const regionError = validateRegion(regionParam, args);
        if (regionError) return regionError;
        const region = regionParam!;

        const currentPage = await getPage();
        const orderId = args?.order_id as string;
        const includeShipments = args?.include_shipments as boolean | undefined;
        const fetchTrackingNumbers = args?.fetch_tracking_numbers as
          | boolean
          | undefined;
        const includeTransactions = args?.include_transactions as
          | boolean
          | undefined;

        // Use the same fetchOrders logic that works for get_amazon_orders
        const result = await fetchOrders(currentPage, amazonPlugin, {
          region,
          orderId, // This triggers single-order mode
          includeItems: true,
          includeShipments: includeShipments ?? true,
          fetchTrackingNumbers: fetchTrackingNumbers ?? false,
          includeTransactions: includeTransactions ?? false,
        });

        const order = result.orders[0];

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: result.errors.length > 0 ? "error" : "success",
                  params: {
                    orderId,
                    region,
                    includeShipments,
                    fetchTrackingNumbers,
                    includeTransactions,
                  },
                  order: order
                    ? {
                        id: order.id,
                        date: order.date?.toISOString(),
                        total: order.total,
                        shipping: order.shipping,
                        tax: order.tax,
                        recipient: order.recipient,
                        payments: order.payments,
                        itemCount: order.items?.length || 0,
                        shipmentCount: order.shipments?.length || 0,
                      }
                    : null,
                  items: result.items.map((i) => ({
                    name: i.name,
                    asin: i.asin,
                    quantity: i.quantity,
                    unitPrice: i.unitPrice,
                    condition: i.condition,
                    seller: i.seller?.name,
                    subscriptionFrequency: i.subscriptionFrequency,
                  })),
                  shipments: result.shipments.map((s) => ({
                    shipmentId: s.shipmentId,
                    status: s.status,
                    delivered: s.delivered,
                    trackingId: s.trackingId,
                    carrier: s.carrier,
                    trackingLink: s.trackingLink,
                    itemCount: s.items?.length || 0,
                  })),
                  transactions: result.transactions.map((t) => ({
                    date: t.date.toISOString(),
                    amount: t.amount,
                    vendor: t.vendor,
                    cardInfo: t.cardInfo,
                  })),
                  errors: result.errors,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "export_amazon_orders_csv": {
        const regionParam = args?.region as string | undefined;
        const regionError = validateRegion(regionParam, args);
        if (regionError) return regionError;
        const region = regionParam!;

        const currentPage = await getPage();
        const year = args?.year as number | undefined;
        const startDate = args?.start_date as string | undefined;
        const endDate = args?.end_date as string | undefined;
        const maxOrders = args?.max_orders as number | undefined;
        const outputPath = getOutputPath(
          args?.output_path as string | undefined,
          "orders",
          region,
          { year, startDate, endDate },
        );

        const fetchResult = await fetchOrders(currentPage, amazonPlugin, {
          region,
          year,
          startDate,
          endDate,
          includeItems: false,
          includeShipments: false,
          maxOrders,
        });

        // Calculate time estimate for informational purposes
        const timeEstimate = estimateExtractionTime(fetchResult.orders.length, {
          includeItems: false,
          includeShipments: false,
        });

        const exportResult = await exportOrdersCSV(
          fetchResult.orders,
          outputPath,
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: exportResult.success ? "success" : "error",
                  params: {
                    region,
                    year,
                    startDate,
                    endDate,
                    maxOrders,
                    outputPath,
                  },
                  filePath: exportResult.filePath,
                  rowCount: exportResult.rowCount,
                  error: exportResult.error,
                  fetchErrors: fetchResult.errors,
                  // Include timing info for transparency
                  timing: {
                    orderCount: fetchResult.orders.length,
                    estimate: timeEstimate.formattedEstimate,
                    warnings: timeEstimate.warnings,
                    recommendations: timeEstimate.recommendations,
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "export_amazon_items_csv": {
        const regionParam = args?.region as string | undefined;
        const regionError = validateRegion(regionParam, args);
        if (regionError) return regionError;
        const region = regionParam!;

        const currentPage = await getPage();
        const year = args?.year as number | undefined;
        const startDate = args?.start_date as string | undefined;
        const endDate = args?.end_date as string | undefined;
        const maxOrders = args?.max_orders as number | undefined;
        const outputPath = getOutputPath(
          args?.output_path as string | undefined,
          "items",
          region,
          { year, startDate, endDate },
        );

        // Pre-estimate time for items extraction (slower due to invoice/detail page visits)
        const preEstimate = estimateExtractionTime(maxOrders || 100, {
          includeItems: true,
          includeShipments: false,
          useInvoice: true,
        });

        // Warn if this might take a while
        if (preEstimate.warnings.length > 0) {
          console.error(
            `[export-items] Time estimate: ${preEstimate.formattedEstimate}`,
          );
          console.error(
            `[export-items] Warnings: ${preEstimate.warnings.join(", ")}`,
          );
        }

        const fetchResult = await fetchOrders(currentPage, amazonPlugin, {
          region,
          year,
          startDate,
          endDate,
          includeItems: true,
          includeShipments: false,
          maxOrders,
        });

        // Calculate actual time estimate based on orders found
        const timeEstimate = estimateExtractionTime(fetchResult.orders.length, {
          includeItems: true,
          includeShipments: false,
          useInvoice: true,
        });

        const exportResult = await exportItemsCSV(
          fetchResult.items,
          outputPath,
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: exportResult.success ? "success" : "error",
                  params: {
                    region,
                    year,
                    startDate,
                    endDate,
                    maxOrders,
                    outputPath,
                  },
                  filePath: exportResult.filePath,
                  rowCount: exportResult.rowCount,
                  error: exportResult.error,
                  fetchErrors: fetchResult.errors,
                  timing: {
                    orderCount: fetchResult.orders.length,
                    itemCount: fetchResult.items.length,
                    estimate: timeEstimate.formattedEstimate,
                    warnings: timeEstimate.warnings,
                    recommendations: timeEstimate.recommendations,
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "export_amazon_shipments_csv": {
        const regionParam = args?.region as string | undefined;
        const regionError = validateRegion(regionParam, args);
        if (regionError) return regionError;
        const region = regionParam!;

        const currentPage = await getPage();
        const year = args?.year as number | undefined;
        const startDate = args?.start_date as string | undefined;
        const endDate = args?.end_date as string | undefined;
        const maxOrders = args?.max_orders as number | undefined;
        const fetchTrackingNumbers = args?.fetch_tracking_numbers as
          | boolean
          | undefined;
        const outputPath = getOutputPath(
          args?.output_path as string | undefined,
          "shipments",
          region,
          { year, startDate, endDate },
        );

        const fetchResult = await fetchOrders(currentPage, amazonPlugin, {
          region,
          year,
          startDate,
          endDate,
          includeItems: false,
          includeShipments: true,
          fetchTrackingNumbers: fetchTrackingNumbers ?? false,
          maxOrders,
        });

        const timeEstimate = estimateExtractionTime(fetchResult.orders.length, {
          includeItems: false,
          includeShipments: true,
        });

        const exportResult = await exportShipmentsCSV(
          fetchResult.shipments,
          outputPath,
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: exportResult.success ? "success" : "error",
                  params: {
                    region,
                    year,
                    startDate,
                    endDate,
                    maxOrders,
                    fetchTrackingNumbers,
                    outputPath,
                  },
                  filePath: exportResult.filePath,
                  rowCount: exportResult.rowCount,
                  error: exportResult.error,
                  fetchErrors: fetchResult.errors,
                  timing: {
                    orderCount: fetchResult.orders.length,
                    shipmentCount: fetchResult.shipments.length,
                    estimate: timeEstimate.formattedEstimate,
                    warnings: timeEstimate.warnings,
                    recommendations: timeEstimate.recommendations,
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "export_amazon_transactions_csv": {
        const regionParam = args?.region as string | undefined;
        const regionError = validateRegion(regionParam, args);
        if (regionError) return regionError;
        const region = regionParam!;

        const currentPage = await getPage();
        const year = args?.year as number | undefined;
        const startDate = args?.start_date as string | undefined;
        const endDate = args?.end_date as string | undefined;
        const maxOrders = args?.max_orders as number | undefined;
        const outputPath = getOutputPath(
          args?.output_path as string | undefined,
          "transactions",
          region,
          { year, startDate, endDate },
        );

        const fetchResult = await fetchOrders(currentPage, amazonPlugin, {
          region,
          year,
          startDate,
          endDate,
          includeItems: false,
          includeShipments: false,
          includeTransactions: true,
          maxOrders,
        });

        const timeEstimate = estimateExtractionTime(fetchResult.orders.length, {
          includeItems: false,
          includeShipments: false,
        });

        const exportResult = await exportTransactionsCSV(
          fetchResult.transactions,
          outputPath,
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: exportResult.success ? "success" : "error",
                  params: {
                    region,
                    year,
                    startDate,
                    endDate,
                    maxOrders,
                    outputPath,
                  },
                  filePath: exportResult.filePath,
                  rowCount: exportResult.rowCount,
                  error: exportResult.error,
                  fetchErrors: fetchResult.errors,
                  timing: {
                    orderCount: fetchResult.orders.length,
                    transactionCount: fetchResult.transactions.length,
                    estimate: timeEstimate.formattedEstimate,
                    warnings: timeEstimate.warnings,
                    recommendations: timeEstimate.recommendations,
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "get_amazon_transactions": {
        const regionParam = args?.region as string | undefined;
        const regionError = validateRegion(regionParam, args);
        if (regionError) return regionError;
        const region = regionParam!;

        const currentPage = await getPage();
        const progressToken = request.params._meta?.progressToken;
        const startDate = args?.start_date as string | undefined;
        const endDate = args?.end_date as string | undefined;
        const maxScrolls = args?.max_scrolls as number | undefined;

        const transactions = await extractTransactionsFromPage(
          currentPage,
          region,
          {
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            maxScrolls,
            onProgress: async (message, count) => {
              await sendProgress(progressToken, count, 0, message);
            },
          },
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "success",
                  params: {
                    region,
                    startDate,
                    endDate,
                    maxScrolls,
                  },
                  transactionCount: transactions.length,
                  transactions: transactions.map((t) => ({
                    date: t.date.toISOString(),
                    orderIds: t.orderIds,
                    amount: t.amount,
                    cardInfo: t.cardInfo,
                    vendor: t.vendor,
                  })),
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "get_amazon_gift_card_balance": {
        const regionParam = args?.region as string | undefined;
        const regionError = validateRegion(regionParam, args);
        if (regionError) return regionError;
        const region = regionParam!;

        const currentPage = await getPage();
        const maxPages = (args?.max_pages as number) ?? 10;
        const fetchAllPages = (args?.fetch_all_pages as boolean) ?? true;

        const giftCardData = await extractGiftCardData(currentPage, region, {
          maxPages,
          fetchAllPages,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "success",
                  params: {
                    region,
                    maxPages,
                    fetchAllPages,
                  },
                  balance: giftCardData.balance.balance,
                  lastUpdated: giftCardData.balance.lastUpdated.toISOString(),
                  transactionCount: giftCardData.transactions.length,
                  transactions: giftCardData.transactions.map((t) => ({
                    date: t.date.toISOString(),
                    description: t.description,
                    amount: t.amount,
                    closingBalance: t.closingBalance,
                    type: t.type,
                    orderId: t.orderId,
                    claimCode: t.claimCode,
                    serialNumber: t.serialNumber,
                  })),
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "export_amazon_gift_cards_csv": {
        const regionParam = args?.region as string | undefined;
        const regionError = validateRegion(regionParam, args);
        if (regionError) return regionError;
        const region = regionParam!;

        const currentPage = await getPage();
        const outputPath = args?.output_path as string | undefined;
        const maxPages = (args?.max_pages as number) ?? 10;

        // Extract gift card transactions
        const giftCardData = await extractGiftCardData(currentPage, region, {
          maxPages,
          fetchAllPages: true,
        });

        // Convert to CSV format using shared helper
        const csvData = formatGiftCardDataForCSV(giftCardData);

        // Generate output path
        const today = new Date().toISOString().split("T")[0];
        const finalPath = getOutputPath(outputPath, "gift-cards", region, {
          endDate: today,
        });

        // Export to CSV
        const exportResult = await exportGiftCardTransactionsCSV(
          csvData,
          finalPath,
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: exportResult.success ? "success" : "error",
                  params: {
                    region,
                    maxPages,
                  },
                  balance: giftCardData.balance.balance,
                  transactionCount: giftCardData.transactions.length,
                  filePath: exportResult.filePath,
                  rowCount: exportResult.rowCount,
                  error: exportResult.error,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "get_amazon_gift_card_transactions": {
        const regionParam = args?.region as string | undefined;
        const regionError = validateRegion(regionParam, args);
        if (regionError) return regionError;
        const region = regionParam!;

        const currentPage = await getPage();
        const maxPages = (args?.max_pages as number) ?? 10;

        // Extract gift card transactions
        const giftCardData = await extractGiftCardData(currentPage, region, {
          maxPages,
          fetchAllPages: true,
        });

        // Convert to export format using shared helper
        const exportData = formatGiftCardDataForExport(giftCardData);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "success",
                  params: {
                    region,
                    maxPages,
                  },
                  ...exportData,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "check_amazon_auth_status": {
        const regionParam = args?.region as string | undefined;
        const regionError = validateRegion(regionParam, args);
        if (regionError) return regionError;
        const region = regionParam!;

        const currentPage = await getPage();
        const authStatus = await amazonPlugin.checkAuthStatus(
          currentPage,
          region,
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: authStatus.authenticated ? "success" : "error",
                  params: {
                    region,
                  },
                  authenticated: authStatus.authenticated,
                  username: authStatus.username,
                  message: authStatus.message,
                  loginUrl: authStatus.authenticated
                    ? undefined
                    : amazonPlugin.getLoginUrl(region),
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: `Unknown tool: ${name}`,
              }),
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: String(error),
          }),
        },
      ],
      isError: true,
    };
  }
});

// Cleanup on exit
process.on("SIGINT", async () => {
  if (browserContext) {
    await browserContext.close();
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  if (browserContext) {
    await browserContext.close();
  }
  process.exit(0);
});

// Main entry point
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Amazon Order History CSV Download MCP server running");
}

main().catch(console.error);
