import { Money } from "./money";
import { Item } from "./item";
import { OrderHeader } from "./order";

/**
 * Delivery status enumeration.
 */
export enum DeliveryStatus {
  YES = "delivered",
  NO = "not_delivered",
  UNKNOWN = "unknown",
}

/**
 * Transaction associated with a shipment.
 */
export interface ShipmentTransaction {
  paymentAmount: Money;
  infoString: string;
  date?: Date;
}

/**
 * Shipment information.
 */
export interface Shipment {
  // Identification
  shipmentId: string;
  orderHeader: OrderHeader;

  // Items in this shipment
  items: Item[];

  // Delivery info
  delivered: DeliveryStatus;
  status: string;

  // Tracking
  trackingLink: string;
  trackingId: string;
  /** Carrier name (e.g., "JERSEY_POST", "Whistl Group", "Royal Mail") */
  carrier?: string;

  // Financial
  transaction?: ShipmentTransaction;
  refund?: Money;

  // Platform-specific data
  platformData: Record<string, unknown>;
}

/**
 * Enriched shipment with order details.
 */
export interface EnrichedShipment extends Shipment {
  order: {
    id: string;
    date: Date | null;
    detailUrl: string;
  };
}
