import { Money } from './money';

/**
 * Payment transaction.
 */
export interface Transaction {
  // Date
  date: Date;

  // Associated orders
  orderIds: string[];

  // Payment details
  vendor: string;
  cardInfo: string;
  amount: Money;

  // Platform-specific data
  platformData: Record<string, unknown>;
}
