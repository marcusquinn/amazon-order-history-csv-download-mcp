/**
 * Invoice page extraction for Amazon orders.
 * Invoice pages have cleaner, more structured data than order detail pages.
 *
 * Invoice URL format: https://www.amazon.com/gp/css/summary/print.html?orderID=XXX-XXXXXXX-XXXXXXX
 *
 * Based on AZAD's payment.ts invoice extraction patterns.
 */

import { Page } from "playwright";
import { Item, extractAsinFromUrl } from "../../core/types/item";
import { OrderHeader, Payment } from "../../core/types/order";
import { Money, parseMoney } from "../../core/types/money";
import { getRegionByCode } from "../regions";

/**
 * Invoice data extracted from Amazon invoice page.
 */
export interface InvoiceData {
  orderId: string;
  orderDate?: Date;

  // Amounts
  subtotal?: Money;
  shipping?: Money;
  shippingRefund?: Money;
  tax?: Money;
  vat?: Money;
  gst?: Money;
  pst?: Money;
  total?: Money;
  gift?: Money;
  refund?: Money;

  // Recipient
  recipientName?: string;
  shippingAddress?: string[];

  // Payment
  payments?: Payment[];
  paymentMethod?: string;
  cardLastFour?: string;

  // Items
  items?: InvoiceItem[];
}

/**
 * Item from invoice page (simpler structure than full Item).
 */
export interface InvoiceItem {
  name: string;
  asin?: string;
  quantity: number;
  unitPrice: Money;
  condition?: string;
  seller?: string;
  subscriptionFrequency?: string; // e.g., "Every 1 month" for Subscribe & Save
}

/**
 * Get invoice URL for an order.
 */
export function getInvoiceUrl(orderId: string, domain: string): string {
  return `https://www.${domain}/gp/css/summary/print.html?orderID=${orderId}`;
}

/**
 * Extract all data from invoice page.
 * This is much faster than the order detail page as it has cleaner HTML.
 */
export async function extractFromInvoice(
  page: Page,
  header: OrderHeader,
): Promise<InvoiceData> {
  const regionConfig = getRegionByCode(header.region);
  const domain = regionConfig?.domain || "amazon.com";
  const currency = regionConfig?.currency || "USD";

  const invoiceUrl = getInvoiceUrl(header.orderId, domain);
  console.error(`[invoice] Navigating to invoice: ${invoiceUrl}`);

  // Navigate to invoice page
  await page.goto(invoiceUrl, {
    waitUntil: "domcontentloaded",
    timeout: 15000,
  });

  // Check where we actually landed
  const currentUrl = page.url();
  console.error(`[invoice] Current URL after navigation: ${currentUrl}`);

  // If we got redirected to sign-in or order history, log it
  if (currentUrl.includes("signin") || currentUrl.includes("ap/signin")) {
    console.error(
      `[invoice] Redirected to sign-in page - authentication required`,
    );
  } else if (
    currentUrl.includes("order-history") ||
    currentUrl.includes("your-orders")
  ) {
    console.error(
      `[invoice] Redirected to order history page - invoice URL may not be valid`,
    );
  }

  // Quick wait for content
  await page
    .waitForSelector('[data-component="purchasedItems"], table, .a-box', {
      timeout: 2000,
    })
    .catch(() => {});

  const data: InvoiceData = {
    orderId: header.orderId,
    orderDate: header.date || undefined,
  };

  // Extract all data in parallel for speed
  const [amounts, recipient, payments, items] = await Promise.all([
    extractAmounts(page, currency),
    extractRecipient(page),
    extractPayments(page),
    extractItems(page, header, currency),
  ]);

  console.error(
    `[invoice] Extracted: total=${amounts.total?.formatted}, items=${items.length}, payments=${payments.length}`,
  );

  Object.assign(data, amounts);
  Object.assign(data, recipient);
  data.payments = payments.length > 0 ? payments : undefined;
  data.items = items.length > 0 ? items : undefined;

  return data;
}

/**
 * Extract amounts from invoice page using data-component selectors.
 */
async function extractAmounts(
  page: Page,
  currency: string,
): Promise<Partial<InvoiceData>> {
  const result: Partial<InvoiceData> = {};

  // Strategy 1: Use data-component="chargeSummary" (modern invoice pages)
  try {
    const chargeSummary = page
      .locator('[data-component="chargeSummary"]')
      .first();
    const summaryCount = await chargeSummary.count().catch(() => 0);

    if (summaryCount > 0) {
      // Get all line items from the charge summary
      const lineItems = await chargeSummary.locator(".od-line-item-row").all();

      for (const item of lineItems) {
        const label = await item
          .locator(".od-line-item-row-label")
          .textContent({ timeout: 200 })
          .catch(() => "");
        const value = await item
          .locator(".od-line-item-row-content")
          .textContent({ timeout: 200 })
          .catch(() => "");

        const labelLower = label?.toLowerCase() || "";
        const cleanValue = value?.trim() || "";

        if (labelLower.includes("subtotal") && !labelLower.includes("before")) {
          result.subtotal = parseMoney(cleanValue, currency);
        } else if (
          labelLower.includes("postage") ||
          labelLower.includes("shipping") ||
          labelLower.includes("packing")
        ) {
          result.shipping = parseMoney(cleanValue, currency);
        } else if (labelLower.includes("vat")) {
          result.vat = parseMoney(cleanValue, currency);
        } else if (
          labelLower.includes("tax") &&
          !labelLower.includes("before")
        ) {
          result.tax = parseMoney(cleanValue, currency);
        } else if (
          labelLower.includes("promotion") ||
          labelLower.includes("discount")
        ) {
          result.gift = parseMoney(cleanValue, currency);
        } else if (labelLower.includes("grand total")) {
          result.total = parseMoney(cleanValue, currency);
        } else if (
          labelLower.includes("total:") &&
          !labelLower.includes("before") &&
          !labelLower.includes("subtotal")
        ) {
          // "Total:" line (before Grand Total)
          if (!result.total) {
            result.total = parseMoney(cleanValue, currency);
          }
        }
      }

      // If we found data from chargeSummary, return it
      if (result.subtotal || result.total || result.shipping) {
        console.error(
          `[invoice] Extracted from chargeSummary: subtotal=${result.subtotal?.formatted}, total=${result.total?.formatted}, shipping=${result.shipping?.formatted}, vat=${result.vat?.formatted}`,
        );
        return result;
      }
    }
  } catch (e) {
    console.error(`[invoice] chargeSummary extraction error: ${e}`);
  }

  // Strategy 2: Fallback to text parsing
  const pageText = (await page.textContent("body").catch(() => "")) || "";

  // Subtotal
  const subtotalMatch = pageText.match(
    /Item(?:s)?\s*Subtotal:?\s*([$£€]?\s*[\d,]+\.?\d*)/i,
  );
  if (subtotalMatch) {
    result.subtotal = parseMoney(subtotalMatch[1], currency);
  }

  // Shipping / Postage
  const shippingPatterns = [
    /Shipping\s*(?:&|and)?\s*Handling:?\s*([$£€]?\s*[\d,]+\.?\d*)/i,
    /Postage\s*(?:&|and)?\s*Packing:?\s*([$£€]?\s*[\d,]+\.?\d*)/i,
    /Delivery:?\s*([$£€]?\s*[\d,]+\.?\d*)/i,
  ];
  for (const pattern of shippingPatterns) {
    const match = pageText.match(pattern);
    if (match) {
      result.shipping = parseMoney(match[1], currency);
      break;
    }
  }

  // Tax patterns (region-specific)
  const taxPatterns = [
    /Estimated\s*tax:?\s*([$£€]?\s*[\d,]+\.?\d*)/i,
    /Tax\s*Collected:?\s*([$£€]?\s*[\d,]+\.?\d*)/i,
    /Sales\s*Tax:?\s*([$£€]?\s*[\d,]+\.?\d*)/i,
  ];
  for (const pattern of taxPatterns) {
    const match = pageText.match(pattern);
    if (match) {
      result.tax = parseMoney(match[1], currency);
      break;
    }
  }

  // VAT (UK/EU)
  const vatPatterns = [
    /Estimated\s*VAT:?\s*([$£€]?\s*[\d,]+\.?\d*)/i,
    /VAT:?\s*([$£€]?\s*[\d,]+\.?\d*)/i,
  ];
  for (const pattern of vatPatterns) {
    const match = pageText.match(pattern);
    if (match) {
      result.vat = parseMoney(match[1], currency);
      break;
    }
  }

  // GST (Canada/Australia)
  const gstMatch = pageText.match(/(?:GST|HST):?\s*([$£€]?\s*[\d,]+\.?\d*)/i);
  if (gstMatch) {
    result.gst = parseMoney(gstMatch[1], currency);
  }

  // PST (Canada)
  const pstMatch = pageText.match(
    /(?:PST|QST|RST):?\s*([$£€]?\s*[\d,]+\.?\d*)/i,
  );
  if (pstMatch) {
    result.pst = parseMoney(pstMatch[1], currency);
  }

  // Grand Total
  const totalPatterns = [
    /Grand\s*Total:?\s*([$£€]?\s*[\d,]+\.?\d*)/i,
    /Order\s*Total:?\s*([$£€]?\s*[\d,]+\.?\d*)/i,
    /Total\s*for\s*this\s*Order:?\s*([$£€]?\s*[\d,]+\.?\d*)/i,
  ];
  for (const pattern of totalPatterns) {
    const match = pageText.match(pattern);
    if (match) {
      result.total = parseMoney(match[1], currency);
      break;
    }
  }

  // Gift card / promotional credit / discount
  const giftPatterns = [
    /Gift\s*Card:?\s*-?\s*([$£€]?\s*[\d,]+\.?\d*)/i,
    /Promotion\s*Applied:?\s*-?\s*([$£€]?\s*[\d,]+\.?\d*)/i,
    /Discount:?\s*-?\s*([$£€]?\s*[\d,]+\.?\d*)/i,
    /Subscribe\s*(?:&|and)?\s*Save:?\s*-?\s*([$£€]?\s*[\d,]+\.?\d*)/i,
  ];
  for (const pattern of giftPatterns) {
    const match = pageText.match(pattern);
    if (match) {
      result.gift = parseMoney(match[1], currency);
      break;
    }
  }

  // Refund
  const refundMatch = pageText.match(
    /Refund:?\s*-?\s*([$£€]?\s*[\d,]+\.?\d*)/i,
  );
  if (refundMatch) {
    result.refund = parseMoney(refundMatch[1], currency);
  }

  return result;
}

/**
 * Extract recipient/shipping info from invoice using data-component selectors.
 */
async function extractRecipient(page: Page): Promise<Partial<InvoiceData>> {
  const result: Partial<InvoiceData> = {};

  // Strategy 1: Use data-component="shippingAddress" (modern invoice pages)
  try {
    const shippingComponent = page
      .locator('[data-component="shippingAddress"]')
      .first();
    const componentCount = await shippingComponent.count().catch(() => 0);

    if (componentCount > 0) {
      // Get all list items from the shipping address
      const listItemsLocators = await shippingComponent
        .locator("li span.a-list-item")
        .all();

      if (listItemsLocators.length > 0) {
        // First item is the recipient name
        result.recipientName = (
          await listItemsLocators[0]
            .textContent({ timeout: 300 })
            .catch(() => "")
        )?.trim();
        result.shippingAddress = [];

        for (let i = 1; i < listItemsLocators.length; i++) {
          // Get innerHTML to preserve <br> tags
          const innerHTML = await listItemsLocators[i]
            .innerHTML({ timeout: 300 })
            .catch(() => "");
          if (innerHTML) {
            // Split by <br> tags and extract text
            const subLines = innerHTML
              .split(/<br\s*\/?>/gi)
              .map((l) => l.replace(/<[^>]*>/g, "").trim())
              .filter((l) => l);
            result.shippingAddress.push(...subLines);
          }
        }

        if (result.recipientName) {
          console.error(
            `[invoice] Extracted from shippingAddress: ${result.recipientName}, ${result.shippingAddress?.length || 0} address lines`,
          );
          return result;
        }
      }
    }
  } catch (e) {
    console.error(`[invoice] shippingAddress extraction error: ${e}`);
  }

  // Strategy 2: Look for shipping address section with text selectors
  const addressSelectors = [
    "text=Shipping Address >> xpath=following-sibling::*[1]",
    "text=Ship to >> xpath=following-sibling::*[1]",
    "text=Deliver to >> xpath=following-sibling::*[1]",
    "text=Dispatch to >> xpath=following-sibling::*[1]",
  ];

  for (const selector of addressSelectors) {
    try {
      const addressElem = page.locator(selector).first();
      if (await addressElem.isVisible({ timeout: 200 })) {
        const addressText = await addressElem.textContent({ timeout: 300 });
        if (addressText) {
          const lines = addressText
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l);
          if (lines.length > 0) {
            result.recipientName = lines[0];
            result.shippingAddress = lines;
            return result;
          }
        }
      }
    } catch {
      continue;
    }
  }

  // Strategy 3: Fallback to text parsing
  if (!result.recipientName) {
    const pageText = (await page.textContent("body").catch(() => "")) || "";
    const addressMatch = pageText.match(
      /(?:Ship(?:ping)?\s*(?:to|Address)|Deliver\s*to|Dispatch\s*to):?\s*([^\n]+(?:\n[^\n]+){0,4})/i,
    );
    if (addressMatch) {
      const lines = addressMatch[1]
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l);
      if (lines.length > 0) {
        result.recipientName = lines[0];
        result.shippingAddress = lines;
      }
    }
  }

  return result;
}

/**
 * Extract payment information from invoice using data-component selectors.
 * Based on AZAD's payment.ts patterns with modern data-component support.
 */
async function extractPayments(page: Page): Promise<Payment[]> {
  const payments: Payment[] = [];

  // Strategy 1: Use data-component="viewPaymentPlanSummaryWidget" (modern invoice pages)
  try {
    const paymentWidget = page
      .locator('[data-component="viewPaymentPlanSummaryWidget"]')
      .first();
    const widgetCount = await paymentWidget.count().catch(() => 0);

    if (widgetCount > 0) {
      // Try to get from the React component data-testid attributes
      const methodName = await paymentWidget
        .locator('[data-testid="method-details-name"]')
        .textContent({ timeout: 300 })
        .catch(() => "");
      const lastDigits = await paymentWidget
        .locator('[data-testid="method-details-number"]')
        .textContent({ timeout: 300 })
        .catch(() => "");

      if (methodName) {
        payments.push({
          method: methodName.trim(),
          lastFour: lastDigits?.trim() || undefined,
        });
        console.error(
          `[invoice] Extracted payment from widget: ${methodName.trim()} ****${lastDigits?.trim() || "????"}`,
        );
        return payments;
      }

      // Fallback: parse from widget text
      const widgetText = await paymentWidget
        .textContent({ timeout: 300 })
        .catch(() => "");
      if (widgetText) {
        // Pattern: "Wise Card ••••3858" or "Visa ••••1234"
        const cardMatch = widgetText.match(
          /([A-Za-z\s]+?)(?:\s*Card)?\s*[•*]+\s*(\d{4})/,
        );
        if (cardMatch) {
          const methodType = cardMatch[1].trim();
          payments.push({
            method: methodType.toLowerCase().includes("card")
              ? methodType
              : methodType + " Card",
            lastFour: cardMatch[2],
          });
          console.error(
            `[invoice] Extracted payment from widget text: ${methodType} ****${cardMatch[2]}`,
          );
          return payments;
        }
      }
    }
  } catch (e) {
    console.error(`[invoice] paymentWidget extraction error: ${e}`);
  }

  // Strategy 2: Text-based extraction (fallback)
  const pageText = (await page.textContent("body").catch(() => "")) || "";

  // "Payment Method: Visa | Last digits: 1234"
  const paymentMethodMatch = pageText.match(
    /Payment\s*Method:?\s*([A-Za-z0-9\s/]+?)\s*\|/i,
  );
  const lastDigitsMatch = pageText.match(/Last\s*digits:?\s*(\d{4})/i);

  if (paymentMethodMatch) {
    payments.push({
      method: paymentMethodMatch[1].trim(),
      lastFour: lastDigitsMatch ? lastDigitsMatch[1] : undefined,
    });
  }

  // Strategy 3: "Visa ending in 1234" or "Mastercard ****5678"
  const cardPatterns = [
    /(Visa|Mastercard|Amex|American Express|Discover|Wise\s*Card?)\s*(?:ending\s*in|[•*]{3,4})\s*(\d{4})/gi,
  ];

  for (const pattern of cardPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(pageText)) !== null) {
      // Avoid duplicates
      const exists = payments.some((p) => p.lastFour === match![2]);
      if (!exists) {
        payments.push({
          method: match[1],
          lastFour: match[2],
        });
      }
    }
  }

  // Strategy 4: Gift card
  if (
    pageText.match(/Gift\s*Card/i) &&
    !payments.some((p) => p.method?.includes("Gift"))
  ) {
    payments.push({ method: "Amazon Gift Card" });
  }

  return payments;
}

/**
 * Extract items from invoice page.
 * Tries multiple strategies as invoice page structure varies.
 */
async function extractItems(
  page: Page,
  _header: OrderHeader,
  currency: string,
): Promise<InvoiceItem[]> {
  // Strategy 0: Use data-component selectors (fastest, most reliable)
  let items = await extractItemsFromDataComponents(page, currency);
  console.error(`[invoice] Strategy 0 (data-component): ${items.length} items`);
  if (items.length > 0) return items;

  // Strategy 1: Look for product links in table rows
  items = await extractItemsFromTableRows(page, currency);
  console.error(`[invoice] Strategy 1 (table rows): ${items.length} items`);
  if (items.length > 0) return items;

  // Strategy 2: Look for product links anywhere on page
  items = await extractItemsFromLinks(page, currency);
  console.error(`[invoice] Strategy 2 (links): ${items.length} items`);
  if (items.length > 0) return items;

  // Strategy 3: Look for item containers with specific patterns
  items = await extractItemsFromContainers(page, currency);
  console.error(`[invoice] Strategy 3 (containers): ${items.length} items`);
  if (items.length > 0) return items;

  // Strategy 4: Parse from page text (fallback)
  items = await extractItemsFromText(page, currency);
  console.error(`[invoice] Strategy 4 (text): ${items.length} items`);

  return items;
}

/**
 * Strategy 0: Extract items using data-component selectors.
 * This is the most reliable method as Amazon uses consistent data-component attributes.
 *
 * Structure:
 * - [data-component="purchasedItems"] - container for each item
 *   - [data-component="itemTitle"] a - product name + ASIN from href
 *   - [data-component="unitPrice"] .a-offscreen - price
 *   - [data-component="itemCondition"] - condition text
 *   - [data-component="orderedMerchant"] a - seller name
 *   - [data-component="quantity"] - quantity (empty = 1)
 *   - [data-component="itemImage"] .od-item-view-qty span - quantity badge (alternative location)
 */
async function extractItemsFromDataComponents(
  page: Page,
  currency: string,
): Promise<InvoiceItem[]> {
  const items: InvoiceItem[] = [];

  // Find all purchasedItems containers
  const itemContainers = await page
    .locator('[data-component="purchasedItems"]')
    .all();

  console.error(
    `[invoice] extractItemsFromDataComponents: Found ${itemContainers.length} purchasedItems containers`,
  );

  for (const container of itemContainers) {
    try {
      // Get ALL item titles from this container (may have multiple for variants)
      const titleLinks = await container
        .locator('[data-component="itemTitle"] a')
        .all();

      console.error(
        `[invoice] Container has ${titleLinks.length} itemTitle links`,
      );

      if (titleLinks.length === 0) continue;

      // Get shared data from container (seller, etc.) - same for all items in container
      let sharedSeller: string | undefined;
      const sellerLink = container
        .locator('[data-component="orderedMerchant"] a')
        .first();
      const sellerLinkCount = await sellerLink.count().catch(() => 0);
      if (sellerLinkCount > 0) {
        const sellerText = await sellerLink
          .textContent({ timeout: 300 })
          .catch(() => "");
        sharedSeller = sellerText?.trim() || undefined;
      } else {
        const sellerSpan = container
          .locator('[data-component="orderedMerchant"] span')
          .first();
        const sellerSpanCount = await sellerSpan.count().catch(() => 0);
        if (sellerSpanCount > 0) {
          const sellerText = await sellerSpan
            .textContent({ timeout: 300 })
            .catch(() => "");
          const sellerMatch = sellerText?.match(/Sold by:\s*(.+)/i);
          if (sellerMatch) {
            sharedSeller = sellerMatch[1].trim();
          }
        }
      }

      // Process each item title in the container
      for (let i = 0; i < titleLinks.length; i++) {
        const titleLink = titleLinks[i];

        const name = await titleLink
          .textContent({ timeout: 300 })
          .catch(() => "");
        if (!name || !name.trim()) continue;

        const href = await titleLink
          .getAttribute("href", { timeout: 300 })
          .catch(() => "");
        const asin = href ? extractAsinFromUrl(href) : undefined;

        console.error(
          `[invoice] Item ${i + 1}/${titleLinks.length} found: ASIN=${asin}, name=${name.slice(0, 50)}...`,
        );

        // Get price - try to get the i-th price element (prices are in same order as titles)
        let price = parseMoney("0", currency);
        const priceElements = await container
          .locator('[data-component="unitPrice"] .a-offscreen')
          .all();
        if (priceElements.length > i) {
          const priceText = await priceElements[i]
            .textContent({ timeout: 300 })
            .catch(() => "");
          if (priceText) {
            price = parseMoney(priceText, currency);
          }
        } else if (priceElements.length > 0) {
          // Fallback to first price if not enough prices
          const priceText = await priceElements[0]
            .textContent({ timeout: 300 })
            .catch(() => "");
          if (priceText) {
            price = parseMoney(priceText, currency);
          }
        }

        // Get condition - try i-th element
        let condition: string | undefined;
        const conditionElements = await container
          .locator('[data-component="itemCondition"]')
          .all();
        if (conditionElements.length > i) {
          const conditionText = await conditionElements[i]
            .textContent({ timeout: 300 })
            .catch(() => "");
          const conditionMatch = conditionText?.match(/Condition:\s*(.+)/i);
          if (conditionMatch) {
            condition = conditionMatch[1].trim();
          }
        }

        // Get quantity - try i-th element
        let quantity = 1;
        const qtyElements = await container
          .locator(
            '[data-component="itemImage"] .od-item-view-qty span, .od-item-view-qty span',
          )
          .all();
        if (qtyElements.length > i) {
          const qtyText = await qtyElements[i]
            .textContent({ timeout: 300 })
            .catch(() => "");
          const qtyMatch = qtyText?.match(/(\d+)/);
          if (qtyMatch) {
            quantity = parseInt(qtyMatch[1], 10);
          }
        }

        // Get subscription frequency - try i-th element
        let subscriptionFrequency: string | undefined;
        const freqElements = await container
          .locator('[data-component="deliveryFrequency"]')
          .all();
        if (freqElements.length > i) {
          const freqText = await freqElements[i]
            .textContent({ timeout: 300 })
            .catch(() => "");
          const freqMatch = freqText?.match(/Auto-delivered:\s*(.+)/i);
          if (freqMatch) {
            subscriptionFrequency = freqMatch[1].trim();
          }
        }

        items.push({
          name: name.trim(),
          asin,
          quantity,
          unitPrice: price,
          condition,
          seller: sharedSeller,
          subscriptionFrequency,
        });
      }
    } catch (e) {
      console.error(`[invoice] Error extracting from container: ${e}`);
      continue;
    }
  }

  return items;
}

/**
 * Strategy 1: Extract items from table rows with product links.
 */
async function extractItemsFromTableRows(
  page: Page,
  currency: string,
): Promise<InvoiceItem[]> {
  const items: InvoiceItem[] = [];
  const itemRows = await page.locator("tr").all();

  for (const row of itemRows) {
    try {
      const rowText = await row.textContent({ timeout: 200 }).catch(() => "");
      if (!rowText) continue;

      // Skip header/summary rows
      if (
        rowText.match(
          /^(Subtotal|Shipping|Tax|Total|Grand|Payment|Item|Qty|Price)/i,
        )
      )
        continue;
      if (rowText.match(/Subtotal:?\s*[$£€]|Total:?\s*[$£€]/i)) continue;

      // Look for product links
      const link = row
        .locator('a[href*="/dp/"], a[href*="/gp/product/"]')
        .first();
      const hasLink = await link.count().catch(() => 0);

      if (hasLink > 0) {
        const item = await extractItemFromElement(link, row, rowText, currency);
        if (item) items.push(item);
      }
    } catch {
      continue;
    }
  }

  return items;
}

/**
 * Strategy 2: Extract items from any product links on page.
 */
async function extractItemsFromLinks(
  page: Page,
  currency: string,
): Promise<InvoiceItem[]> {
  const items: InvoiceItem[] = [];
  const seenAsins = new Set<string>();

  // Find all product links
  const links = await page
    .locator('a[href*="/dp/"], a[href*="/gp/product/"]')
    .all();

  for (const link of links) {
    try {
      const href = await link
        .getAttribute("href", { timeout: 200 })
        .catch(() => "");
      const name = await link.textContent({ timeout: 200 }).catch(() => "");

      if (!name || !name.trim()) continue;
      if (name.length < 5) continue; // Skip very short links (probably not product names)

      const asin = href ? extractAsinFromUrl(href) : undefined;

      // Skip exact duplicates (same ASIN + same name) but allow same ASIN with different names
      // This handles product variations (sizes, colors) which may share an ASIN
      const dedupKey = `${asin || ""}:${name}`;
      if (seenAsins.has(dedupKey)) continue;
      seenAsins.add(dedupKey);

      // Get parent container for context
      const parent = link.locator(
        "xpath=ancestor::*[self::tr or self::div or self::td][1]",
      );
      const parentText = await parent
        .textContent({ timeout: 200 })
        .catch(() => name);

      const item = await extractItemFromElement(
        link,
        parent,
        parentText || name,
        currency,
      );
      if (item) items.push(item);
    } catch {
      continue;
    }
  }

  return items;
}

/**
 * Strategy 3: Extract items from container elements.
 * Invoice pages may use divs/spans instead of tables.
 */
async function extractItemsFromContainers(
  page: Page,
  currency: string,
): Promise<InvoiceItem[]> {
  const items: InvoiceItem[] = [];
  const seenNames = new Set<string>();

  // Look for common item container patterns
  const containerSelectors = [
    // Table cells that might contain items
    'td:has(a[href*="/dp/"]), td:has(a[href*="/gp/product/"])',
    // Divs with product info
    'div:has(a[href*="/dp/"]):not(:has(div:has(a[href*="/dp/"])))',
    // Specific invoice item patterns
    '[class*="item"], [class*="product"]',
  ];

  for (const selector of containerSelectors) {
    try {
      const containers = await page.locator(selector).all();

      for (const container of containers) {
        try {
          const text = await container
            .textContent({ timeout: 200 })
            .catch(() => "");
          if (!text || text.length < 10) continue;

          // Skip if it looks like a summary row
          if (text.match(/^(Subtotal|Shipping|Tax|Grand|Total|Payment)/i))
            continue;

          // Find product link within container
          const link = container
            .locator('a[href*="/dp/"], a[href*="/gp/product/"]')
            .first();
          const linkCount = await link.count().catch(() => 0);

          if (linkCount > 0) {
            const name = await link
              .textContent({ timeout: 200 })
              .catch(() => "");
            if (!name || name.trim().length < 3) continue;

            // Get ASIN for deduplication
            const href = await link
              .getAttribute("href", { timeout: 200 })
              .catch(() => "");
            const asin = href ? extractAsinFromUrl(href) : "";

            // Skip exact duplicates (same ASIN + same name)
            // But allow same ASIN with different names (product variations)
            const dedupKey = `${asin}:${name.trim()}`;
            if (seenNames.has(dedupKey)) continue;
            seenNames.add(dedupKey);

            const item = await extractItemFromElement(
              link,
              container,
              text,
              currency,
            );
            if (item) items.push(item);
          }
        } catch {
          continue;
        }
      }

      if (items.length > 0) break;
    } catch {
      continue;
    }
  }

  return items;
}

/**
 * Strategy 4: Extract items from page text (fallback).
 */
async function extractItemsFromText(
  page: Page,
  currency: string,
): Promise<InvoiceItem[]> {
  const items: InvoiceItem[] = [];
  const pageText = (await page.textContent("body").catch(() => "")) || "";

  // Look for ASIN patterns in text
  const asinMatches =
    pageText.match(/(?:ASIN|asin)[:\s]*([A-Z0-9]{10})/g) || [];

  for (const match of asinMatches) {
    const asinMatch = match.match(/([A-Z0-9]{10})/);
    if (asinMatch) {
      items.push({
        name: `Product ${asinMatch[1]}`,
        asin: asinMatch[1],
        quantity: 1,
        unitPrice: parseMoney("0", currency),
      });
    }
  }

  return items;
}

/**
 * Extract item details from a link element and its container.
 */
async function extractItemFromElement(
  link: ReturnType<Page["locator"]>,
  _container: ReturnType<Page["locator"]>,
  containerText: string,
  currency: string,
): Promise<InvoiceItem | null> {
  try {
    const href = await link
      .getAttribute("href", { timeout: 200 })
      .catch(() => "");
    const name = await link.textContent({ timeout: 200 }).catch(() => "");

    if (!name || !name.trim()) return null;

    const asin = href ? extractAsinFromUrl(href) : undefined;

    // Extract quantity
    let quantity = 1;
    const qtyMatch =
      containerText.match(/Qty:?\s*(\d+)/i) ||
      containerText.match(/Quantity:?\s*(\d+)/i) ||
      containerText.match(/\b(\d+)\s*(?:x|×)\s/i);
    if (qtyMatch) {
      quantity = parseInt(qtyMatch[1], 10);
    }

    // Extract price - look for price pattern
    let price = parseMoney("0", currency);
    const pricePatterns = [
      /([$£€¥]\s*[\d,]+\.?\d*)/,
      /([\d,]+\.?\d*)\s*[$£€¥]/,
    ];
    for (const pattern of pricePatterns) {
      const priceMatch = containerText.match(pattern);
      if (priceMatch) {
        price = parseMoney(priceMatch[1], currency);
        if (price.amount > 0) break;
      }
    }

    // Extract condition
    let condition: string | undefined;
    const conditionMatch = containerText.match(/Condition:?\s*([^|$£€\n]+)/i);
    if (conditionMatch) {
      condition = conditionMatch[1].trim();
    } else {
      const usedMatch = containerText.match(
        /(Used\s*-\s*(?:Very Good|Good|Acceptable|Like New)|New|Refurbished)/i,
      );
      if (usedMatch) condition = usedMatch[1];
    }

    // Extract seller
    let seller: string | undefined;
    const sellerMatch = containerText.match(/Sold\s*by:?\s*([^|$£€\n,]+)/i);
    if (sellerMatch) {
      seller = sellerMatch[1].trim();
    }

    return {
      name: name.trim(),
      asin,
      quantity,
      unitPrice: price,
      condition,
      seller,
    };
  } catch {
    return null;
  }
}

/**
 * Convert InvoiceItem to full Item type.
 */
export function invoiceItemToItem(
  invoiceItem: InvoiceItem,
  header: OrderHeader,
  domain: string,
): Item {
  return {
    id: invoiceItem.asin || invoiceItem.name.slice(0, 50),
    asin: invoiceItem.asin,
    name: invoiceItem.name,
    quantity: invoiceItem.quantity,
    unitPrice: invoiceItem.unitPrice,
    totalPrice: {
      ...invoiceItem.unitPrice,
      amount: invoiceItem.unitPrice.amount * invoiceItem.quantity,
    },
    url: invoiceItem.asin ? `https://www.${domain}/dp/${invoiceItem.asin}` : "",
    orderHeader: header,
    condition: invoiceItem.condition,
    seller: invoiceItem.seller ? { name: invoiceItem.seller } : undefined,
    platformData: { source: "invoice" },
  };
}
