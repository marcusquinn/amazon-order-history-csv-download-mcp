import { Money } from './money';
import { OrderHeader } from './order';

/**
 * Individual item from an order.
 */
export interface Item {
  // Identification
  id: string;
  asin?: string;

  // Product info
  name: string;
  description?: string;
  category?: string;
  imageUrl?: string;
  condition?: string;  // "New", "Used - Very Good", etc.

  // Quantity and pricing
  quantity: number;
  unitPrice: Money;
  totalPrice: Money;

  // URLs
  url: string;

  // Parent order reference
  orderHeader: OrderHeader;

  // Seller info
  seller?: {
    name: string;
    id?: string;
    soldBy?: string;       // "Sold by" value
    suppliedBy?: string;   // "Supplied by" / "Fulfilled by" value
  };

  // Subscribe & Save info
  subscriptionFrequency?: string;  // e.g., "Every 1 month"

  // Platform-specific data
  platformData: Record<string, unknown>;
}

/**
 * Item with enriched shipment data.
 */
export interface EnrichedItem extends Item {
  shipmentId?: string;
  deliveryStatus?: 'delivered' | 'in_transit' | 'pending' | 'unknown';
  trackingId?: string;
  trackingLink?: string;
}

/**
 * Extract ASIN from Amazon product URL.
 */
export function extractAsinFromUrl(url: string): string | undefined {
  // Patterns:
  // /dp/B08N5WRWNW
  // /gp/product/B08N5WRWNW
  // /gp/aw/d/B08N5WRWNW
  const patterns = [
    /\/dp\/([A-Z0-9]{10})/i,
    /\/gp\/product\/([A-Z0-9]{10})/i,
    /\/gp\/aw\/d\/([A-Z0-9]{10})/i,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1].toUpperCase();
    }
  }

  return undefined;
}
