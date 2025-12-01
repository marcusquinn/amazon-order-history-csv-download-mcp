/**
 * Transaction extraction from Amazon order pages.
 * Extracts payment information, card details, and transaction history.
 * 
 * Based on AZAD patterns from:
 * - transaction0.ts: Uses transaction-date-container and transactions-line-item
 * - transaction1.ts: Component-based parsing with currency, card info, order IDs
 * 
 * Key AZAD patterns:
 * - //div[contains(@class, "transaction-date-container")] for date grouping
 * - .//div[contains(@class, "transactions-line-item")] for individual transactions
 * - Card pattern: ****1234 or •••1234
 * - Gift card pattern: "Amazon Gift Card|Amazon-Geschenkgutschein"
 * - Payment status: "Pending|Charged|Berechnet|Erstattet|Ausstehend"
 */

import { Page } from 'playwright';
import { Transaction } from '../../core/types/transaction';
import { OrderHeader } from '../../core/types/order';
import { parseMoney } from '../../core/types/money';
import { getTextByXPath, getTextByXPaths, firstMatchingStrategy } from '../../core/utils/extraction';
import { getRegionByCode } from '../regions';

/**
 * Order ID regex pattern from AZAD util.ts
 * Matches: XXX-XXXXXXX-XXXXXXX (standard) or hex UUID (Amazon Fresh 2025)
 */
const ORDER_ID_REGEX = /([A-Z0-9]{3}-\d{7}-\d{7}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

/**
 * Parse card information from text.
 * Examples: "Visa ending in 1234", "Mastercard ****5678"
 * 
 * AZAD patterns from transaction1.ts:
 * - BLANKED_DIGITS: /([•*]{3,4})/
 * - CARD_DIGITS: /([0-9]{3,4})/
 * - CARD_NAME: /([A-Za-z][A-Za-z0-9. ]{2,49})/
 * - GIFT_CARD: /(Amazon Gift Card|Amazon-Geschenkgutschein)/
 */
function parseCardInfo(text: string): { vendor: string; cardInfo: string } {
  const normalizedText = text.trim();
  
  // AZAD pattern: blanked digits followed by card digits (****1234 or •••1234)
  const azadCardPattern = /([A-Za-z][A-Za-z0-9. ]{2,49})\s*[•*]{3,4}\s*(\d{3,4})/;
  const azadMatch = normalizedText.match(azadCardPattern);
  if (azadMatch) {
    return {
      vendor: azadMatch[1].trim(),
      cardInfo: `****${azadMatch[2]}`,
    };
  }
  
  // Common card patterns
  const cardPatterns = [
    /(\w+)\s+ending\s+in\s+(\d{4})/i,
    /(\w+)\s*\*+(\d{4})/i,
    /(\w+)\s+x{3,4}(\d{4})/i,
    /(\w+)\s+\.{3,4}(\d{4})/i,
    // AZAD pattern: just blanked digits with number
    /[•*]{3,4}\s*(\d{3,4})/,
  ];

  for (const pattern of cardPatterns) {
    const match = normalizedText.match(pattern);
    if (match) {
      // Handle case where we only got card digits
      if (match.length === 2) {
        return {
          vendor: 'Unknown',
          cardInfo: `****${match[1]}`,
        };
      }
      return {
        vendor: match[1],
        cardInfo: `****${match[2]}`,
      };
    }
  }

  // Check for specific card types mentioned
  const cardTypes = ['Visa', 'Mastercard', 'Amex', 'American Express', 'Discover'];
  for (const cardType of cardTypes) {
    if (normalizedText.toLowerCase().includes(cardType.toLowerCase())) {
      return {
        vendor: cardType,
        cardInfo: normalizedText,
      };
    }
  }

  // AZAD pattern: Gift card (multi-locale)
  if (/Amazon Gift Card|Amazon-Geschenkgutschein|Carte cadeau Amazon|Buono Regalo Amazon/i.test(normalizedText)) {
    return { vendor: 'Amazon Gift Card', cardInfo: 'Gift Card' };
  }
  
  // Check for other payment methods
  if (normalizedText.toLowerCase().includes('promotional')) {
    return { vendor: 'Promotional Credit', cardInfo: 'Credit' };
  }
  if (normalizedText.toLowerCase().includes('reward')) {
    return { vendor: 'Amazon Rewards', cardInfo: 'Rewards' };
  }

  return { vendor: 'Unknown', cardInfo: normalizedText || 'Unknown' };
}

/**
 * Parse date from various Amazon date formats.
 */
function parseTransactionDate(text: string, fallbackDate: Date | null): Date {
  if (!text) {
    return fallbackDate || new Date();
  }

  // Try common date patterns
  const patterns = [
    // "January 15, 2024"
    /(\w+)\s+(\d{1,2}),?\s+(\d{4})/,
    // "15 January 2024"
    /(\d{1,2})\s+(\w+)\s+(\d{4})/,
    // "2024-01-15"
    /(\d{4})-(\d{2})-(\d{2})/,
    // "01/15/2024"
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const parsed = new Date(match[0]);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }

  return fallbackDate || new Date();
}

/**
 * Strategy 0: Payment information section (data-component enhanced)
 * Prioritizes data-component selectors for 2024+ layouts.
 */
async function extractTransactionsStrategy0(
  page: Page,
  header: OrderHeader,
  currency: string
): Promise<Transaction[] | null> {
  // Look for payment information section - try data-component first
  const paymentSection = await page.locator('[data-component="paymentInformation"], [data-component="viewPaymentPlanSummaryWidget"], #od-subtotals').first();
  if (!(await paymentSection.isVisible().catch(() => false))) return null;

  const transactions: Transaction[] = [];

  // Get payment method
  const paymentMethodText = await getTextByXPaths(page, [
    '//*[@id="od-subtotals"]//*[contains(text(), "ending") or contains(text(), "Visa") or contains(text(), "Mastercard")]',
    '//*[contains(@class, "payment-method")]//text()',
    '//*[contains(text(), "Payment Method")]/..//text()',
  ], '');

  const { vendor, cardInfo } = parseCardInfo(paymentMethodText);

  // Get grand total
  const totalText = await getTextByXPaths(page, [
    '//*[contains(text(), "Grand Total") or contains(text(), "Order Total")]/..//*[contains(@class, "price") or contains(text(), "$") or contains(text(), "£") or contains(text(), "€")]',
    '//*[@id="od-subtotals"]//*[contains(text(), "Total")]/..//*[contains(@class, "value")]',
  ], '');

  const amount = parseMoney(totalText, currency);

  if (amount.amount > 0) {
    transactions.push({
      date: header.date || new Date(),
      orderIds: [header.orderId],
      vendor,
      cardInfo,
      amount,
      platformData: {},
    });
  }

  return transactions.length > 0 ? transactions : null;
}

/**
 * Strategy 1: Transaction history table
 */
async function extractTransactionsStrategy1(
  page: Page,
  header: OrderHeader,
  currency: string
): Promise<Transaction[] | null> {
  // Look for transaction history
  const transactionRows = await page.locator('.transaction-row, [class*="transaction-item"]').all();
  if (transactionRows.length === 0) return null;

  const transactions: Transaction[] = [];

  for (const row of transactionRows) {
    try {
      const text = await row.textContent().catch(() => '');
      if (!text) continue;

      // Extract date
      const dateText = await row.locator('[class*="date"]').first().textContent().catch(() => '');
      const date = parseTransactionDate(dateText || '', header.date);

      // Extract amount
      const amountText = await row.locator('[class*="amount"], [class*="price"]').first().textContent().catch(() => '');
      const amount = parseMoney(amountText || '', currency);

      // Extract card info
      const methodText = await row.locator('[class*="method"], [class*="card"]').first().textContent().catch(() => '');
      const { vendor, cardInfo } = parseCardInfo(methodText || '');

      if (amount.amount > 0) {
        transactions.push({
          date,
          orderIds: [header.orderId],
          vendor,
          cardInfo,
          amount,
          platformData: {},
        });
      }
    } catch {
      continue;
    }
  }

  return transactions.length > 0 ? transactions : null;
}

/**
 * Strategy 2: Invoice/receipt page extraction
 */
async function extractTransactionsStrategy2(
  page: Page,
  header: OrderHeader,
  currency: string
): Promise<Transaction[] | null> {
  // Check if we're on an invoice page
  const invoiceContainer = await page.locator('#invoice-container, .invoice-content').first();
  if (!(await invoiceContainer.isVisible().catch(() => false))) return null;

  const transactions: Transaction[] = [];

  // Get total from invoice
  const totalText = await getTextByXPath(
    page,
    '//*[contains(text(), "Total") or contains(text(), "Amount")]/..//*[contains(@class, "price")]',
    ''
  );

  const amount = parseMoney(totalText, currency);

  // Get payment method from invoice
  const methodText = await getTextByXPath(
    page,
    '//*[contains(text(), "Payment") or contains(text(), "Card")]',
    ''
  );
  const { vendor, cardInfo } = parseCardInfo(methodText);

  // Get invoice date
  const dateText = await getTextByXPath(
    page,
    '//*[contains(text(), "Invoice Date") or contains(text(), "Order Date")]',
    ''
  );
  const date = parseTransactionDate(dateText, header.date);

  if (amount.amount > 0) {
    transactions.push({
      date,
      orderIds: [header.orderId],
      vendor,
      cardInfo,
      amount,
      platformData: { source: 'invoice' },
    });
  }

  return transactions.length > 0 ? transactions : null;
}

/**
 * Strategy 3: Order summary charge breakdown
 */
async function extractTransactionsStrategy3(
  page: Page,
  header: OrderHeader,
  currency: string
): Promise<Transaction[] | null> {
  // Look for charges in order summary
  const chargeElements = await page.locator('[class*="charge"], [class*="payment-line"]').all();
  if (chargeElements.length === 0) return null;

  const transactions: Transaction[] = [];

  for (const elem of chargeElements) {
    try {
      const text = await elem.textContent().catch(() => '');
      if (!text) continue;

      // Skip non-payment lines
      if (text.toLowerCase().includes('subtotal') || 
          text.toLowerCase().includes('shipping') ||
          text.toLowerCase().includes('tax')) {
        continue;
      }

      const amount = parseMoney(text, currency);
      if (amount.amount === 0) continue;

      const { vendor, cardInfo } = parseCardInfo(text);

      transactions.push({
        date: header.date || new Date(),
        orderIds: [header.orderId],
        vendor,
        cardInfo,
        amount,
        platformData: {},
      });
    } catch {
      continue;
    }
  }

  return transactions.length > 0 ? transactions : null;
}

/**
 * Strategy 4: Fallback - extract from order total
 */
async function extractTransactionsStrategy4(
  page: Page,
  header: OrderHeader,
  currency: string
): Promise<Transaction[] | null> {
  // Last resort: try to find any total amount
  const totalSelectors = [
    '.grand-total-price',
    '[class*="order-total"]',
    '#od-subtotals .a-text-right.a-span-last',
    '.order-summary-total',
  ];

  for (const selector of totalSelectors) {
    const totalText = await page.locator(selector).first().textContent().catch(() => '');
    if (totalText) {
      const amount = parseMoney(totalText, currency);
      if (amount.amount > 0) {
        return [{
          date: header.date || new Date(),
          orderIds: [header.orderId],
          vendor: 'Unknown',
          cardInfo: 'Unknown',
          amount,
          platformData: { source: 'total_fallback' },
        }];
      }
    }
  }

  return null;
}

/**
 * Strategy 5: AZAD transaction-date-container pattern (transaction0.ts)
 * 
 * Structure:
 * <div class="transaction-date-container">January 15, 2024</div>
 * <div> (next sibling)
 *   <div class="transactions-line-item">
 *     <div>Card info + Amount</div>
 *     <div>Order ID links</div>
 *     <div>Vendor name</div>
 *   </div>
 * </div>
 */
async function extractTransactionsStrategy5(
  page: Page,
  header: OrderHeader,
  currency: string
): Promise<Transaction[] | null> {
  // Look for transaction date containers (AZAD pattern)
  const dateContainers = await page.locator('div[class*="transaction-date-container"]').all();
  if (dateContainers.length === 0) return null;

  const transactions: Transaction[] = [];

  for (const dateContainer of dateContainers) {
    try {
      // Get date from container
      const dateText = await dateContainer.textContent().catch(() => '');
      const date = parseTransactionDate(dateText || '', header.date);

      // Get next sibling which contains transaction items
      const transactionContainer = await dateContainer.locator('xpath=following-sibling::div[1]').first();
      if (!(await transactionContainer.isVisible().catch(() => false))) continue;

      // Find transaction line items
      const lineItems = await transactionContainer.locator('div[class*="transactions-line-item"]').all();
      
      for (const lineItem of lineItems) {
        try {
          // Get all child divs
          const childDivs = await lineItem.locator(':scope > div').all();
          if (childDivs.length === 0) continue;

          // First div contains card info and amount
          const cardAndAmountText = await childDivs[0].textContent().catch(() => '');
          
          // Extract amount from span (AZAD pattern: second span contains amount)
          const amountSpans = await childDivs[0].locator('span').all();
          let amountText = '';
          if (amountSpans.length >= 2) {
            amountText = await amountSpans[1].textContent().catch(() => '') || '';
          } else if (amountSpans.length === 1) {
            amountText = await amountSpans[0].textContent().catch(() => '') || '';
          } else {
            amountText = cardAndAmountText || '';
          }
          
          const amount = parseMoney(amountText, currency);
          if (amount.amount === 0) continue;

          // Extract card info (AZAD pattern: first span with ****)
          const { vendor, cardInfo } = parseCardInfo(cardAndAmountText || '');

          // Extract order IDs from remaining divs
          const orderIds: string[] = [];
          for (let i = 1; i < childDivs.length; i++) {
            const divText = await childDivs[i].textContent().catch(() => '') || '';
            const orderIdMatches = divText.match(ORDER_ID_REGEX);
            if (orderIdMatches) {
              orderIds.push(...orderIdMatches);
            }
          }

          // Extract vendor from last non-order-id div
          let vendorName = vendor;
          for (let i = childDivs.length - 1; i >= 1; i--) {
            const divText = await childDivs[i].textContent().catch(() => '') || '';
            if (!ORDER_ID_REGEX.test(divText) && divText.trim()) {
              vendorName = divText.trim();
              break;
            }
          }

          transactions.push({
            date,
            orderIds: orderIds.length > 0 ? orderIds : [header.orderId],
            vendor: vendorName,
            cardInfo,
            amount,
            platformData: { source: 'azad_transaction0' },
          });
        } catch {
          continue;
        }
      }
    } catch {
      continue;
    }
  }

  return transactions.length > 0 ? transactions : null;
}

/**
 * Strategy 6: AZAD scrolling transaction page pattern
 * Uses data-testid="transaction-link" elements
 */
async function extractTransactionsStrategy6(
  page: Page,
  header: OrderHeader,
  currency: string
): Promise<Transaction[] | null> {
  // Look for transaction links (AZAD scrolling pattern)
  const transactionLinks = await page.locator('a[data-testid="transaction-link"]').all();
  if (transactionLinks.length === 0) return null;

  const transactions: Transaction[] = [];

  for (const link of transactionLinks) {
    try {
      // Get parent transaction container
      const container = await link.locator('xpath=ancestor::div[contains(@class, "transaction") or contains(@class, "payment")]').first();
      let text = await container.textContent().catch(() => null);
      if (!text) {
        text = await link.textContent().catch(() => '') || '';
      }
      
      if (!text) continue;

      // Extract date
      const dateMatch = text.match(/(\w+\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+\w+\s+\d{4}|\d{4}-\d{2}-\d{2})/);
      const date = dateMatch ? parseTransactionDate(dateMatch[0], header.date) : (header.date || new Date());

      // Extract amount
      const amount = parseMoney(text, currency);
      if (amount.amount === 0) continue;

      // Extract card info
      const { vendor, cardInfo } = parseCardInfo(text);

      // Extract order IDs
      const orderIdMatches = text.match(ORDER_ID_REGEX);
      const orderIds = orderIdMatches ? Array.from(new Set(orderIdMatches)) : [header.orderId];

      // Extract vendor (AZAD pattern: last text segment that's not an order ID)
      let vendorName = vendor;
      const textParts = text.split(/\s{2,}|\n/).filter(p => p.trim());
      for (let i = textParts.length - 1; i >= 0; i--) {
        const part = textParts[i].trim();
        if (part && !ORDER_ID_REGEX.test(part) && !part.match(/^\$|€|£|¥|[0-9.,]+$/)) {
          vendorName = part;
          break;
        }
      }

      transactions.push({
        date,
        orderIds,
        vendor: vendorName,
        cardInfo,
        amount,
        platformData: { source: 'azad_transaction_link' },
      });
    } catch {
      continue;
    }
  }

  return transactions.length > 0 ? transactions : null;
}

/**
 * Strategy 7: Payment status pattern (AZAD transaction1.ts)
 * Looks for payment status indicators: Pending|Charged|Berechnet|Erstattet|Ausstehend
 */
async function extractTransactionsStrategy7(
  page: Page,
  header: OrderHeader,
  currency: string
): Promise<Transaction[] | null> {
  // AZAD payment status patterns (multi-locale)
  const statusPatterns = ['Pending', 'Charged', 'Berechnet', 'Erstattet', 'Ausstehend', 'En attente', 'Débité'];
  
  const transactions: Transaction[] = [];
  
  for (const status of statusPatterns) {
    const statusElements = await page.locator(`//*[contains(text(), "${status}")]`).all();
    
    for (const elem of statusElements) {
      try {
        // Get parent transaction container
        const container = await elem.locator('xpath=ancestor::div[position() <= 5]').last();
        const text = await container.textContent().catch(() => '');
        
        if (!text) continue;
        
        // Already processed this transaction?
        const amount = parseMoney(text, currency);
        if (amount.amount === 0) continue;
        
        // Avoid duplicates
        const existingAmounts = transactions.map(t => t.amount.amount);
        if (existingAmounts.includes(amount.amount)) continue;
        
        const { vendor, cardInfo } = parseCardInfo(text);
        
        // Extract order IDs
        const orderIdMatches = text.match(ORDER_ID_REGEX);
        const orderIds = orderIdMatches ? Array.from(new Set(orderIdMatches)) : [header.orderId];
        
        transactions.push({
          date: header.date || new Date(),
          orderIds,
          vendor,
          cardInfo,
          amount,
          platformData: { source: 'azad_payment_status', status },
        });
      } catch {
        continue;
      }
    }
  }

  return transactions.length > 0 ? transactions : null;
}

/**
 * Extract transactions from an order detail page.
 * 
 * Strategy order (most specific to most general):
 * 0: Payment information section (#od-subtotals)
 * 1: Transaction history table (.transaction-row)
 * 2: Invoice/receipt page (#invoice-container)
 * 3: Order summary charge breakdown
 * 4: Fallback - order total
 * 5: AZAD transaction-date-container (transaction0.ts pattern)
 * 6: AZAD transaction-link (scrolling page pattern)
 * 7: AZAD payment status pattern (multi-locale)
 */
export async function extractTransactions(
  page: Page,
  header: OrderHeader
): Promise<Transaction[]> {
  const regionConfig = getRegionByCode(header.region);
  const currency = regionConfig?.currency || 'USD';

  // Try each extraction strategy
  const transactions = await firstMatchingStrategy<Transaction[]>([
    () => extractTransactionsStrategy0(page, header, currency),
    () => extractTransactionsStrategy1(page, header, currency),
    () => extractTransactionsStrategy2(page, header, currency),
    () => extractTransactionsStrategy3(page, header, currency),
    () => extractTransactionsStrategy5(page, header, currency), // AZAD transaction-date-container
    () => extractTransactionsStrategy6(page, header, currency), // AZAD transaction-link
    () => extractTransactionsStrategy7(page, header, currency), // AZAD payment status
    () => extractTransactionsStrategy4(page, header, currency), // Fallback last
  ], []);

  return transactions;
}

/**
 * Calculate total transaction amount for an order.
 */
export function calculateTotalAmount(transactions: Transaction[]): number {
  return transactions.reduce((sum, t) => sum + t.amount.amount, 0);
}

/**
 * Get unique payment methods used.
 */
export function getPaymentMethods(transactions: Transaction[]): string[] {
  const methods = new Set<string>();
  for (const t of transactions) {
    methods.add(`${t.vendor} ${t.cardInfo}`.trim());
  }
  return Array.from(methods);
}
