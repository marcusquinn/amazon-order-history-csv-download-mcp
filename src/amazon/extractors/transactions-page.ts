/**
 * Transactions page extraction for Amazon.
 * Extracts from: https://www.amazon.{domain}/cpe/yourpayments/transactions
 *
 * This page contains ALL payment transactions across all orders,
 * making it much faster than extracting from individual order pages.
 *
 * Based on AZAD's transaction.ts, transaction0.ts, and transaction1.ts patterns.
 */

import { Page } from "playwright";
import { Transaction } from "../../core/types/transaction";
import { parseMoney, getCurrencySymbol } from "../../core/types/money";
import { parseDate } from "../../core/utils/date";
import { getRegionByCode } from "../regions";

/**
 * Parse an amount from the transactions page, trusting the region's currency.
 * The page always displays amounts in the region's currency, but bare "$"
 * symbols would otherwise be interpreted as USD (e.g. on amazon.com.au).
 */
function parseRegionMoney(formatted: string, currency: string) {
  const money = parseMoney(formatted, currency);
  money.currency = currency;
  money.currencySymbol = getCurrencySymbol(currency);
  return money;
}

/**
 * Get transactions page URL for a region.
 */
export function getTransactionsPageUrl(region: string): string {
  const regionConfig = getRegionByCode(region);
  const domain = regionConfig?.domain || "amazon.com";
  return `https://www.${domain}/cpe/yourpayments/transactions`;
}

/**
 * Extract all transactions from the transactions page.
 * Uses scrolling to load all transactions (Amazon lazy-loads them).
 */
export async function extractTransactionsFromPage(
  page: Page,
  region: string,
  options?: {
    startDate?: Date;
    endDate?: Date;
    maxScrolls?: number;
    onProgress?: (message: string, count: number) => void;
  },
): Promise<Transaction[]> {
  const regionConfig = getRegionByCode(region);
  const currency = regionConfig?.currency || "USD";
  const url = getTransactionsPageUrl(region);

  const { startDate, endDate, maxScrolls = 50, onProgress } = options || {};

  // Navigate to transactions page
  onProgress?.("Loading transactions page...", 0);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

  // Wait for transactions to load (current "apx" structure or legacy selectors)
  await page
    .waitForSelector(
      '.apx-transactions-line-item-component-container, [data-testid="transaction-link"], .transaction-date-container, .transactions-line-item',
      { timeout: 10000 },
    )
    .catch(() => {});

  // Give initial content time to render
  await page.waitForTimeout(1000);

  let allTransactions: Transaction[] = [];
  let pageCount = 0;
  let previousCount = 0;
  let stableCount = 0;

  // The transactions page is paginated (Previous/Next page buttons).
  // Walk pages until there's no enabled Next button, we pass the start date,
  // or we hit the page limit (reuses maxScrolls as a page cap).
  while (pageCount < maxScrolls) {
    // Extract current transactions
    const pageTransactions = await extractVisibleTransactions(page, currency);

    // Merge with existing (deduplicate)
    allTransactions = mergeTransactions(allTransactions, pageTransactions);

    onProgress?.(
      `Found ${allTransactions.length} transactions...`,
      allTransactions.length,
    );

    if (pageTransactions.length === 0) {
      // Nothing extracted on this page - no point paginating further
      break;
    }

    // Stop if nothing new turned up for several rounds (guards the legacy
    // infinite-scroll path, which has no reliable "last page" signal)
    if (allTransactions.length === previousCount) {
      stableCount++;
      if (stableCount >= 3) {
        break;
      }
    } else {
      stableCount = 0;
    }
    previousCount = allTransactions.length;

    // Check date range - stop if we've gone past the start date
    // (transactions are listed newest-first)
    if (startDate && allTransactions.length > 0) {
      const oldestDate = Math.min(
        ...allTransactions.map((t) => t.date.getTime()),
      );
      if (oldestDate < startDate.getTime()) {
        break;
      }
    }

    // Move to the next page if there is one
    const advanced = await goToNextPage(page);
    if (!advanced) {
      break;
    }
    pageCount++;
  }

  // Drop rows scraped off Amazon error banners ("There was a problem")
  // rather than real transaction line items
  allTransactions = allTransactions.filter(
    (t) => !/there was a problem/i.test(t.vendor),
  );

  // Filter by date range if specified
  let filteredTransactions = allTransactions;
  if (startDate || endDate) {
    filteredTransactions = allTransactions.filter((t) => {
      if (startDate && t.date < startDate) return false;
      if (endDate && t.date > endDate) return false;
      return true;
    });
  }

  // Sort by date descending (newest first)
  filteredTransactions.sort((a, b) => b.date.getTime() - a.date.getTime());

  onProgress?.(
    `Complete: ${filteredTransactions.length} transactions`,
    filteredTransactions.length,
  );

  return filteredTransactions;
}

/**
 * Extract visible transactions from current page state.
 * Implements multiple strategies based on AZAD's approach.
 */
async function extractVisibleTransactions(
  page: Page,
  currency: string,
): Promise<Transaction[]> {
  // Try the current Amazon structure first (apx-prefixed classes, 2025+)
  let transactions = await extractStrategyApx(page, currency);
  if (transactions.length > 0) {
    return transactions;
  }

  // Try Strategy 0 (legacy transaction-date-container based)
  transactions = await extractStrategy0(page, currency);
  if (transactions.length > 0) {
    return transactions;
  }

  // Try Strategy 1 (component-based parsing)
  transactions = await extractStrategy1(page, currency);
  if (transactions.length > 0) {
    return transactions;
  }

  // Fallback: generic extraction
  return extractGeneric(page, currency);
}

/**
 * Current strategy: extract from the apx-* component structure (2025+).
 *
 * Page layout:
 *   .apx-transaction-date-container            <- "28 June 2026"
 *   .a-section                                 <- sibling holding that date's items
 *     .apx-transactions-line-item-component-container   <- one per transaction
 *       row: payment method ("Visa ****1234") + amount ("-$47.99")
 *       row (optional): status ("Pending")
 *       row: order link  <a href="...orderID=xxx">Order #xxx</a>
 *       row (optional): vendor ("Amazon AU", "Audible Limited (AU)", ...)
 *
 * Walks date containers and line items in document order in a single
 * page.evaluate, tracking the current date as it goes.
 */
async function extractStrategyApx(
  page: Page,
  currency: string,
): Promise<Transaction[]> {
  interface RawApxTransaction {
    dateText: string;
    amountText: string;
    cardInfo: string;
    orderIds: string[];
    vendor: string;
    status: string;
  }

  const rawTransactions: RawApxTransaction[] = await page.evaluate(() => {
    const STATUS_RE = /^(Pending|Completed|In progress|Charged|Refunded)$/i;
    const results: Array<{
      dateText: string;
      amountText: string;
      cardInfo: string;
      orderIds: string[];
      vendor: string;
      status: string;
    }> = [];

    // tsconfig has no "dom" lib (this file otherwise runs in Node); the
    // callback executes in the browser, so reach the DOM via untyped globals
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = (globalThis as any).document;
    const nodes: any[] = Array.from(
      doc.querySelectorAll(
        ".apx-transaction-date-container, .apx-transactions-line-item-component-container",
      ),
    );
    let currentDate = "";

    for (const node of nodes) {
      if (node.classList.contains("apx-transaction-date-container")) {
        currentDate = (node.textContent || "").trim();
        continue;
      }

      // Line item
      const orderIds: string[] = [];
      const anchors: any[] = Array.from(
        node.querySelectorAll('a[href*="orderID="]'),
      );
      for (const a of anchors) {
        const href = a.getAttribute("href") || "";
        const m = href.match(/orderID=([A-Z0-9-]+)/i);
        if (m) orderIds.push(m[1]);
      }
      // Fallback: order IDs in plain text
      if (orderIds.length === 0) {
        const text = node.textContent || "";
        const matches = text.match(/[A-Z]?\d{2,3}-\d{7}-\d{7}/g);
        if (matches) orderIds.push(...matches);
      }

      let amountText = "";
      let cardInfo = "";
      let vendor = "";
      let status = "";

      const spans: any[] = Array.from(node.querySelectorAll("span"));
      for (const span of spans) {
        const text = (span.textContent || "").trim();
        if (!text) continue;

        const isBold = span.classList.contains("a-text-bold");
        const inAmountColumn = !!span.closest(".a-text-right");

        if (inAmountColumn && isBold && !amountText) {
          amountText = text;
        } else if (isBold && !cardInfo) {
          cardInfo = text;
        } else if (STATUS_RE.test(text) && !status) {
          status = text;
        } else if (!isBold && !text.startsWith("Order #") && !vendor) {
          vendor = text;
        }
      }

      results.push({
        dateText: currentDate,
        amountText,
        cardInfo,
        orderIds,
        vendor,
        status,
      });
    }

    return results;
  });

  const transactions: Transaction[] = [];
  for (const raw of rawTransactions) {
    const date = parseDate(raw.dateText);
    if (!date) {
      console.error(
        `[transactions-page] apx: could not parse date "${raw.dateText}"`,
      );
      continue;
    }

    transactions.push({
      date,
      orderIds: [...new Set(raw.orderIds)],
      amount: parseRegionMoney(raw.amountText || "0", currency),
      cardInfo: raw.cardInfo,
      vendor: raw.vendor,
      platformData: {
        source: "transactions-page",
        status: raw.status || undefined,
        isRefund: raw.amountText.trim().startsWith("+"),
      },
    });
  }

  console.error(
    `[transactions-page] apx strategy: extracted ${transactions.length} transactions`,
  );
  return transactions;
}

/**
 * Strategy 0: Extract from transaction-date-container structure.
 * Based on AZAD's transaction0.ts
 */
async function extractStrategy0(
  page: Page,
  currency: string,
): Promise<Transaction[]> {
  const transactions: Transaction[] = [];

  // Find all date containers
  const dateContainers = await page
    .locator(".transaction-date-container")
    .all();

  for (const dateContainer of dateContainers) {
    try {
      const dateText = await dateContainer
        .textContent({ timeout: 300 })
        .catch(() => "");
      if (!dateText) continue;

      const date = parseDate(dateText.trim());
      if (!date) continue;

      // Get the sibling container with transaction items
      const siblingContainer = dateContainer.locator(
        "xpath=following-sibling::*[1]",
      );
      const transactionItems = await siblingContainer
        .locator(".transactions-line-item")
        .all();

      for (const item of transactionItems) {
        const transaction = await extractTransactionItem(item, date, currency);
        if (transaction) {
          transactions.push(transaction);
        }
      }
    } catch {
      continue;
    }
  }

  return transactions;
}

/**
 * Strategy 1: Extract using data-testid attributes and modern selectors.
 * Updated for 2024+ Amazon transactions page structure.
 */
async function extractStrategy1(
  page: Page,
  currency: string,
): Promise<Transaction[]> {
  const transactions: Transaction[] = [];

  // Find transaction links (modern Amazon UI with data-testid)
  const transactionLinks = await page
    .locator('[data-testid="transaction-link"]')
    .all();
  console.error(
    `[transactions-page] Strategy 1: Found ${transactionLinks.length} transaction links`,
  );

  for (const link of transactionLinks) {
    try {
      // Extract date - first span[data-testid="text"] in the transaction
      // Date format: "28 Nov 2025"
      const dateSpans = await link.locator('span[data-testid="text"]').all();
      let dateText = "";
      if (dateSpans.length > 0) {
        dateText =
          (await dateSpans[0].textContent({ timeout: 300 }).catch(() => "")) ||
          "";
      }

      const date = parseDate(dateText.trim());
      if (!date) {
        console.error(
          `[transactions-page] Could not parse date: "${dateText}"`,
        );
        continue;
      }

      // Extract vendor - usually the third span[data-testid="text"] (after date and dot separator)
      let vendor = "";
      if (dateSpans.length >= 3) {
        vendor =
          (await dateSpans[2].textContent({ timeout: 300 }).catch(() => "")) ||
          "";
      }

      // Extract card info from method-details fields
      const cardName =
        (await link
          .locator('[data-testid="method-details-name"]')
          .textContent({ timeout: 300 })
          .catch(() => "")) || "";
      const cardNumber =
        (await link
          .locator('[data-testid="method-details-number"]')
          .textContent({ timeout: 300 })
          .catch(() => "")) || "";
      const cardInfo =
        cardName && cardNumber
          ? `${cardName} ••••${cardNumber}`
          : cardName || "";

      // Extract order IDs - look for text containing "Order #"
      const orderTexts = await link
        .locator('div[data-testid="text"]')
        .allTextContents();
      const orderIds: string[] = [];
      for (const text of orderTexts) {
        // Match both standard format (203-1234567-1234567) and digital (D01-1234567-1234567)
        const matches = text.match(/[D]?\d{3}-\d{7}-\d{7}/g);
        if (matches) {
          orderIds.push(...matches);
        }
      }

      if (orderIds.length === 0) {
        // Try getting order ID from the full link text
        const fullText =
          (await link.textContent({ timeout: 300 }).catch(() => "")) || "";
        const fallbackMatches = fullText.match(/[D]?\d{3}-\d{7}-\d{7}/g);
        if (fallbackMatches) {
          orderIds.push(...fallbackMatches);
        }
      }

      // Extract amount - look for text with currency symbol (bold text)
      const fullText =
        (await link.textContent({ timeout: 300 }).catch(() => "")) || "";
      // Match amounts like "-£47.64", "+£93.59", "£1,399.13"
      const amountMatch = fullText.match(/([+-])?\s*([£$€])\s*([\d,]+\.?\d*)/);
      let amount = parseRegionMoney("0", currency);
      if (amountMatch) {
        const sign = amountMatch[1] === "+" ? "" : "-";
        const amountStr = `${sign}${amountMatch[2]}${amountMatch[3]}`;
        amount = parseRegionMoney(amountStr, currency);
      }

      // Determine if refund based on amount sign or status text
      const isRefund =
        fullText.includes("Refunded") ||
        (amountMatch && amountMatch[1] === "+");

      // Extract status
      const statusMatch = fullText.match(
        /\b(Pending|Charged|Refunded|Completed)\b/i,
      );
      const status = statusMatch ? statusMatch[1] : undefined;

      const transaction: Transaction = {
        date,
        orderIds: [...new Set(orderIds)], // Deduplicate
        amount,
        cardInfo,
        vendor: vendor.trim(),
        platformData: {
          source: "transactions-page",
          status,
          isRefund,
        },
      };

      transactions.push(transaction);
    } catch (e) {
      console.error(`[transactions-page] Error extracting transaction: ${e}`);
      continue;
    }
  }

  console.error(
    `[transactions-page] Strategy 1: Extracted ${transactions.length} transactions`,
  );
  return transactions;
}

/**
 * Generic extraction fallback.
 */
async function extractGeneric(
  page: Page,
  currency: string,
): Promise<Transaction[]> {
  const transactions: Transaction[] = [];

  // Get all text content and try to parse transactions
  const rows = await page.locator('.a-row, [class*="transaction"]').all();

  for (const row of rows) {
    try {
      const text = await row.textContent({ timeout: 200 }).catch(() => "");
      if (!text) continue;

      // Must have an order ID pattern to be a transaction
      if (!text.match(/\d{3}-\d{7}-\d{7}/)) continue;

      const transaction = parseTransactionText(text, currency);
      if (transaction) {
        transactions.push(transaction);
      }
    } catch {
      continue;
    }
  }

  return transactions;
}

/**
 * Extract a single transaction item.
 */
async function extractTransactionItem(
  item: ReturnType<Page["locator"]>,
  date: Date,
  currency: string,
): Promise<Transaction | null> {
  try {
    const itemText = await item.textContent({ timeout: 300 }).catch(() => "");
    if (!itemText) return null;

    // Extract order IDs
    const orderIdMatches = itemText.match(/\d{3}-\d{7}-\d{7}/g) || [];
    const orderIds = [...new Set(orderIdMatches)];

    if (orderIds.length === 0) return null;

    // Extract amount
    const amountMatch =
      itemText.match(/([$£€¥]|USD|GBP|EUR|CAD|AUD)\s*([\d,]+\.?\d*)/i) ||
      itemText.match(/([\d,]+\.?\d*)\s*([$£€¥]|USD|GBP|EUR|CAD|AUD)/i);
    const amount = amountMatch
      ? parseRegionMoney(amountMatch[0], currency)
      : parseRegionMoney("0", currency);

    // Extract card info (e.g., "Visa ****1234" or "ending in 1234")
    const cardMatch =
      itemText.match(
        /(Visa|Mastercard|Amex|American Express|Discover|Debit)[^*]*(\*{3,4}\d{4}|\d{4})/i,
      ) ||
      itemText.match(/ending\s*in\s*(\d{4})/i) ||
      itemText.match(/(\*{3,4}\d{4})/);
    const cardInfo = cardMatch ? cardMatch[0].trim() : "";

    // Extract vendor (text that's not order ID, amount, or card)
    let vendor = itemText
      .replace(/\d{3}-\d{7}-\d{7}/g, "")
      .replace(/([$£€¥]|USD|GBP|EUR|CAD|AUD)\s*[\d,]+\.?\d*/gi, "")
      .replace(
        /(Visa|Mastercard|Amex|American Express|Discover|Debit)[^*]*\*{3,4}\d{4}/gi,
        "",
      )
      .replace(/ending\s*in\s*\d{4}/gi, "")
      .replace(/\*{3,4}\d{4}/g, "")
      .replace(/Pending|Charged|Completed|Refunded/gi, "")
      .trim();

    // Clean up vendor - take first meaningful segment
    vendor = vendor.split(/\s{2,}|\n/)[0]?.trim() || "";

    return {
      date,
      orderIds,
      amount,
      cardInfo,
      vendor,
      platformData: { source: "transactions-page" },
    };
  } catch {
    return null;
  }
}

/**
 * Parse transaction from text content.
 */
function parseTransactionText(
  text: string,
  currency: string,
): Transaction | null {
  // Extract date
  const datePatterns = [
    /(\w+\s+\d{1,2},?\s+\d{4})/, // "January 15, 2024"
    /(\d{1,2}\s+\w+\s+\d{4})/, // "15 January 2024"
    /(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/, // "01/15/2024"
  ];

  let date: Date | null = null;
  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      date = parseDate(match[1]);
      if (date) break;
    }
  }

  if (!date) return null;

  // Extract order IDs
  const orderIdMatches = text.match(/\d{3}-\d{7}-\d{7}/g) || [];
  const orderIds = [...new Set(orderIdMatches)];

  if (orderIds.length === 0) return null;

  // Extract amount
  const amountMatch =
    text.match(/([$£€¥])\s*([\d,]+\.?\d*)/) ||
    text.match(/([\d,]+\.?\d*)\s*([$£€¥])/);
  const amount = amountMatch
    ? parseRegionMoney(amountMatch[0], currency)
    : parseRegionMoney("0", currency);

  // Extract card info
  const cardMatch =
    text.match(/(Visa|Mastercard|Amex|Discover)[^*]*(\*{3,4}\d{4})/i) ||
    text.match(/(\*{3,4}\d{4})/);
  const cardInfo = cardMatch ? cardMatch[0].trim() : "";

  // Extract vendor
  let vendor = text
    .replace(/\d{3}-\d{7}-\d{7}/g, "")
    .replace(/([$£€¥])\s*[\d,]+\.?\d*/g, "")
    .replace(/([\d,]+\.?\d*)\s*([$£€¥])/g, "")
    .replace(/(Visa|Mastercard|Amex|Discover)[^*]*\*{3,4}\d{4}/gi, "")
    .replace(/\*{3,4}\d{4}/g, "")
    .replace(/\w+\s+\d{1,2},?\s+\d{4}/g, "")
    .replace(/\d{1,2}\s+\w+\s+\d{4}/g, "")
    .replace(/Pending|Charged|Completed|Refunded/gi, "")
    .trim();

  vendor = vendor.split(/\s{2,}|\n/)[0]?.trim() || "";

  return {
    date,
    orderIds,
    amount,
    cardInfo,
    vendor,
    platformData: { source: "transactions-page" },
  };
}

/**
 * Advance to the next page of transactions.
 * Returns true if navigation happened, false if there is no next page.
 *
 * The paginated page uses a form-submit button:
 *   <input name="ppw-widgetEvent:DefaultNextPageNavigationEvent:..." type="submit">
 * (disabled buttons have no such input / carry the disabled attribute).
 * Falls back to scrolling for legacy infinite-scroll layouts.
 */
async function goToNextPage(page: Page): Promise<boolean> {
  const nextButton = page.locator(
    'input[name*="DefaultNextPageNavigationEvent"]:not([disabled])',
  );

  const count = await nextButton.count().catch(() => 0);
  if (count > 0) {
    await Promise.all([
      page
        .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 })
        .catch(() => {}),
      nextButton.first().click(),
    ]);
    // Wait for the new page's transactions to render
    await page
      .waitForSelector(".apx-transactions-line-item-component-container", {
        timeout: 10000,
      })
      .catch(() => {});
    await page.waitForTimeout(500);
    return true;
  }

  // Legacy infinite-scroll layout: scroll the last item into view
  const lastTransaction = page
    .locator('[data-testid="transaction-link"], .transactions-line-item')
    .last();

  const exists = await lastTransaction.count().catch(() => 0);
  if (exists > 0) {
    await lastTransaction.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(500);
    return true;
  }

  return false;
}

/**
 * Merge transactions, removing duplicates.
 */
function mergeTransactions(
  existing: Transaction[],
  newTransactions: Transaction[],
): Transaction[] {
  const seen = new Set<string>();
  const merged: Transaction[] = [];

  for (const t of [...existing, ...newTransactions]) {
    // Create unique key from date + orderIds + amount
    const key = `${t.date.toISOString()}-${t.orderIds.sort().join(",")}-${t.amount.amount}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(t);
    }
  }

  return merged;
}
