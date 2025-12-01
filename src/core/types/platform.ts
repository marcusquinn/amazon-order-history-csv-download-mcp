import { Page } from 'playwright';
import { OrderHeader, OrderDetails } from './order';
import { Item } from './item';
import { Shipment } from './shipment';

/**
 * Region configuration.
 */
export interface Region {
  code: string;
  domain: string;
  currency: string;
  language: string;
  dateFormat: string;
  taxFields: string[];
}

/**
 * Authentication status.
 */
export interface AuthStatus {
  authenticated: boolean;
  username?: string;
  region: string;
  message?: string;
}

/**
 * Parameters for fetching order list.
 */
export interface OrderListParams {
  year?: number;
  startDate?: Date;
  endDate?: Date;
  months?: 1 | 2 | 3;
  startIndex?: number;
}

/**
 * Platform plugin interface.
 * Implement this interface to add support for a new e-commerce platform.
 */
export interface IPlatformPlugin {
  // Platform identification
  readonly name: string;
  readonly slug: string;
  readonly supportedRegions: Region[];

  // Lifecycle
  initialize(): Promise<void>;

  // Authentication
  checkAuthStatus(page: Page, region: string): Promise<AuthStatus>;
  getLoginUrl(region: string): string;

  // URL generation
  getOrderListUrl(region: string, params: OrderListParams): string;
  getOrderDetailUrl(orderId: string, region: string): string;

  // Extraction from order list page
  extractOrderHeaders(page: Page, region: string): Promise<OrderHeader[]>;
  getExpectedOrderCount(page: Page): Promise<number>;

  // Extraction from order detail page
  extractOrderDetails(
    page: Page,
    header: OrderHeader
  ): Promise<OrderDetails>;
  extractItems(page: Page, header: OrderHeader): Promise<Item[]>;
  extractShipments(page: Page, header: OrderHeader): Promise<Shipment[]>;

  // Region-specific utilities
  getDateFormat(region: string): string;
  getCurrencySymbol(region: string): string;
  getTaxFields(region: string): string[];
}

/**
 * Base class for platform plugins with common functionality.
 */
export abstract class BasePlatformPlugin implements IPlatformPlugin {
  abstract readonly name: string;
  abstract readonly slug: string;
  abstract readonly supportedRegions: Region[];

  async initialize(): Promise<void> {
    // Override in subclass if needed
  }

  abstract checkAuthStatus(page: Page, region: string): Promise<AuthStatus>;
  abstract getLoginUrl(region: string): string;
  abstract getOrderListUrl(region: string, params: OrderListParams): string;
  abstract getOrderDetailUrl(orderId: string, region: string): string;
  abstract extractOrderHeaders(page: Page, region: string): Promise<OrderHeader[]>;
  abstract getExpectedOrderCount(page: Page): Promise<number>;
  abstract extractOrderDetails(page: Page, header: OrderHeader): Promise<OrderDetails>;
  abstract extractItems(page: Page, header: OrderHeader): Promise<Item[]>;
  abstract extractShipments(page: Page, header: OrderHeader): Promise<Shipment[]>;

  getRegion(regionCode: string): Region | undefined {
    return this.supportedRegions.find((r) => r.code === regionCode);
  }

  getDateFormat(region: string): string {
    return this.getRegion(region)?.dateFormat || 'YYYY-MM-DD';
  }

  getCurrencySymbol(region: string): string {
    const symbols: Record<string, string> = {
      USD: '$',
      GBP: '£',
      EUR: '€',
      JPY: '¥',
      INR: '₹',
      CAD: '$',
      AUD: '$',
      MXN: '$',
      AED: 'AED',
      SAR: 'SAR',
    };
    const currency = this.getRegion(region)?.currency || 'USD';
    return symbols[currency] || currency;
  }

  getTaxFields(region: string): string[] {
    return this.getRegion(region)?.taxFields || [];
  }
}
