import { Money } from './money';
import { Item } from './item';
import { Shipment } from './shipment';

/**
 * Order status enumeration.
 */
export type OrderStatusCode =
  | 'pending'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded'
  | 'unknown';

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
 * Order header - minimal info from order list page.
 */
export interface OrderHeader {
  id: string;
  date: Date | null;
  total: Money;
  detailUrl: string;
  recipient?: string;
  platform: string;
  region: string;
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
