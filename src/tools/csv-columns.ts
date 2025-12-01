/**
 * CSV column definitions for each export type.
 * Based on AZAD's table_config.ts with improvements.
 */

import { CSVColumn } from "../core/utils/csv";
import { Item } from "../core/types/item";
import { Shipment, DeliveryStatus } from "../core/types/shipment";
import { Transaction } from "../core/types/transaction";
import { Money } from "../core/types/money";

/**
 * Order data for CSV export (simplified interface to avoid complex type intersections).
 * Includes all fields available from OrderHeader.
 */
export interface OrderCSVData {
  // Identification
  id: string;
  orderId: string;
  date: Date | null;

  // Financial - core
  total: Money;
  subtotal?: Money;
  shipping?: Money;
  shippingRefund?: Money;
  tax?: Money;
  vat?: Money;
  gift?: Money;
  refund?: Money;
  promotion?: Money;
  grandTotal?: Money;

  // Subscribe & Save frequency (e.g., "Every 1 month")
  subscribeAndSave?: string;

  // Recipient/shipping
  recipient?: string;
  shippingAddress?: {
    line1?: string;
    line2?: string;
    line3?: string;
    line4?: string;
    line5?: string;
    line6?: string;
    line7?: string;
  };

  // Payment
  paymentMethod?: {
    type: string;
    lastFour?: string;
  };

  // Items
  items?: Item[];
  itemCount?: number;

  // Status
  status?: { label: string; code?: string };

  // Platform/region
  platform?: string;
  region: string;

  // URLs
  detailUrl: string;
  invoiceUrl?: string;
}

/**
 * Format money for CSV output.
 */
function formatMoney(money: Money | undefined): string {
  if (!money || money.amount === 0) return "";
  return `${money.currencySymbol}${money.amount.toFixed(2)}`;
}

/**
 * Format date for CSV output.
 */
function formatDate(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toISOString().split("T")[0];
}

/**
 * Order summary CSV columns.
 * Only includes fields reliably available from the order list page.
 * For detailed financial breakdowns, use item export with includeItems=true.
 */
export const ORDER_CSV_COLUMNS: CSVColumn<OrderCSVData>[] = [
  // Identification
  { key: "orderId", header: "Order ID", getValue: (o) => o.id },
  { key: "date", header: "Order Date", getValue: (o) => formatDate(o.date) },

  // Financial - only Total is reliably available from list view
  { key: "total", header: "Total", getValue: (o) => formatMoney(o.total) },

  // Status
  { key: "status", header: "Status", getValue: (o) => o.status?.label || "" },

  // Items count (from order list page)
  {
    key: "itemCount",
    header: "Items",
    getValue: (o) => o.itemCount ?? o.items?.length ?? 0,
  },

  // Shipping address (up to 7 lines) - available from order card popover
  {
    key: "addressLine1",
    header: "Address Line 1",
    getValue: (o) => o.shippingAddress?.line1 || "",
  },
  {
    key: "addressLine2",
    header: "Address Line 2",
    getValue: (o) => o.shippingAddress?.line2 || "",
  },
  {
    key: "addressLine3",
    header: "Address Line 3",
    getValue: (o) => o.shippingAddress?.line3 || "",
  },
  {
    key: "addressLine4",
    header: "Address Line 4",
    getValue: (o) => o.shippingAddress?.line4 || "",
  },
  {
    key: "addressLine5",
    header: "Address Line 5",
    getValue: (o) => o.shippingAddress?.line5 || "",
  },
  {
    key: "addressLine6",
    header: "Address Line 6",
    getValue: (o) => o.shippingAddress?.line6 || "",
  },
  {
    key: "addressLine7",
    header: "Address Line 7",
    getValue: (o) => o.shippingAddress?.line7 || "",
  },

  // Subscribe & Save frequency (e.g., "Every 1 month")
  {
    key: "subscribeAndSave",
    header: "Subscribe & Save",
    getValue: (o) => o.subscribeAndSave || "",
  },

  // Platform/region
  { key: "platform", header: "Platform", getValue: (o) => o.platform || "" },
  { key: "region", header: "Region", getValue: (o) => o.region },

  // URL
  { key: "detailUrl", header: "Order URL", getValue: (o) => o.detailUrl },
];

/**
 * Item detail CSV columns.
 * Includes item-level data plus order-level context from OrderHeader.
 */
export const ITEM_CSV_COLUMNS: CSVColumn<Item>[] = [
  // Order identification
  { key: "orderId", header: "Order ID", getValue: (i) => i.orderHeader.id },
  {
    key: "orderDate",
    header: "Order Date",
    getValue: (i) => formatDate(i.orderHeader.date),
  },

  // Item identification
  { key: "asin", header: "ASIN", getValue: (i) => i.asin || "" },
  { key: "name", header: "Product Name", getValue: (i) => i.name },
  { key: "condition", header: "Condition", getValue: (i) => i.condition || "" },

  // Item pricing
  { key: "quantity", header: "Quantity", getValue: (i) => i.quantity },
  {
    key: "unitPrice",
    header: "Unit Price",
    getValue: (i) => formatMoney(i.unitPrice),
  },
  {
    key: "totalPrice",
    header: "Item Total",
    getValue: (i) => formatMoney(i.totalPrice),
  },

  // Seller info (name only - soldBy/suppliedBy require detail page)
  { key: "seller", header: "Seller", getValue: (i) => i.seller?.name || "" },

  // Subscription
  {
    key: "subscriptionFrequency",
    header: "Subscribe & Save",
    getValue: (i) => i.subscriptionFrequency || "",
  },

  // Order-level financial data
  {
    key: "orderSubtotal",
    header: "Order Subtotal",
    getValue: (i) => formatMoney(i.orderHeader.subtotal),
  },
  {
    key: "orderShipping",
    header: "Order Shipping",
    getValue: (i) => formatMoney(i.orderHeader.shipping),
  },
  {
    key: "orderTax",
    header: "Order Tax",
    getValue: (i) => formatMoney(i.orderHeader.tax),
  },
  {
    key: "orderVat",
    header: "Order VAT",
    getValue: (i) => formatMoney(i.orderHeader.vat),
  },
  {
    key: "orderPromotion",
    header: "Order Promotion",
    getValue: (i) => formatMoney(i.orderHeader.promotion),
  },
  {
    key: "orderTotal",
    header: "Order Total",
    getValue: (i) => formatMoney(i.orderHeader.total),
  },
  {
    key: "orderGrandTotal",
    header: "Order Grand Total",
    getValue: (i) => formatMoney(i.orderHeader.grandTotal),
  },

  // Order status
  {
    key: "orderStatus",
    header: "Order Status",
    getValue: (i) => i.orderHeader.status?.label || "",
  },

  // Recipient/shipping address (up to 7 lines)
  {
    key: "recipient",
    header: "Recipient",
    getValue: (i) => i.orderHeader.recipient || "",
  },
  {
    key: "addressLine1",
    header: "Address Line 1",
    getValue: (i) => i.orderHeader.shippingAddress?.line1 || "",
  },
  {
    key: "addressLine2",
    header: "Address Line 2",
    getValue: (i) => i.orderHeader.shippingAddress?.line2 || "",
  },
  {
    key: "addressLine3",
    header: "Address Line 3",
    getValue: (i) => i.orderHeader.shippingAddress?.line3 || "",
  },
  {
    key: "addressLine4",
    header: "Address Line 4",
    getValue: (i) => i.orderHeader.shippingAddress?.line4 || "",
  },
  {
    key: "addressLine5",
    header: "Address Line 5",
    getValue: (i) => i.orderHeader.shippingAddress?.line5 || "",
  },
  {
    key: "addressLine6",
    header: "Address Line 6",
    getValue: (i) => i.orderHeader.shippingAddress?.line6 || "",
  },
  {
    key: "addressLine7",
    header: "Address Line 7",
    getValue: (i) => i.orderHeader.shippingAddress?.line7 || "",
  },

  // Payment
  {
    key: "paymentMethod",
    header: "Payment Method",
    getValue: (i) => i.orderHeader.paymentMethod?.type || "",
  },
  {
    key: "paymentLastFour",
    header: "Card Last 4",
    getValue: (i) => i.orderHeader.paymentMethod?.lastFour || "",
  },

  // URLs
  { key: "productUrl", header: "Product URL", getValue: (i) => i.url || "" },
  { key: "imageUrl", header: "Image URL", getValue: (i) => i.imageUrl || "" },
  {
    key: "orderUrl",
    header: "Order URL",
    getValue: (i) => i.orderHeader.detailUrl,
  },

  // Region
  { key: "region", header: "Region", getValue: (i) => i.orderHeader.region },
];

/**
 * Shipment tracking CSV columns.
 */
export const SHIPMENT_CSV_COLUMNS: CSVColumn<Shipment>[] = [
  { key: "orderId", header: "Order ID", getValue: (s) => s.orderHeader.id },
  {
    key: "orderDate",
    header: "Order Date",
    getValue: (s) => formatDate(s.orderHeader.date),
  },
  { key: "shipmentId", header: "Shipment ID", getValue: (s) => s.shipmentId },
  { key: "status", header: "Status", getValue: (s) => s.status },
  {
    key: "delivered",
    header: "Delivered",
    getValue: (s) => {
      switch (s.delivered) {
        case DeliveryStatus.YES:
          return "Yes";
        case DeliveryStatus.NO:
          return "No";
        default:
          return "Unknown";
      }
    },
  },
  { key: "trackingId", header: "Tracking ID", getValue: (s) => s.trackingId },
  { key: "carrier", header: "Carrier", getValue: (s) => s.carrier || "" },
  {
    key: "trackingLink",
    header: "Tracking URL",
    getValue: (s) => s.trackingLink,
  },
  {
    key: "itemCount",
    header: "Items in Shipment",
    getValue: (s) => s.items.length,
  },
  {
    key: "itemNames",
    header: "Item Names",
    getValue: (s) => s.items.map((i) => i.name).join("; "),
  },
  {
    key: "paymentAmount",
    header: "Payment Amount",
    getValue: (s) =>
      formatMoney(s.transaction?.paymentAmount) ||
      formatMoney(s.orderHeader.total),
  },
  { key: "refund", header: "Refund", getValue: (s) => formatMoney(s.refund) },
  { key: "region", header: "Region", getValue: (s) => s.orderHeader.region },
];

/**
 * Transaction/payment CSV columns.
 */
export const TRANSACTION_CSV_COLUMNS: CSVColumn<Transaction>[] = [
  {
    key: "date",
    header: "Transaction Date",
    getValue: (t) => formatDate(t.date),
  },
  {
    key: "orderIds",
    header: "Order ID(s)",
    getValue: (t) => t.orderIds.join(", "),
  },
  { key: "vendor", header: "Payment Method", getValue: (t) => t.vendor },
  { key: "cardInfo", header: "Card Info", getValue: (t) => t.cardInfo },
  { key: "amount", header: "Amount", getValue: (t) => formatMoney(t.amount) },
  { key: "currency", header: "Currency", getValue: (t) => t.amount.currency },
];

/**
 * Gift card transaction data for CSV export.
 */
export interface GiftCardTransactionCSVData {
  date: Date;
  description: string;
  amount: Money;
  closingBalance: Money;
  type: string;
  orderId?: string;
  claimCode?: string;
  serialNumber?: string;
  region: string;
}

/**
 * Gift card transaction CSV columns.
 */
export const GIFT_CARD_CSV_COLUMNS: CSVColumn<GiftCardTransactionCSVData>[] = [
  { key: "date", header: "Date", getValue: (t) => formatDate(t.date) },
  { key: "description", header: "Description", getValue: (t) => t.description },
  { key: "type", header: "Type", getValue: (t) => t.type },
  { key: "amount", header: "Amount", getValue: (t) => formatMoney(t.amount) },
  {
    key: "closingBalance",
    header: "Closing Balance",
    getValue: (t) => formatMoney(t.closingBalance),
  },
  { key: "orderId", header: "Order ID", getValue: (t) => t.orderId || "" },
  {
    key: "claimCode",
    header: "Claim Code",
    getValue: (t) => t.claimCode || "",
  },
  {
    key: "serialNumber",
    header: "Serial Number",
    getValue: (t) => t.serialNumber || "",
  },
  { key: "currency", header: "Currency", getValue: (t) => t.amount.currency },
  { key: "region", header: "Region", getValue: (t) => t.region },
];

/**
 * Get column headers for a given export type.
 */
export function getColumnHeaders(
  exportType: "orders" | "items" | "shipments" | "transactions" | "gift-cards",
): string[] {
  switch (exportType) {
    case "orders":
      return ORDER_CSV_COLUMNS.map((c) => c.header);
    case "items":
      return ITEM_CSV_COLUMNS.map((c) => c.header);
    case "shipments":
      return SHIPMENT_CSV_COLUMNS.map((c) => c.header);
    case "transactions":
      return TRANSACTION_CSV_COLUMNS.map((c) => c.header);
    case "gift-cards":
      return GIFT_CARD_CSV_COLUMNS.map((c) => c.header);
  }
}
