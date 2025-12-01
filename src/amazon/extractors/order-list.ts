/**
 * Order list page extraction.
 * Extracts order headers from Amazon's order history pages.
 */

import { Page } from "playwright";
import { appendFileSync } from "fs";
import { OrderHeader, OrderStatus } from "../../core/types/order";
import { parseMoney } from "../../core/types/money";
import { parseDate } from "../../core/utils/date";
import {
  getTextByXPaths,
  firstMatchingStrategy,
} from "../../core/utils/extraction";
import { getRegionByCode } from "../regions";

// Debug logger that writes to file
function debug(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    appendFileSync("/tmp/amazon-mcp-debug.log", line);
  } catch {
    // ignore
  }
  console.error(msg);
}

/**
 * Extract the expected order count from the page.
 */
export async function extractExpectedOrderCount(page: Page): Promise<number> {
  const countText = await getTextByXPaths(
    page,
    [
      '//span[@class="num-orders"]',
      '//span[contains(@class, "num-orders")]',
      '//*[contains(text(), " orders")]',
      '//*[contains(text(), " order")]',
    ],
    "0 orders",
  );

  const match = countText.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Find all order card elements on the page.
 * Uses data-component selectors first for 2024+ layouts.
 */
async function findOrderCards(
  page: Page,
): Promise<import("playwright").Locator[]> {
  // Try multiple selectors and return first that finds elements
  // Prioritize data-component selectors for modern layouts
  const selectors = [
    '[data-component="orderCard"]', // 2024+ primary selector
    ".js-order-card",
    ".order-card",
    "#orderCard",
    ".a-box-group.order",
    ".order-info",
    ".a-box.order-info",
    '[class*="order-card"]',
    ".your-orders-content-container .a-box-group",
    ".order-row",
    '[data-testid="order-card"]',
  ];

  debug(`[findOrderCards] Trying ${selectors.length} selectors...`);

  for (const selector of selectors) {
    try {
      const locator = page.locator(selector);
      const count = await locator.count();
      debug(`[findOrderCards] Selector "${selector}" found ${count} elements`);
      if (count > 0) {
        const elements: import("playwright").Locator[] = [];
        for (let i = 0; i < count; i++) {
          elements.push(locator.nth(i));
        }
        return elements;
      }
    } catch (e) {
      debug(`[findOrderCards] Selector "${selector}" error: ${e}`);
    }
  }

  // Log page content hint for debugging
  const title = await page.title();
  debug(`[findOrderCards] No order cards found. Page title: ${title}`);

  return [];
}

/**
 * Extract order ID from an order card element.
 */
async function extractOrderId(
  card: import("playwright").Locator,
): Promise<string> {
  // Strategy 1: Data popover attribute
  const strategy1 = async () => {
    const popoverAttr = await card
      .locator("[data-a-popover]")
      .first()
      .getAttribute("data-a-popover")
      .catch(() => null);
    if (popoverAttr) {
      const match = popoverAttr.match(/orderId['":\s]+([0-9-]+)/);
      if (match) return match[1];
    }
    return null;
  };

  // Strategy 2: Order ID span with class
  const strategy2 = async () => {
    const text = await card
      .locator('.yohtmlc-order-id span, [data-test-id="order-id"]')
      .first()
      .textContent()
      .catch(() => null);
    if (text) {
      const cleaned = text.replace(/[^0-9-]/g, "").trim();
      if (cleaned.match(/^\d{3}-\d{7}-\d{7}$/)) return cleaned;
    }
    return null;
  };

  // Strategy 3: Any element containing order ID pattern (standard 3-7-7 format)
  const strategy3 = async () => {
    const text = await card.textContent().catch(() => "");
    const match = text?.match(/(\d{3}-\d{7}-\d{7})/);
    return match ? match[1] : null;
  };

  // Strategy 3b: Amazon Fresh 2025+ hex format (8-4-4-4-12 UUID format)
  // From AZAD: [a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}
  const strategy3b = async () => {
    const text = await card.textContent().catch(() => "");
    const match = text?.match(
      /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i,
    );
    return match ? match[1] : null;
  };

  // Strategy 4: Link with order ID
  const strategy4 = async () => {
    const href = await card
      .locator('a[href*="orderID="]')
      .first()
      .getAttribute("href")
      .catch(() => null);
    if (href) {
      const match = href.match(/orderID=([0-9-]+)/);
      if (match) return match[1];
    }
    return null;
  };

  return firstMatchingStrategy(
    [strategy1, strategy2, strategy3, strategy3b, strategy4],
    "",
  );
}

/**
 * Extract order date from an order card element.
 * Uses pre-fetched text content to avoid multiple slow calls.
 * Supports both US format (Month DD, YYYY) and UK format (DD Month YYYY).
 */
async function extractOrderDate(allText: string): Promise<Date | null> {
  // Month names pattern (for matching)
  const monthsPattern =
    "January|February|March|April|May|June|July|August|September|October|November|December";

  // Pattern 1: US format after "Order placed" - "October 14, 2024"
  const usAfterPlaced = allText.match(
    new RegExp(
      `(?:Order placed|ORDER PLACED)\\s*\\n?\\s*((${monthsPattern})\\s+\\d{1,2},?\\s+\\d{4})`,
      "i",
    ),
  );
  if (usAfterPlaced) {
    return parseDate(usAfterPlaced[1]);
  }

  // Pattern 2: UK format after "Order placed" - "14 October 2024"
  const ukAfterPlaced = allText.match(
    new RegExp(
      `(?:Order placed|ORDER PLACED)\\s*\\n?\\s*(\\d{1,2}\\s+(${monthsPattern})\\s+\\d{4})`,
      "i",
    ),
  );
  if (ukAfterPlaced) {
    return parseDate(ukAfterPlaced[1]);
  }

  // Pattern 3: UK format anywhere - "14 November 2024"
  const ukAnywhere = allText.match(
    new RegExp(`(\\d{1,2}\\s+(${monthsPattern})\\s+\\d{4})`, "i"),
  );
  if (ukAnywhere) {
    return parseDate(ukAnywhere[1]);
  }

  // Pattern 4: US format anywhere - "November 14, 2024"
  const usAnywhere = allText.match(
    new RegExp(`((${monthsPattern})\\s+\\d{1,2},?\\s+\\d{4})`, "i"),
  );
  if (usAnywhere) {
    return parseDate(usAnywhere[1]);
  }

  return null;
}

/**
 * Extract order total from an order card element.
 * Uses pre-fetched text content to avoid multiple slow calls.
 */
function extractOrderTotal(
  allText: string,
  currency: string,
): ReturnType<typeof parseMoney> {
  // Look for total after "Total" or "TOTAL"
  const totalMatch = allText.match(
    /(?:Total|TOTAL)\s*\n?\s*([$£€][\d,]+\.\d{2})/i,
  );
  if (totalMatch) {
    return parseMoney(totalMatch[1], currency);
  }

  // Fallback: look for any price pattern
  const anyPriceMatch = allText.match(/([$£€][\d,]+\.\d{2})/);
  if (anyPriceMatch) {
    return parseMoney(anyPriceMatch[1], currency);
  }

  return parseMoney("", currency);
}

/**
 * Clean text by removing excessive whitespace and normalizing.
 */
function cleanText(text: string): string {
  return text
    .replace(/\s+/g, " ") // Collapse all whitespace to single space
    .trim();
}

/**
 * Split address HTML/text into individual lines.
 * Handles multiple formats: <br>, <br/>, &lt;br&gt;, newlines, and all-caps line patterns.
 */
function splitAddressLines(content: string): string[] {
  debug(
    `[splitAddressLines] Input (first 300 chars): ${content.slice(0, 300)}`,
  );

  // First decode HTML entities
  let decoded = content
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#xa0;/g, " "); // Non-breaking space entity

  debug(`[splitAddressLines] After decode: ${decoded.slice(0, 300)}`);

  // Split by various line break patterns
  let lines = decoded
    .split(/<br\s*\/?>/gi) // <br>, <br/>, <br />
    .flatMap((part) => part.split(/\n/)) // Also split by newlines
    .map((line) => {
      // Remove all remaining HTML tags and clean whitespace
      return cleanText(line.replace(/<[^>]+>/g, ""));
    })
    .filter((line) => line.length > 0);

  debug(`[splitAddressLines] After split: ${JSON.stringify(lines)}`);

  // If we still have combined lines (detected by patterns like "TOWN POSTCODE"),
  // try to split on all-caps boundaries or common UK address patterns
  const resplit: string[] = [];
  for (const line of lines) {
    // Check for UK postcode pattern mid-line (e.g., "TOWN JE2 6PT")
    // UK postcodes: 1-2 letters, 1-2 digits, space, digit, 2 letters
    const postcodeMatch = line.match(
      /^(.+?)\s+([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})(.*)$/i,
    );
    if (postcodeMatch) {
      const beforePostcode = postcodeMatch[1].trim();
      const postcode = postcodeMatch[2].trim();
      const afterPostcode = postcodeMatch[3].trim();

      // Try to split the beforePostcode part further if it looks combined
      // e.g., "GREVE DAZETTE ST CLEMENT" should stay as one line if it's a locality name
      resplit.push(beforePostcode);
      if (afterPostcode) {
        resplit.push(postcode);
        resplit.push(afterPostcode);
      } else {
        resplit.push(postcode);
      }
    } else {
      resplit.push(line);
    }
  }

  debug(`[splitAddressLines] After resplit: ${JSON.stringify(resplit)}`);

  // Remove consecutive duplicates (name often appears twice in a row)
  const deduped: string[] = [];
  for (const line of resplit) {
    if (
      line &&
      (deduped.length === 0 || deduped[deduped.length - 1] !== line)
    ) {
      deduped.push(line);
    }
  }

  debug(`[splitAddressLines] Final: ${JSON.stringify(deduped)}`);
  return deduped;
}

/**
 * Extract shipping address from order card.
 * Returns up to 7 address lines, cleaned of whitespace.
 * Tries multiple strategies:
 * 1. Script template with ID pattern #shipToData-shippingAddress-* (popover data)
 * 2. data-component="shippingAddress" with list items
 */
async function extractShippingAddress(
  card: import("playwright").Locator,
): Promise<
  | {
      line1?: string;
      line2?: string;
      line3?: string;
      line4?: string;
      line5?: string;
      line6?: string;
      line7?: string;
    }
  | undefined
> {
  try {
    // Strategy 1: Extract from script template (popover data)
    // Format: <script type="text/template" id="shipToData-shippingAddress-{hash}">
    // Contains HTML like: <span>Name</span><br>Line1<br>Line2<br>Country
    const scriptTemplates = await card
      .locator(
        'script[type="text/template"][id^="shipToData-shippingAddress-"]',
      )
      .all();

    for (const script of scriptTemplates) {
      // Try both innerHTML and textContent - sometimes content is HTML-encoded
      let content = await script.innerHTML().catch(() => "");
      if (!content) {
        content = (await script.textContent().catch(() => "")) || "";
      }

      if (content) {
        debug(
          `[extractShippingAddress] Raw script content (first 500 chars): ${content.slice(0, 500)}`,
        );

        const lines = splitAddressLines(content);
        debug(
          `[extractShippingAddress] Split into ${lines.length} lines: ${JSON.stringify(lines)}`,
        );

        if (lines.length > 0) {
          return {
            line1: lines[0],
            line2: lines[1],
            line3: lines[2],
            line4: lines[3],
            line5: lines[4],
            line6: lines[5],
            line7: lines[6],
          };
        }
      }
    }

    // Strategy 2: data-component="shippingAddress" with list items
    const addressComponent = card
      .locator('[data-component="shippingAddress"]')
      .first();
    const count = await addressComponent.count().catch(() => 0);
    if (count === 0) return undefined;

    // Try getting the inner HTML of the entire component to parse properly
    const componentHtml = await addressComponent.innerHTML().catch(() => "");
    if (componentHtml) {
      debug(
        `[extractShippingAddress] Component HTML (first 500 chars): ${componentHtml.slice(0, 500)}`,
      );
      const lines = splitAddressLines(componentHtml);
      debug(
        `[extractShippingAddress] Component split into ${lines.length} lines: ${JSON.stringify(lines)}`,
      );

      if (lines.length > 0) {
        return {
          line1: lines[0],
          line2: lines[1],
          line3: lines[2],
          line4: lines[3],
          line5: lines[4],
          line6: lines[5],
          line7: lines[6],
        };
      }
    }

    // Fallback: try list items
    const listItems = await addressComponent
      .locator("li span.a-list-item")
      .allTextContents();

    if (listItems.length > 0) {
      const lines: string[] = [];
      for (const item of listItems) {
        // Each list item might contain multiple lines separated by <br>
        const itemLines = splitAddressLines(item);
        lines.push(...itemLines);
      }

      if (lines.length > 0) {
        return {
          line1: lines[0],
          line2: lines[1],
          line3: lines[2],
          line4: lines[3],
          line5: lines[4],
          line6: lines[5],
          line7: lines[6],
        };
      }
    }

    return undefined;
  } catch (e) {
    debug(`[extractShippingAddress] Error: ${e}`);
    return undefined;
  }
}

/**
 * Extract payment method from order card.
 */
async function extractPaymentMethod(
  card: import("playwright").Locator,
): Promise<{ type: string; lastFour?: string } | undefined> {
  try {
    const paymentComponent = card
      .locator('[data-component="viewPaymentPlanSummaryWidget"]')
      .first();
    const count = await paymentComponent.count().catch(() => 0);
    if (count === 0) return undefined;

    // Try to get from the React component data
    const methodName = await paymentComponent
      .locator('[data-testid="method-details-name"]')
      .textContent({ timeout: 300 })
      .catch(() => "");
    const lastDigits = await paymentComponent
      .locator('[data-testid="method-details-number"]')
      .textContent({ timeout: 300 })
      .catch(() => "");

    if (methodName) {
      return {
        type: methodName.trim(),
        lastFour: lastDigits?.trim() || undefined,
      };
    }

    // Fallback: parse from text
    const text = await paymentComponent
      .textContent({ timeout: 300 })
      .catch(() => "");
    if (text) {
      // Pattern: "Visa ••••1234" or "Wise Card ••••3858"
      const cardMatch = text.match(/([A-Za-z\s]+?)(?:Card)?\s*[•*]+\s*(\d{4})/);
      if (cardMatch) {
        return {
          type:
            cardMatch[1].trim() +
            (cardMatch[1].toLowerCase().includes("card") ? "" : " Card"),
          lastFour: cardMatch[2],
        };
      }
    }

    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Extract item count from order card.
 * Counts the number of items displayed on the card using container-based strategies.
 * Avoids counting "Buy it again" buttons or duplicate links.
 */
async function extractItemCount(
  card: import("playwright").Locator,
): Promise<number> {
  try {
    // Strategy 1: data-component="purchasedItems" (modern layout 2024+)
    // This is the most reliable - each purchasedItems component = 1 item
    const purchasedItems = card.locator('[data-component="purchasedItems"]');
    const purchasedCount = await purchasedItems.count().catch(() => 0);
    if (purchasedCount > 0) {
      debug(
        `[extractItemCount] Found ${purchasedCount} via data-component="purchasedItems"`,
      );
      return purchasedCount;
    }

    // Strategy 2: Item title components (one per item)
    const itemTitles = card.locator('[data-component="itemTitle"]');
    const titleCount = await itemTitles.count().catch(() => 0);
    if (titleCount > 0) {
      debug(`[extractItemCount] Found ${titleCount} via itemTitle components`);
      return titleCount;
    }

    // Strategy 3: Item image containers (yohtmlc-item class)
    // Each item has its own container with image
    const itemContainers = card.locator(
      ".yohtmlc-item, .a-fixed-left-grid-inner",
    );
    const containerCount = await itemContainers.count().catch(() => 0);
    if (containerCount > 0) {
      debug(`[extractItemCount] Found ${containerCount} via item containers`);
      return containerCount;
    }

    // Strategy 4: Shipment item containers
    const shipmentItems = card.locator(".shipment-item");
    const shipmentCount = await shipmentItems.count().catch(() => 0);
    if (shipmentCount > 0) {
      debug(`[extractItemCount] Found ${shipmentCount} via shipment-item`);
      return shipmentCount;
    }

    // Strategy 5: Product images in the item display area (not in buttons)
    // Look for images that are direct children of item containers, not in action areas
    const productImages = card.locator(
      '.yohtmlc-item img[src*="images-amazon"], .a-fixed-left-grid-col img[src*="images-amazon"]',
    );
    const imgCount = await productImages.count().catch(() => 0);
    if (imgCount > 0) {
      debug(`[extractItemCount] Found ${imgCount} via product images`);
      return imgCount;
    }

    debug(`[extractItemCount] No items found with any strategy`);
    return 0;
  } catch (e) {
    debug(`[extractItemCount] Error: ${e}`);
    return 0;
  }
}

/**
 * Extract Subscribe & Save frequency from order card.
 * Looks for text like "Auto-delivered: Every 1 month"
 */
async function extractSubscribeAndSave(
  _card: import("playwright").Locator,
  allText: string,
): Promise<string | undefined> {
  try {
    // Look for "Auto-delivered: Every X month/week" pattern in card text
    const textMatch = allText.match(/Auto-delivered:\s*([^\n]+)/i);
    if (textMatch) {
      return textMatch[1].trim();
    }

    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Charge summary type for order card extraction.
 */
interface ChargeSummary {
  subtotal?: ReturnType<typeof parseMoney>;
  shipping?: ReturnType<typeof parseMoney>;
  tax?: ReturnType<typeof parseMoney>;
  vat?: ReturnType<typeof parseMoney>;
  promotion?: ReturnType<typeof parseMoney>;
  grandTotal?: ReturnType<typeof parseMoney>;
}

/**
 * Extract charge summary (subtotal, shipping, tax, etc.) from order card.
 */
async function extractChargeSummary(
  card: import("playwright").Locator,
  currency: string,
): Promise<ChargeSummary> {
  const result: ChargeSummary = {};

  try {
    const summaryComponent = card
      .locator('[data-component="chargeSummary"]')
      .first();
    const count = await summaryComponent.count().catch(() => 0);
    if (count === 0) return result;

    // Get all line items
    const lineItems = await summaryComponent.locator(".od-line-item-row").all();

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
      const amount = parseMoney(value || "", currency);

      if (labelLower.includes("subtotal") && !labelLower.includes("before")) {
        result.subtotal = amount;
      } else if (
        labelLower.includes("postage") ||
        labelLower.includes("shipping") ||
        labelLower.includes("packing")
      ) {
        result.shipping = amount;
      } else if (labelLower.includes("vat")) {
        result.vat = amount;
      } else if (labelLower.includes("tax") && !labelLower.includes("before")) {
        result.tax = amount;
      } else if (
        labelLower.includes("promotion") ||
        labelLower.includes("discount")
      ) {
        result.promotion = amount;
      } else if (labelLower.includes("grand total")) {
        result.grandTotal = amount;
      }
    }
  } catch {
    // Ignore errors
  }

  return result;
}

/**
 * Extract order status from card element.
 * First checks .delivery-box__primary-text for specific delivery status,
 * then falls back to text pattern matching.
 */
async function extractOrderStatus(
  card: import("playwright").Locator,
  allText: string,
): Promise<OrderStatus> {
  // Strategy 1: Check .delivery-box__primary-text for specific delivery status
  // This contains statuses like "Arriving today", "Delivered", "Out for delivery", etc.
  try {
    const deliveryBox = card.locator(".delivery-box__primary-text").first();
    const deliveryCount = await deliveryBox.count().catch(() => 0);

    if (deliveryCount > 0) {
      const deliveryText = await deliveryBox
        .textContent({ timeout: 300 })
        .catch(() => "");
      if (deliveryText?.trim()) {
        const status = deliveryText.trim();
        const statusLower = status.toLowerCase();

        // Map delivery box text to status codes
        if (
          statusLower.includes("arriving today") ||
          statusLower.includes("arriving tomorrow")
        ) {
          return { code: "shipped", label: status };
        }
        if (statusLower.includes("arriving")) {
          return { code: "shipped", label: status };
        }
        if (statusLower.includes("out for delivery")) {
          return { code: "shipped", label: status };
        }
        if (statusLower.includes("delivered")) {
          return { code: "delivered", label: status };
        }
        if (
          statusLower.includes("shipped") ||
          statusLower.includes("dispatched")
        ) {
          return { code: "shipped", label: status };
        }
        if (
          statusLower.includes("on the way") ||
          statusLower.includes("in transit")
        ) {
          return { code: "shipped", label: status };
        }

        // If we got text but didn't match, still use it as the label
        debug(`[extractOrderStatus] Unmatched delivery-box text: "${status}"`);
        return { code: "processing", label: status };
      }
    }
  } catch {
    // Fall through to text-based extraction
  }

  // Strategy 2: Text pattern matching (fallback)
  const textLower = allText.toLowerCase();

  // Check for various status indicators
  if (textLower.includes("cancelled") || textLower.includes("canceled")) {
    return { code: "cancelled", label: "Cancelled" };
  }
  if (textLower.includes("refund") && !textLower.includes("refund issued")) {
    return { code: "refunded", label: "Refunded" };
  }
  if (textLower.includes("refund issued") || textLower.includes("refunded")) {
    return { code: "refunded", label: "Refunded" };
  }
  if (textLower.includes("returned")) {
    return { code: "refunded", label: "Returned" };
  }
  if (textLower.includes("delivered")) {
    return { code: "delivered", label: "Delivered" };
  }
  if (
    textLower.includes("shipped") ||
    textLower.includes("on the way") ||
    textLower.includes("out for delivery")
  ) {
    return { code: "shipped", label: "Shipped" };
  }
  if (
    textLower.includes("preparing") ||
    textLower.includes("not yet shipped")
  ) {
    return { code: "processing", label: "Processing" };
  }
  if (textLower.includes("pending")) {
    return { code: "pending", label: "Pending" };
  }

  // Default - assume delivered for past orders
  return { code: "delivered", label: "Delivered" };
}

/**
 * Extract all order headers from the current page.
 */
export async function extractOrderHeaders(
  page: Page,
  region: string,
): Promise<OrderHeader[]> {
  const headers: OrderHeader[] = [];
  const regionConfig = getRegionByCode(region);
  const domain = regionConfig?.domain || "amazon.com";
  const currency = regionConfig?.currency || "USD";

  debug(`[extractOrderHeaders] Finding order cards...`);
  const orderCards = await findOrderCards(page);
  debug(`[extractOrderHeaders] Found ${orderCards.length} order cards`);

  // Process all cards in parallel - fetch text content once per card
  const cardTexts = await Promise.all(
    orderCards.map(async (card, i) => {
      try {
        const text = await card.innerText({ timeout: 1000 });
        return { card, text, index: i };
      } catch (e) {
        debug(`[extractOrderHeaders] Failed to get text for card ${i}: ${e}`);
        return { card, text: "", index: i };
      }
    }),
  );

  debug(`[extractOrderHeaders] Got text for ${cardTexts.length} cards`);

  // Now process each card using the pre-fetched text
  for (const { card, text, index } of cardTexts) {
    if (!text) continue;

    try {
      // Extract order ID from text or card element
      // Supports both standard format (3-7-7) and Amazon Fresh 2025+ hex format (8-4-4-4-12)
      let id = "";

      // Try standard format first
      const stdIdMatch = text.match(/ORDER\s*#?\s*(\d{3}-\d{7}-\d{7})/i);
      if (stdIdMatch) {
        id = stdIdMatch[1];
      }

      // Try Amazon Fresh hex format (UUID style)
      if (!id) {
        const hexIdMatch = text.match(
          /ORDER\s*#?\s*([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i,
        );
        if (hexIdMatch) {
          id = hexIdMatch[1];
        }
      }

      // Fallback to element extraction
      if (!id) {
        id = await extractOrderId(card);
      }

      if (!id) {
        debug(`[extractOrderHeaders] No ID found for card ${index}`);
        continue;
      }

      const date = await extractOrderDate(text);
      const total = extractOrderTotal(text, currency);

      // Build detail URL directly from order ID (much faster than querying DOM)
      const detailUrl = `https://www.${domain}/gp/your-account/order-details?orderID=${id}`;

      // Extract recipient from text (quick fallback)
      const recipientMatch = text.match(
        /(?:Ship to|SHIP TO|Dispatch to|DISPATCH TO)\s*\n?\s*([^\n]+)/i,
      );
      const recipient = recipientMatch ? recipientMatch[1].trim() : undefined;

      // Extract enhanced data from data-component elements
      const [
        status,
        shippingAddress,
        paymentMethod,
        chargeSummary,
        itemCount,
        subscribeAndSave,
      ] = await Promise.all([
        extractOrderStatus(card, text),
        extractShippingAddress(card),
        extractPaymentMethod(card),
        extractChargeSummary(card, currency),
        extractItemCount(card),
        extractSubscribeAndSave(card, text),
      ]);

      headers.push({
        id,
        orderId: id,
        date,
        total,
        detailUrl,
        recipient: shippingAddress?.line1 || recipient,
        status,
        platform: "amazon",
        region,
        // Enhanced fields
        shippingAddress,
        paymentMethod,
        subtotal: chargeSummary.subtotal,
        shipping: chargeSummary.shipping,
        tax: chargeSummary.tax || chargeSummary.vat,
        vat: chargeSummary.vat,
        promotion: chargeSummary.promotion,
        grandTotal: chargeSummary.grandTotal,
        itemCount,
        subscribeAndSave,
      });

      const extras = [
        paymentMethod
          ? `${paymentMethod.type}${paymentMethod.lastFour ? " ****" + paymentMethod.lastFour : ""}`
          : null,
        shippingAddress?.line1 ? `to: ${shippingAddress.line1}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      debug(
        `[extractOrderHeaders] Added order ${id}: ${date?.toISOString()?.split("T")[0]} - ${total.formatted} [${status.label}]${extras ? " (" + extras + ")" : ""}`,
      );
    } catch (error) {
      debug(
        `[extractOrderHeaders] Error extracting order card ${index}: ${error}`,
      );
      continue;
    }
  }

  debug(`[extractOrderHeaders] Returning ${headers.length} headers`);
  return headers;
}

/**
 * Extract order list (alias for extractOrderHeaders for API consistency).
 */
export async function extractOrderList(
  page: Page,
  region: string,
): Promise<OrderHeader[]> {
  return extractOrderHeaders(page, region);
}

/**
 * Check if there are more pages of orders.
 */
export async function hasNextPage(page: Page): Promise<boolean> {
  try {
    const nextButton = page.locator(".a-pagination .a-last:not(.a-disabled)");
    const count = await nextButton.count();
    debug(`[hasNextPage] Found ${count} next buttons`);
    return count > 0;
  } catch (error) {
    debug(`[hasNextPage] Error: ${error}`);
    return false;
  }
}

/**
 * Navigate to the next page of orders.
 */
export async function goToNextPage(page: Page): Promise<boolean> {
  try {
    const nextButton = page.locator(".a-pagination .a-last:not(.a-disabled) a");
    if ((await nextButton.count()) > 0) {
      await nextButton.click();
      await page.waitForLoadState("domcontentloaded");
      // Wait for order cards to appear instead of fixed delay
      await page
        .waitForSelector('.order-card, [class*="order-card"], .a-box-group', {
          timeout: 3000,
        })
        .catch(() => {});
      return true;
    }
    return false;
  } catch (error) {
    debug(`[goToNextPage] Error: ${error}`);
    return false;
  }
}
