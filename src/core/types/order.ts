import { Money } from "./money";
import { Item } from "./item";
import { Shipment } from "./shipment";

/**
 * Order status enumeration.
 */
export type OrderStatusCode =
  | "pending"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded"
  | "unknown";

/**
 * Order status with code and display label.
 */
export interface OrderStatus {
  code: OrderStatusCode;
  label: string;
}

/**
 * Seller/merchant information.
 */
export interface Seller {
  name: string;
  id?: string;
}

/**
 * Recipient/shipping address information.
 */
export interface Recipient {
  name: string;
  address?: string;
}

/**
 * Payment information.
 */
export interface Payment {
  method: string;
  lastFour?: string;
  amount?: Money;
}

/**
 * Universal order interface - works across all e-commerce platforms.
 */
export interface Order {
  // Identification
  id: string;
  platform: string;
  region: string;

  // Dates
  date: Date | null;
  deliveryDate?: Date | null;

  // Status
  status: OrderStatus;

  // Financial
  subtotal?: Money;
  shipping: Money;
  shippingRefund?: Money;
  tax: Money;
  total: Money;
  gift?: Money;
  refund?: Money;
  subscribeAndSave?: Money;

  // Parties
  seller?: Seller;
  recipient: Recipient;

  // Related entities
  items: Item[];
  shipments: Shipment[];
  payments: Payment[];

  // URLs
  detailUrl: string;
  invoiceUrl?: string;

  // Platform-specific data
  platformData: Record<string, unknown>;
}

/**
 * Order header - info from order list page.
 * Enhanced to capture all available data from order cards.
 */
export interface OrderHeader {
  id: string;
  orderId: string; // Alias for id
  date: Date | null;
  total: Money;
  detailUrl: string;
  recipient?: string;
  status?: OrderStatus;
  platform: string;
  region: string;

  // Enhanced fields from order list page
  subtotal?: Money;
  shipping?: Money;
  tax?: Money;
  vat?: Money;
  promotion?: Money;
  grandTotal?: Money;

  // Shipping address - simple line-based structure (up to 7 lines)
  shippingAddress?: {
    line1?: string;
    line2?: string;
    line3?: string;
    line4?: string;
    line5?: string;
    line6?: string;
    line7?: string;
  };

  // Payment method
  paymentMethod?: {
    type: string; // e.g., "Visa", "Mastercard", "Wise Card"
    lastFour?: string; // e.g., "3858"
  };

  // Item count (from order list page - count of items visible on card)
  itemCount?: number;

  // Subscribe & Save frequency (e.g., "Every 1 month")
  subscribeAndSave?: string;
}

/**
 * Order details - additional info from order detail page.
 */
export interface OrderDetails {
  shipping: Money;
  shippingRefund?: Money;
  tax: Money;
  gift?: Money;
  refund?: Money;
  subscribeAndSave?: Money;
  recipient: Recipient;
  payments: Payment[];
  invoiceUrl?: string;
}
