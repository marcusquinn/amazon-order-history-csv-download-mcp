/**
 * Gift card balance and activity extraction for Amazon.
 * Extracts from: https://www.amazon.{domain}/gc/balance
 *
 * Provides current balance and gift card transaction history.
 *
 * Based on analysis of Amazon UK gift card balance page structure.
 * The page contains a table with columns: Date, Description, Amount, Closing balance
 *
 * Transaction types detected:
 * - "Gift Card applied to Amazon.{domain} order" - debit with order link
 * - "Refund from Amazon.{domain} order" - credit (refund)
 * - "Gift Card added" - credit with claim code and serial number
 */

import { Page } from "playwright";
import { Money, parseMoney } from "../../core/types/money";
import { parseDate } from "../../core/utils/date";
import { getRegionByCode } from "../regions";

/**
 * Gift card balance information.
 */
export interface GiftCardBalance {
  balance: Money;
  lastUpdated: Date;
}

/**
 * Gift card transaction types.
 */
export type GiftCardTransactionType =
  | "applied" // Gift card applied to order (debit)
  | "refund" // Refund credited back to gift card balance
  | "added" // Gift card added/redeemed (credit)
  | "reload" // Gift card reloaded (credit)
  | "promotional" // Promotional credit added
  | "unknown";

/**
 * Gift card transaction entry.
 * Note: This is separate from the order Transaction type as it represents
 * gift card balance activity, not payment transactions.
 */
export interface GiftCardTransaction {
  /** Transaction date */
  date: Date;

  /** Human-readable description */
  description: string;

  /** Transaction amount (negative for debits, positive for credits) */
  amount: Money;

  /** Closing balance after this transaction */
  closingBalance: Money;

  /** Transaction type */
  type: GiftCardTransactionType;

  /** Associated order ID (if applicable) */
  orderId?: string;

  /** Gift card claim code (for 'added' type, partially masked) */
  claimCode?: string;

  /** Gift card serial number (for 'added' type) */
  serialNumber?: string;
}

/**
 * Complete gift card data.
 */
export interface GiftCardData {
  /** Current gift card balance */
  balance: GiftCardBalance;

  /** Transaction history */
  transactions: GiftCardTransaction[];

  /** Region this data was extracted from */
  region: string;
}

/**
 * Get gift card balance page URL for a region.
 */
export function getGiftCardPageUrl(region: string): string {
  const regionConfig = getRegionByCode(region);
  const domain = regionConfig?.domain || "amazon.com";
  return `https://www.${domain}/gc/balance`;
}

/**
 * Options for gift card extraction.
 */
export interface GiftCardExtractionOptions {
  /** Maximum number of pages to fetch (default: 10, set to 0 for unlimited) */
  maxPages?: number;
  /** Whether to fetch all pages (default: true) */
  fetchAllPages?: boolean;
}

/**
 * Extract gift card balance and transaction history.
 * Supports pagination to fetch complete transaction history.
 */
export async function extractGiftCardData(
  page: Page,
  region: string,
  options: GiftCardExtractionOptions = {},
): Promise<GiftCardData> {
  const { maxPages = 10, fetchAllPages = true } = options;
  const regionConfig = getRegionByCode(region);
  const currency = regionConfig?.currency || "USD";
  const url = getGiftCardPageUrl(region);

  // Navigate to gift card balance page
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

  // Wait for the balance table to load
  await page
    .waitForSelector(
      'table.a-bordered tbody tr, [data-testid="gc-balance"], #gc-balance',
      { timeout: 10000 },
    )
    .catch(() => {});

  // Extract balance (from first row's closing balance, or dedicated element)
  const balance = await extractBalance(page, currency);

  // Extract transactions from all pages
  const allTransactions: GiftCardTransaction[] = [];
  let pageCount = 0;

  while (true) {
    pageCount++;

    // Extract transactions from current page
    const pageTransactions = await extractTransactionsFromTable(page, currency);
    allTransactions.push(...pageTransactions);

    // Check if we should continue to next page
    if (!fetchAllPages) break;
    if (maxPages > 0 && pageCount >= maxPages) break;

    // Check for and click "Next" pagination button
    const hasNextPage = await goToNextGiftCardPage(page);
    if (!hasNextPage) break;

    // Wait for the new page content to load
    await page.waitForTimeout(500);
    await page
      .waitForSelector("table.a-bordered tbody tr", { timeout: 5000 })
      .catch(() => {});
  }

  // Deduplicate transactions (in case of overlap between pages)
  const uniqueTransactions = deduplicateTransactions(allTransactions);

  return {
    balance,
    transactions: uniqueTransactions,
    region,
  };
}

/**
 * Check if there's a next page and navigate to it.
 * Returns true if navigation occurred, false if no next page.
 *
 * Pagination structure:
 * <ul class="a-pagination">
 *   <li><a href="...?prev=...">← Previous</a></li>
 *   <li class="a-last"><a href="...?next=...">Next →</a></li>
 * </ul>
 */
async function goToNextGiftCardPage(page: Page): Promise<boolean> {
  try {
    // Look for the "Next" link in the pagination
    const nextLink = page
      .locator(
        'ul.a-pagination li.a-last a, ul.a-pagination a:has-text("Next")',
      )
      .first();

    if ((await nextLink.count()) === 0) {
      return false;
    }

    // Check if the link is disabled (no href or disabled class)
    const href = await nextLink.getAttribute("href");
    if (!href) {
      return false;
    }

    // Click the next link
    await nextLink.click();

    // Wait for navigation
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    return true;
  } catch {
    return false;
  }
}

/**
 * Deduplicate transactions based on date, amount, and order ID.
 */
function deduplicateTransactions(
  transactions: GiftCardTransaction[],
): GiftCardTransaction[] {
  const seen = new Set<string>();
  const unique: GiftCardTransaction[] = [];

  for (const tx of transactions) {
    // Create a unique key for each transaction
    const key = `${tx.date.toISOString()}-${tx.amount.amount}-${tx.orderId || tx.description}`;

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(tx);
    }
  }

  // Sort by date descending
  unique.sort((a, b) => b.date.getTime() - a.date.getTime());

  return unique;
}

/**
 * Extract current gift card balance.
 * The balance can be found in a dedicated element or as the first closing balance in the table.
 */
async function extractBalance(
  page: Page,
  currency: string,
): Promise<GiftCardBalance> {
  const defaultBalance: GiftCardBalance = {
    balance: parseMoney("0", currency),
    lastUpdated: new Date(),
  };

  // Strategy 1: Look for dedicated balance element (varies by region)
  const balanceSelectors = [
    '[data-testid="gc-balance"]',
    "#gc-balance",
    ".gc-balance",
    "#gc-current-balance",
    '[class*="gift-card-balance"]',
    '[class*="gc-balance"]',
    ".a-size-large.a-color-price", // Common Amazon price styling
  ];

  for (const selector of balanceSelectors) {
    try {
      const elem = page.locator(selector).first();
      if ((await elem.count()) > 0) {
        const text = await elem.textContent({ timeout: 500 });
        if (text) {
          const money = extractMoneyFromText(text, currency);
          if (money) {
            return {
              balance: money,
              lastUpdated: new Date(),
            };
          }
        }
      }
    } catch {
      continue;
    }
  }

  // Strategy 2: Get the closing balance from the first (most recent) transaction row
  // This is the current balance since transactions are ordered by date descending
  try {
    const firstRowClosingBalance = await page
      .locator("table.a-bordered tbody tr:first-child td:nth-child(4)")
      .first();

    if ((await firstRowClosingBalance.count()) > 0) {
      const text = await firstRowClosingBalance.textContent({ timeout: 500 });
      if (text) {
        const money = extractMoneyFromText(text, currency);
        if (money) {
          return {
            balance: money,
            lastUpdated: new Date(),
          };
        }
      }
    }
  } catch {
    // Continue to fallback
  }

  // Strategy 3: Look for balance in page text
  const pageText = (await page.textContent("body").catch(() => "")) || "";

  const balancePatterns = [
    /Gift\s*Card\s*Balance:?\s*([$£€¥₹]?\s*[\d,]+\.?\d*)/i,
    /Your\s*Balance:?\s*([$£€¥₹]?\s*[\d,]+\.?\d*)/i,
    /Current\s*Balance:?\s*([$£€¥₹]?\s*[\d,]+\.?\d*)/i,
    /Available\s*Balance:?\s*([$£€¥₹]?\s*[\d,]+\.?\d*)/i,
  ];

  for (const pattern of balancePatterns) {
    const match = pageText.match(pattern);
    if (match) {
      const money = parseMoney(match[1], currency);
      if (money) {
        return {
          balance: money,
          lastUpdated: new Date(),
        };
      }
    }
  }

  return defaultBalance;
}

/**
 * Extract gift card transactions from the HTML table.
 *
 * Expected table structure (Amazon UK):
 * <table class="a-bordered a-spacing-small a-spacing-top-small">
 *   <tbody>
 *     <tr><th>Date</th><th>Description</th><th>Amount</th><th>Closing balance</th></tr>
 *     <tr>
 *       <td>11 November 2025</td>
 *       <td><span>Gift Card applied to Amazon.co.uk order</span><br><a href="..."><span>ORDER-ID</span></a></td>
 *       <td>-£15.85</td>
 *       <td>£0.00</td>
 *     </tr>
 *     ...
 *   </tbody>
 * </table>
 */
async function extractTransactionsFromTable(
  page: Page,
  currency: string,
): Promise<GiftCardTransaction[]> {
  const transactions: GiftCardTransaction[] = [];

  // Select all data rows (skip header row)
  const rows = await page.locator("table.a-bordered tbody tr").all();

  for (const row of rows) {
    try {
      // Get all cells in this row
      const cells = await row.locator("td").all();

      // Skip header rows (they use <th> not <td>)
      if (cells.length < 4) continue;

      // Extract date (column 1)
      const dateText = await cells[0].textContent({ timeout: 300 });
      if (!dateText) continue;

      const date = parseDate(dateText.trim());
      if (!date) continue;

      // Extract description and order ID (column 2)
      const descriptionCell = cells[1];
      const descriptionText = await descriptionCell.textContent({
        timeout: 300,
      });
      const description = cleanDescription(descriptionText || "");

      // Try to extract order ID from the link
      const orderLink = descriptionCell.locator('a[href*="order"]');
      let orderId: string | undefined;
      if ((await orderLink.count()) > 0) {
        const linkText = await orderLink.textContent({ timeout: 300 });
        const orderIdMatch = linkText?.match(/\d{3}-\d{7}-\d{7}/);
        if (orderIdMatch) {
          orderId = orderIdMatch[0];
        }
      }

      // Extract claim code and serial number for "Gift Card added" transactions
      let claimCode: string | undefined;
      let serialNumber: string | undefined;
      if (descriptionText) {
        const claimMatch = descriptionText.match(/Claim code:\s*([^;]+)/i);
        if (claimMatch) {
          claimCode = claimMatch[1].trim();
        }
        const serialMatch = descriptionText.match(/Serial number:\s*(\d+)/i);
        if (serialMatch) {
          serialNumber = serialMatch[1];
        }
      }

      // Extract amount (column 3)
      const amountText = await cells[2].textContent({ timeout: 300 });
      if (!amountText) continue;

      const amount = extractMoneyFromText(amountText.trim(), currency);
      if (!amount) continue;

      // Extract closing balance (column 4)
      const closingBalanceText = await cells[3].textContent({ timeout: 300 });
      const closingBalance =
        extractMoneyFromText(closingBalanceText?.trim() || "0", currency) ||
        parseMoney("0", currency);

      // Determine transaction type
      const type = determineTransactionType(description, amount.amount);

      transactions.push({
        date,
        description,
        amount,
        closingBalance,
        type,
        orderId,
        claimCode,
        serialNumber,
      });
    } catch {
      // Skip rows that fail to parse
      continue;
    }
  }

  // Sort by date descending (most recent first)
  transactions.sort((a, b) => b.date.getTime() - a.date.getTime());

  return transactions;
}

/**
 * Clean up description text.
 */
function cleanDescription(text: string): string {
  return text
    .replace(/\s+/g, " ") // Collapse whitespace
    .replace(/Claim code:.*$/i, "") // Remove claim code details
    .replace(/Serial number:.*$/i, "") // Remove serial number
    .trim();
}

/**
 * Determine the transaction type from description and amount.
 */
function determineTransactionType(
  description: string,
  amount: number,
): GiftCardTransactionType {
  const descLower = description.toLowerCase();

  if (descLower.includes("applied") && descLower.includes("order")) {
    return "applied";
  }

  if (descLower.includes("refund")) {
    return "refund";
  }

  if (
    descLower.includes("gift card added") ||
    descLower.includes("claim code")
  ) {
    return "added";
  }

  if (descLower.includes("reload")) {
    return "reload";
  }

  if (descLower.includes("promotional") || descLower.includes("promo")) {
    return "promotional";
  }

  // Fallback: positive amounts are credits, negative are debits
  if (amount > 0) {
    return "added";
  } else if (amount < 0) {
    return "applied";
  }

  return "unknown";
}

/**
 * Extract money amount from text.
 */
function extractMoneyFromText(text: string, currency: string): Money | null {
  // Clean up the text - remove excess whitespace
  const cleaned = text.replace(/\s+/g, " ").trim();

  // Try to extract currency and amount patterns
  const patterns = [
    // Negative amounts: -£15.85
    /(-?)([$£€¥₹])\s*([\d,]+\.?\d*)/,
    // Amount with currency symbol after: 15.85€
    /(-?)([\d,]+\.?\d*)\s*([$£€¥₹])/,
    // Currency code format: GBP 15.85
    /(-?)(USD|GBP|EUR|CAD|AUD|JPY|INR|AED|SAR|MXN)\s*([\d,]+\.?\d*)/i,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) {
      // Reconstruct the money string for parsing
      const isNegative = match[1] === "-";
      let moneyStr: string;

      if (match[2].match(/[$£€¥₹]/)) {
        // Currency symbol before amount
        moneyStr = `${match[2]}${match[3]}`;
      } else if (match[3]?.match(/[$£€¥₹]/)) {
        // Currency symbol after amount
        moneyStr = `${match[3]}${match[2]}`;
      } else {
        // Currency code
        moneyStr = `${match[2]} ${match[3]}`;
      }

      const money = parseMoney(moneyStr, currency);
      if (money) {
        // Apply negative sign if present
        if (isNegative && money.amount > 0) {
          money.amount = -money.amount;
        }
        return money;
      }
    }
  }

  // Fallback: try parsing the whole cleaned text
  return parseMoney(cleaned, currency);
}

/**
 * Extract gift card transactions from raw HTML string.
 * Useful for testing and offline processing.
 */
export function extractGiftCardTransactionsFromHtml(
  html: string,
  currency: string = "GBP",
): GiftCardTransaction[] {
  const transactions: GiftCardTransaction[] = [];

  // Parse using regex for table rows
  // Match: <tr>...<td>date</td><td>description</td><td>amount</td><td>closing</td>...</tr>
  const rowRegex =
    /<tr>\s*<td>\s*([^<]+)\s*<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/gi;

  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const dateText = match[1].trim();
    const descriptionHtml = match[2];
    const amountText = match[3];
    const closingText = match[4];

    // Parse date
    const date = parseDate(dateText);
    if (!date) continue;

    // Extract description (strip HTML tags)
    const description = cleanDescription(
      descriptionHtml.replace(/<[^>]+>/g, " "),
    );

    // Extract order ID from href
    const orderIdMatch = descriptionHtml.match(/orderID=(\d{3}-\d{7}-\d{7})/);
    const orderId = orderIdMatch ? orderIdMatch[1] : undefined;

    // Extract claim code and serial number
    let claimCode: string | undefined;
    let serialNumber: string | undefined;
    const claimMatch = descriptionHtml.match(/Claim code:\s*([^;<]+)/i);
    if (claimMatch) claimCode = claimMatch[1].trim();
    const serialMatch = descriptionHtml.match(/Serial number:\s*(\d+)/i);
    if (serialMatch) serialNumber = serialMatch[1];

    // Parse amounts (strip HTML)
    const cleanAmount = amountText
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const cleanClosing = closingText
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const amount = extractMoneyFromText(cleanAmount, currency);
    if (!amount) continue;

    const closingBalance =
      extractMoneyFromText(cleanClosing, currency) || parseMoney("0", currency);

    const type = determineTransactionType(description, amount.amount);

    transactions.push({
      date,
      description,
      amount,
      closingBalance,
      type,
      orderId,
      claimCode,
      serialNumber,
    });
  }

  // Sort by date descending
  transactions.sort((a, b) => b.date.getTime() - a.date.getTime());

  return transactions;
}

// Legacy exports for backward compatibility
export type GiftCardActivity = GiftCardTransaction;
