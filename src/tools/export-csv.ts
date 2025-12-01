/**
 * CSV export functions for Amazon order data.
 */

import { writeFile } from "fs/promises";
import { toCSVWithColumns } from "../core/utils/csv";
import { Item } from "../core/types/item";
import { Shipment } from "../core/types/shipment";
import { Transaction } from "../core/types/transaction";
import {
  ORDER_CSV_COLUMNS,
  ITEM_CSV_COLUMNS,
  SHIPMENT_CSV_COLUMNS,
  TRANSACTION_CSV_COLUMNS,
  GIFT_CARD_CSV_COLUMNS,
  OrderCSVData,
  GiftCardTransactionCSVData,
} from "./csv-columns";

/**
 * Export result returned by export functions.
 */
export interface ExportResult {
  success: boolean;
  filePath: string;
  rowCount: number;
  error?: string;
}

/**
 * Export orders to CSV file.
 */
export async function exportOrdersCSV(
  orders: OrderCSVData[],
  outputPath: string,
): Promise<ExportResult> {
  try {
    const csv = toCSVWithColumns(orders, ORDER_CSV_COLUMNS);
    await writeFile(outputPath, csv, "utf-8");

    return {
      success: true,
      filePath: outputPath,
      rowCount: orders.length,
    };
  } catch (error) {
    return {
      success: false,
      filePath: outputPath,
      rowCount: 0,
      error: String(error),
    };
  }
}

/**
 * Export items to CSV file.
 */
export async function exportItemsCSV(
  items: Item[],
  outputPath: string,
): Promise<ExportResult> {
  try {
    const csv = toCSVWithColumns(items, ITEM_CSV_COLUMNS);
    await writeFile(outputPath, csv, "utf-8");

    return {
      success: true,
      filePath: outputPath,
      rowCount: items.length,
    };
  } catch (error) {
    return {
      success: false,
      filePath: outputPath,
      rowCount: 0,
      error: String(error),
    };
  }
}

/**
 * Export shipments to CSV file.
 */
export async function exportShipmentsCSV(
  shipments: Shipment[],
  outputPath: string,
): Promise<ExportResult> {
  try {
    const csv = toCSVWithColumns(shipments, SHIPMENT_CSV_COLUMNS);
    await writeFile(outputPath, csv, "utf-8");

    return {
      success: true,
      filePath: outputPath,
      rowCount: shipments.length,
    };
  } catch (error) {
    return {
      success: false,
      filePath: outputPath,
      rowCount: 0,
      error: String(error),
    };
  }
}

/**
 * Export transactions to CSV file.
 */
export async function exportTransactionsCSV(
  transactions: Transaction[],
  outputPath: string,
): Promise<ExportResult> {
  try {
    const csv = toCSVWithColumns(transactions, TRANSACTION_CSV_COLUMNS);
    await writeFile(outputPath, csv, "utf-8");

    return {
      success: true,
      filePath: outputPath,
      rowCount: transactions.length,
    };
  } catch (error) {
    return {
      success: false,
      filePath: outputPath,
      rowCount: 0,
      error: String(error),
    };
  }
}

/**
 * Export gift card transactions to CSV file.
 */
export async function exportGiftCardTransactionsCSV(
  transactions: GiftCardTransactionCSVData[],
  outputPath: string,
): Promise<ExportResult> {
  try {
    const csv = toCSVWithColumns(transactions, GIFT_CARD_CSV_COLUMNS);
    await writeFile(outputPath, csv, "utf-8");

    return {
      success: true,
      filePath: outputPath,
      rowCount: transactions.length,
    };
  } catch (error) {
    return {
      success: false,
      filePath: outputPath,
      rowCount: 0,
      error: String(error),
    };
  }
}

/**
 * Generate default filename for export.
 * Format: amazon-{region}-{type}-{startDate}-{endDate}.csv
 * Example: amazon-uk-orders-2024-2024-12-01.csv
 */
export function generateExportFilename(
  exportType: "orders" | "items" | "shipments" | "transactions" | "gift-cards",
  region: string,
  options?: {
    year?: number;
    startDate?: string;
    endDate?: string;
  },
): string {
  const today = new Date().toISOString().split("T")[0];

  let datePart: string;

  if (options?.startDate && options?.endDate) {
    // Use provided date range
    datePart = `${options.startDate}-${options.endDate}`;
  } else if (options?.year) {
    // Year specified - range from Jan 1 to today (or Dec 31 if past year)
    const currentYear = new Date().getFullYear();
    const endDate =
      options.year < currentYear ? `${options.year}-12-31` : today;
    datePart = `${options.year}-${endDate}`;
  } else {
    // No year specified - use current year to today
    const currentYear = new Date().getFullYear();
    datePart = `${currentYear}-${today}`;
  }

  return `amazon-${region}-${exportType}-${datePart}.csv`;
}

/**
 * Get default Downloads directory path.
 */
export function getDefaultDownloadsPath(): string {
  const { homedir } = require("os");
  const { join } = require("path");
  return join(homedir(), "Downloads");
}

/**
 * Common MCP client timeout thresholds (in seconds).
 */
export const COMMON_TIMEOUTS = {
  claude: 120, // Claude Desktop default
  cursor: 300, // Cursor default
  opencode: 600, // OpenCode default (10 minutes)
  conservative: 60, // Conservative estimate
};

/**
 * Estimated time per order for different extraction modes (in seconds).
 */
export const TIME_PER_ORDER = {
  listOnly: 0.5, // Just listing orders from order history pages
  invoiceExtraction: 2, // Invoice-based item extraction
  detailExtraction: 4, // Full detail page extraction
  withShipments: 5, // Including shipment tracking
};

/**
 * Estimate extraction time and check against common timeouts.
 */
export interface TimeEstimate {
  estimatedSeconds: number;
  estimatedMinutes: number;
  formattedEstimate: string;
  warnings: string[];
  recommendations: string[];
}

export function estimateExtractionTime(
  orderCount: number,
  options: {
    includeItems?: boolean;
    includeShipments?: boolean;
    useInvoice?: boolean;
  } = {},
): TimeEstimate {
  const {
    includeItems = false,
    includeShipments = false,
    useInvoice = true,
  } = options;

  // Calculate base time
  let timePerOrder = TIME_PER_ORDER.listOnly;

  if (includeItems || includeShipments) {
    if (includeShipments) {
      timePerOrder = TIME_PER_ORDER.withShipments;
    } else if (useInvoice) {
      timePerOrder = TIME_PER_ORDER.invoiceExtraction;
    } else {
      timePerOrder = TIME_PER_ORDER.detailExtraction;
    }
  }

  // Add overhead for pagination (roughly 2 seconds per 10 orders for page loads)
  const paginationOverhead = Math.ceil(orderCount / 10) * 2;

  const estimatedSeconds = Math.ceil(
    orderCount * timePerOrder + paginationOverhead,
  );
  const estimatedMinutes = Math.ceil(estimatedSeconds / 60);

  const warnings: string[] = [];
  const recommendations: string[] = [];

  // Check against common timeouts
  if (estimatedSeconds > COMMON_TIMEOUTS.conservative) {
    if (estimatedSeconds > COMMON_TIMEOUTS.opencode) {
      warnings.push(
        `Estimated time (${estimatedMinutes}min) exceeds most client timeouts`,
      );
      recommendations.push(
        `Consider using max_orders to limit batch size (e.g., max_orders: 100)`,
      );
      recommendations.push(
        `Process in yearly batches for large order histories`,
      );
    } else if (estimatedSeconds > COMMON_TIMEOUTS.cursor) {
      warnings.push(
        `Estimated time (${estimatedMinutes}min) may exceed some client timeouts`,
      );
      recommendations.push(
        `If timeout occurs, try with max_orders: ${Math.floor(COMMON_TIMEOUTS.cursor / timePerOrder)}`,
      );
    } else if (estimatedSeconds > COMMON_TIMEOUTS.claude) {
      warnings.push(
        `Estimated time (${estimatedMinutes}min) may exceed Claude Desktop timeout (2min)`,
      );
      recommendations.push(
        `For Claude Desktop, consider max_orders: ${Math.floor(COMMON_TIMEOUTS.claude / timePerOrder)}`,
      );
    }
  }

  // Format estimate string
  let formattedEstimate: string;
  if (estimatedSeconds < 60) {
    formattedEstimate = `~${estimatedSeconds} seconds`;
  } else if (estimatedMinutes < 60) {
    formattedEstimate = `~${estimatedMinutes} minutes`;
  } else {
    const hours = Math.floor(estimatedMinutes / 60);
    const mins = estimatedMinutes % 60;
    formattedEstimate = `~${hours}h ${mins}m`;
  }

  return {
    estimatedSeconds,
    estimatedMinutes,
    formattedEstimate,
    warnings,
    recommendations,
  };
}

/**
 * Generate full output path with default directory.
 */
export function getOutputPath(
  outputPath: string | undefined,
  exportType: "orders" | "items" | "shipments" | "transactions" | "gift-cards",
  region: string,
  options?: {
    year?: number;
    startDate?: string;
    endDate?: string;
  },
): string {
  if (outputPath) {
    return outputPath;
  }

  const { join } = require("path");
  const filename = generateExportFilename(exportType, region, options);
  return join(getDefaultDownloadsPath(), filename);
}
