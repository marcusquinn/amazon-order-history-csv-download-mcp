/**
 * Item extraction from Amazon order pages.
 * Based on AZAD's proven extraction strategies.
 * @see https://github.com/philipmulcahy/azad
 */

import { Page } from 'playwright';
import { appendFileSync } from 'fs';
import { Item, extractAsinFromUrl } from '../../core/types/item';
import { OrderHeader } from '../../core/types/order';
import { parseMoney } from '../../core/types/money';
import { getRegionByCode } from '../regions';

function debug(msg: string): void {
  const line = `[${new Date().toISOString()}] [items] ${msg}\n`;
  try {
    appendFileSync('/tmp/amazon-mcp-debug.log', line);
  } catch {
    // ignore
  }
  console.error(`[items] ${msg}`);
}

/**
 * Seller information with separate sold by and supplied by fields.
 */
export interface SellerInfo {
  name: string;          // Primary seller name
  id?: string;           // Seller ID if available
  soldBy?: string;       // "Sold by" value
  suppliedBy?: string;   // "Supplied by" / "Fulfilled by" value
}

/**
 * Extract seller information from item container text.
 * Looks for patterns like:
 * - "Sold by: Seller Name"
 * - "Sold by Seller Name"
 * - "Supplied by: Seller Name"
 * - "Supplied by Seller Name"
 * - "Fulfilled by: Amazon"
 * - "Vendu par: Seller Name" (French)
 * - "Verkauf durch: Seller Name" (German)
 * - "Vendido por: Seller Name" (Spanish)
 */
function extractSellerFromText(text: string): SellerInfo | undefined {
  if (!text) return undefined;
  
  // Normalize whitespace
  const normalized = text.replace(/\s+/g, ' ').trim();
  
  let soldBy: string | undefined;
  let suppliedBy: string | undefined;
  
  // "Sold by" patterns (multi-locale)
  const soldByPatterns = [
    /Sold by:?\s*([^|•\n]+?)(?:\s*\||$|\n|Supplied|Fulfilled|and|Dispatched)/i,
    /Vendu par:?\s*([^|•\n]+?)(?:\s*\||$|\n|Expédié)/i,
    /Verkauf durch:?\s*([^|•\n]+?)(?:\s*\||$|\n|Versand)/i,
    /Vendido por:?\s*([^|•\n]+?)(?:\s*\||$|\n|Enviado)/i,
    /Venduto da:?\s*([^|•\n]+?)(?:\s*\||$|\n|Spedito)/i,
  ];
  
  // "Supplied by" / "Fulfilled by" patterns (multi-locale)
  const suppliedByPatterns = [
    /Supplied by:?\s*([^|•\n]+?)(?:\s*\||$|\n|Sold)/i,
    /Fulfilled by:?\s*([^|•\n]+?)(?:\s*\||$|\n|Sold)/i,
    /Dispatched from:?\s*([^|•\n]+?)(?:\s*\||$|\n)/i,
    /Expédié par:?\s*([^|•\n]+?)(?:\s*\||$|\n|Vendu)/i,
    /Versand durch:?\s*([^|•\n]+?)(?:\s*\||$|\n|Verkauf)/i,
    /Enviado por:?\s*([^|•\n]+?)(?:\s*\||$|\n|Vendido)/i,
    /Spedito da:?\s*([^|•\n]+?)(?:\s*\||$|\n|Venduto)/i,
  ];
  
  // Extract "Sold by"
  for (const pattern of soldByPatterns) {
    const match = normalized.match(pattern);
    if (match && match[1]) {
      soldBy = match[1].trim();
      break;
    }
  }
  
  // Extract "Supplied by" / "Fulfilled by"
  for (const pattern of suppliedByPatterns) {
    const match = normalized.match(pattern);
    if (match && match[1]) {
      suppliedBy = match[1].trim();
      break;
    }
  }
  
  // Return if we found either
  if (soldBy || suppliedBy) {
    return {
      name: soldBy || suppliedBy || '',
      soldBy,
      suppliedBy,
    };
  }
  
  return undefined;
}

/**
 * Extract item condition from container text.
 * Looks for patterns like:
 * - "Condition: Used - Very Good"
 * - "Condition: New"
 * - "Used - Acceptable"
 */
function extractConditionFromText(text: string): string | undefined {
  if (!text) return undefined;
  
  const normalized = text.replace(/\s+/g, ' ').trim();
  
  // Explicit "Condition:" pattern
  const conditionMatch = normalized.match(/Condition:?\s*([^|•\n$£€]+?)(?:\s*\||$|\n|\$|£|€)/i);
  if (conditionMatch && conditionMatch[1]) {
    return conditionMatch[1].trim();
  }
  
  // Look for common condition values
  const conditionPatterns = [
    /\b(New)\b/i,
    /\b(Used\s*-\s*Like New)\b/i,
    /\b(Used\s*-\s*Very Good)\b/i,
    /\b(Used\s*-\s*Good)\b/i,
    /\b(Used\s*-\s*Acceptable)\b/i,
    /\b(Refurbished)\b/i,
    /\b(Renewed)\b/i,
    /\b(Collectible\s*-\s*[^|•\n]+)/i,
  ];
  
  for (const pattern of conditionPatterns) {
    const match = normalized.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return undefined;
}

/**
 * Strategy 4 (AZAD): 2024+ physical orders using data-component attributes
 * This is the primary strategy - matches the working invoice extraction logic.
 * 
 * Structure:
 * - [data-component="purchasedItems"] - container for each item
 *   - [data-component="itemTitle"] a - product name + ASIN from href
 *   - [data-component="unitPrice"] .a-offscreen - price (clean text)
 *   - [data-component="itemCondition"] - condition text
 *   - [data-component="orderedMerchant"] a or span - seller name
 *   - [data-component="quantity"] - quantity (often empty)
 *   - [data-component="itemImage"] .od-item-view-qty span - quantity badge (primary location)
 *   - [data-component="deliveryFrequency"] - Subscribe & Save frequency
 */
async function extractItemsStrategy4(page: Page, header: OrderHeader, currency: string): Promise<Item[] | null> {
  // Find item containers using purchasedItems (same as working invoice logic)
  const itemContainers = await page.locator('[data-component="purchasedItems"]').all();
  debug(`Strategy4: Found ${itemContainers.length} purchasedItems containers`);
  
  if (itemContainers.length === 0) {
    // Fallback: try parent div of itemTitle components
    const fallbackContainers = await page.locator('xpath=//div[div[@data-component="itemTitle"]]').all();
    debug(`Strategy4: Fallback found ${fallbackContainers.length} itemTitle parent containers`);
    if (fallbackContainers.length === 0) return null;
  }

  const items: Item[] = [];
  const containers = itemContainers.length > 0 
    ? itemContainers 
    : await page.locator('xpath=//div[div[@data-component="itemTitle"]]').all();

  for (const container of containers) {
    try {
      // Get title from itemTitle component
      const titleLink = container.locator('[data-component="itemTitle"] a').first();
      const titleLinkCount = await titleLink.count().catch(() => 0);
      
      if (titleLinkCount === 0) {
        debug(`Strategy4: Skipping item - no title link`);
        continue;
      }
      
      const name = await titleLink.textContent({ timeout: 300 }).catch(() => '');
      if (!name?.trim()) {
        debug(`Strategy4: Skipping item - no name`);
        continue;
      }
      
      const href = await titleLink.getAttribute('href', { timeout: 300 }).catch(() => '');
      const asin = href ? extractAsinFromUrl(href) : undefined;

      // Get price from unitPrice component (use .a-offscreen for clean text)
      let price = parseMoney('', currency);
      const priceEl = container.locator('[data-component="unitPrice"] .a-offscreen').first();
      const priceCount = await priceEl.count().catch(() => 0);
      if (priceCount > 0) {
        const priceText = await priceEl.textContent({ timeout: 300 }).catch(() => '');
        if (priceText) {
          price = parseMoney(priceText, currency);
        }
      } else {
        // Fallback: try any span in unitPrice
        const priceElem = container.locator('[data-component="unitPrice"] span:not(:has(span))').first();
        const priceText = await priceElem.textContent({ timeout: 300 }).catch(() => '');
        price = parseMoney(priceText || '', currency);
      }

      // Get quantity - check multiple locations (matching invoice logic)
      let quantity = 1;
      
      // Location 1: quantity badge on image (e.g., ".od-item-view-qty span")
      const qtyBadge = container.locator('[data-component="itemImage"] .od-item-view-qty span, .od-item-view-qty span').first();
      const qtyBadgeCount = await qtyBadge.count().catch(() => 0);
      if (qtyBadgeCount > 0) {
        const qtyText = await qtyBadge.textContent({ timeout: 300 }).catch(() => '');
        const qtyMatch = qtyText?.match(/(\d+)/);
        if (qtyMatch) {
          quantity = parseInt(qtyMatch[1], 10);
        }
      }
      
      // Location 2: [data-component="quantity"] (fallback)
      if (quantity === 1) {
        const qtyEl = container.locator('[data-component="quantity"]').first();
        const qtyCount = await qtyEl.count().catch(() => 0);
        if (qtyCount > 0) {
          const qtyText = await qtyEl.textContent({ timeout: 300 }).catch(() => '');
          const qtyMatch = qtyText?.match(/(\d+)/);
          if (qtyMatch) {
            quantity = parseInt(qtyMatch[1], 10);
          }
        }
      }

      // Get condition from itemCondition component
      let condition: string | undefined;
      const conditionEl = container.locator('[data-component="itemCondition"]').first();
      const conditionCount = await conditionEl.count().catch(() => 0);
      if (conditionCount > 0) {
        const conditionText = await conditionEl.textContent({ timeout: 300 }).catch(() => '');
        const conditionMatch = conditionText?.match(/Condition:\s*(.+)/i);
        if (conditionMatch) {
          condition = conditionMatch[1].trim();
        }
      }

      // Get seller - check both link and span (Amazon uses span without link)
      let seller: SellerInfo | undefined;
      const sellerLink = container.locator('[data-component="orderedMerchant"] a').first();
      const sellerLinkCount = await sellerLink.count().catch(() => 0);
      if (sellerLinkCount > 0) {
        const sellerText = await sellerLink.textContent({ timeout: 300 }).catch(() => '');
        if (sellerText?.trim()) {
          seller = { name: sellerText.trim(), soldBy: sellerText.trim() };
        }
      } else {
        // Fallback: check for span with "Sold by:" text
        const sellerSpan = container.locator('[data-component="orderedMerchant"] span').first();
        const sellerSpanCount = await sellerSpan.count().catch(() => 0);
        if (sellerSpanCount > 0) {
          const sellerText = await sellerSpan.textContent({ timeout: 300 }).catch(() => '');
          const sellerMatch = sellerText?.match(/Sold by:\s*(.+)/i);
          if (sellerMatch) {
            seller = { name: sellerMatch[1].trim(), soldBy: sellerMatch[1].trim() };
          }
        }
      }
      
      // Fallback: extract from container text
      if (!seller) {
        const containerText = await container.textContent({ timeout: 300 }).catch(() => '');
        seller = extractSellerFromText(containerText || '');
      }
      
      // Fallback for condition from container text
      if (!condition) {
        const containerText = await container.textContent({ timeout: 300 }).catch(() => '');
        condition = extractConditionFromText(containerText || '');
      }

      // Get Subscribe & Save delivery frequency
      let subscriptionFrequency: string | undefined;
      const freqEl = container.locator('[data-component="deliveryFrequency"]').first();
      const freqCount = await freqEl.count().catch(() => 0);
      if (freqCount > 0) {
        const freqText = await freqEl.textContent({ timeout: 300 }).catch(() => '');
        const freqMatch = freqText?.match(/Auto-delivered:\s*(.+)/i);
        if (freqMatch) {
          subscriptionFrequency = freqMatch[1].trim();
        }
      }

      debug(`Strategy4: Found item: ${asin} - ${name.slice(0, 40)} - ${price.formatted} x${quantity}${seller ? ` - Seller: ${seller.name}` : ''}${condition ? ` - Condition: ${condition}` : ''}${subscriptionFrequency ? ` - Sub: ${subscriptionFrequency}` : ''}`);

      items.push({
        id: asin || name.trim().slice(0, 50),
        asin,
        name: name.trim(),
        quantity,
        unitPrice: price,
        totalPrice: { ...price, amount: price.amount * quantity },
        url: href ? (href.startsWith('http') ? href : `https://www.${getRegionByCode(header.region)?.domain}${href}`) : '',
        orderHeader: header,
        seller,
        condition,
        subscriptionFrequency,
        platformData: {},
      });
    } catch (e) {
      debug(`Strategy4: Error extracting item: ${e}`);
      continue;
    }
  }

  return items.length > 0 ? items : null;
}

/**
 * Strategy 0 (AZAD): Physical orders with fixed-left-grid-inner
 * XPath: .//div[contains(@class, "fixed-left-grid-inner") and .//a[contains(@href, "/gp/product/")] and .//*[contains(@class, "price")]]
 */
async function extractItemsStrategy0(page: Page, header: OrderHeader, currency: string): Promise<Item[] | null> {
  // More specific selector - must have product link AND price
  const itemElements = await page.locator('xpath=//div[contains(@class, "fixed-left-grid-inner") and .//a[contains(@href, "/gp/product/") or contains(@href, "/dp/")] and .//*[contains(@class, "price")]]').all();
  debug(`Strategy0: Found ${itemElements.length} item elements`);
  
  if (itemElements.length === 0) return null;

  const items: Item[] = [];

  for (const elem of itemElements) {
    try {
      // Get product link - specifically NOT an image link
      const linkElem = elem.locator('xpath=.//a[@class="a-link-normal" and (contains(@href, "/gp/product/") or contains(@href, "/dp/")) and not(img)]').first();
      const href = await linkElem.getAttribute('href', { timeout: 300 }).catch(() => '');
      const name = await linkElem.textContent({ timeout: 300 }).catch(() => '');
      
      if (!href || !name?.trim()) {
        debug(`Strategy0: Skipping - no href or name`);
        continue;
      }

      const asin = extractAsinFromUrl(href);

      // Get price
      const priceText = await elem.locator('.//*[contains(@class, "price")]').first().textContent({ timeout: 300 }).catch(() => '');
      const price = parseMoney(priceText || '', currency);

      // Get quantity
      let quantity = 1;
      const qtyText = await elem.locator('.item-view-qty, [class*="quantity"]').first().textContent({ timeout: 300 }).catch(() => '');
      if (qtyText) {
        const match = qtyText.match(/(\d+)/);
        if (match) quantity = parseInt(match[1], 10);
      }

      // Extract seller info and condition
      const containerText = await elem.textContent({ timeout: 300 }).catch(() => '');
      const seller = extractSellerFromText(containerText || '');
      const condition = extractConditionFromText(containerText || '');

      debug(`Strategy0: Found item: ${asin} - ${name.slice(0, 40)} - ${price.formatted}${seller ? ` - Seller: ${seller.name}` : ''}${condition ? ` - ${condition}` : ''}`);

      items.push({
        id: asin || href,
        asin,
        name: name.trim(),
        quantity,
        unitPrice: price,
        totalPrice: { ...price, amount: price.amount * quantity },
        url: href.startsWith('http') ? href : `https://www.${getRegionByCode(header.region)?.domain}${href}`,
        orderHeader: header,
        seller,
        condition,
        platformData: {},
      });
    } catch (e) {
      debug(`Strategy0: Error: ${e}`);
      continue;
    }
  }

  return items.length > 0 ? items : null;
}

/**
 * Strategy 2 (AZAD): Amazon.com 2016 layout
 * XPath: //div[contains(@id, "orderDetails")]//a[contains(@href, "/product/")]/parent::*
 */
async function extractItemsStrategy2(page: Page, header: OrderHeader, currency: string): Promise<Item[] | null> {
  const itemElements = await page.locator('xpath=//div[contains(@id, "orderDetails")]//a[contains(@href, "/product/") or contains(@href, "/dp/")]/parent::*').all();
  debug(`Strategy2: Found ${itemElements.length} item elements`);
  
  if (itemElements.length === 0) return null;

  const items: Item[] = [];

  for (const elem of itemElements) {
    try {
      const link = elem.locator('a[href*="/product/"], a[href*="/dp/"]').first();
      const href = await link.getAttribute('href', { timeout: 300 }).catch(() => '');
      const name = await link.textContent({ timeout: 300 }).catch(() => '');
      
      if (!href || !name?.trim()) continue;

      const asin = extractAsinFromUrl(href);

      // Get quantity from parent text - look for "Qty: N" pattern
      const containerText = await elem.textContent({ timeout: 300 }).catch(() => '');
      let quantity = 1;
      const qtyMatch = containerText?.match(/Qty:\s*(\d+)/i);
      if (qtyMatch) quantity = parseInt(qtyMatch[1], 10);

      // Get price from sibling elements
      const priceMatch = containerText?.match(/[$£€]\s*[\d,]+\.?\d*/);
      const price = parseMoney(priceMatch ? priceMatch[0] : '', currency);

      // Extract seller info and condition
      const seller = extractSellerFromText(containerText || '');
      const condition = extractConditionFromText(containerText || '');

      debug(`Strategy2: Found item: ${asin} - ${name.slice(0, 40)} - ${price.formatted}${seller ? ` - Seller: ${seller.name}` : ''}${condition ? ` - ${condition}` : ''}`);

      items.push({
        id: asin || href,
        asin,
        name: name.trim(),
        quantity,
        unitPrice: price,
        totalPrice: { ...price, amount: price.amount * quantity },
        url: href.startsWith('http') ? href : `https://www.${getRegionByCode(header.region)?.domain}${href}`,
        orderHeader: header,
        seller,
        condition,
        platformData: {},
      });
    } catch (e) {
      debug(`Strategy2: Error: ${e}`);
      continue;
    }
  }

  return items.length > 0 ? items : null;
}

/**
 * Strategy 3 (AZAD): Grocery orders (Amazon Fresh, Whole Foods - 2021+)
 * XPath: //div[contains(@class, "a-section")]//span[contains(@id, "item-total-price")]/parent::div/parent::div/parent::div
 */
async function extractItemsStrategy3(page: Page, header: OrderHeader, currency: string): Promise<Item[] | null> {
  const itemElements = await page.locator('xpath=//div[contains(@class, "a-section")]//span[contains(@id, "item-total-price")]/ancestor::div[3]').all();
  debug(`Strategy3: Found ${itemElements.length} grocery item elements`);
  
  if (itemElements.length === 0) return null;

  const items: Item[] = [];

  for (const elem of itemElements) {
    try {
      // Get product link
      const link = elem.locator('a[href*="/product/"], a.a-link-normal[href*="/gp/"]').first();
      const href = await link.getAttribute('href', { timeout: 300 }).catch(() => '');
      const name = await link.textContent({ timeout: 300 }).catch(() => '');
      
      if (!href || !name?.trim()) continue;

      const asin = extractAsinFromUrl(href);

      // Get quantity from next sibling of link's parent
      let quantity = 1;
      const qtyText = await elem.locator('xpath=.//a/parent::*/following-sibling::*[1]').first().textContent({ timeout: 300 }).catch(() => '');
      if (qtyText) {
        const match = qtyText.match(/(\d+)/);
        if (match) quantity = parseInt(match[1], 10);
      }

      // Get price from item-total-price span
      const priceText = await elem.locator('[id*="item-total-price"]').first().textContent({ timeout: 300 }).catch(() => '');
      const price = parseMoney(priceText || '', currency);

      // Extract seller info and condition from container
      const containerText = await elem.textContent({ timeout: 300 }).catch(() => '');
      const seller = extractSellerFromText(containerText || '');
      const condition = extractConditionFromText(containerText || '');

      debug(`Strategy3: Found grocery item: ${asin} - ${name.slice(0, 40)} - ${price.formatted} x${quantity}${seller ? ` - Seller: ${seller.name}` : ''}`);

      items.push({
        id: asin || href,
        asin,
        name: name.trim(),
        quantity,
        unitPrice: price,
        totalPrice: { ...price, amount: price.amount * quantity },
        url: href.startsWith('http') ? href : `https://www.${getRegionByCode(header.region)?.domain}${href}`,
        orderHeader: header,
        seller,
        condition,
        platformData: { orderType: 'grocery' },
      });
    } catch (e) {
      debug(`Strategy3: Error: ${e}`);
      continue;
    }
  }

  return items.length > 0 ? items : null;
}

/**
 * Strategy 1 (AZAD): Digital orders
 * Finds "Ordered" text and goes up 3 ancestors
 */
async function extractItemsStrategy1(page: Page, header: OrderHeader, currency: string): Promise<Item[] | null> {
  const containers = await page.locator('xpath=//*[contains(text(), "Ordered") or contains(text(), "Commandé")]/ancestor::*[3]').all();
  debug(`Strategy1: Found ${containers.length} digital order containers`);
  
  if (containers.length === 0) return null;

  const items: Item[] = [];

  for (const container of containers) {
    try {
      const link = container.locator('a[href*="/dp/"]').first();
      const href = await link.getAttribute('href', { timeout: 300 }).catch(() => '');
      const name = await link.textContent({ timeout: 300 }).catch(() => '');

      if (!href || !name?.trim()) continue;

      const asin = extractAsinFromUrl(href);
      
      // Try to get price from nearby text
      const containerText = await container.innerText({ timeout: 300 }).catch(() => '');
      const priceMatch = containerText.match(/[$£€]\s*[\d,]+\.?\d*/);
      const price = parseMoney(priceMatch ? priceMatch[0] : '', currency);

      // Extract seller info and condition (digital items often show seller)
      const seller = extractSellerFromText(containerText);
      const condition = extractConditionFromText(containerText);

      debug(`Strategy1: Found digital item: ${asin} - ${name.slice(0, 40)}${seller ? ` - Seller: ${seller.name}` : ''}`);

      items.push({
        id: asin || href,
        asin,
        name: name.trim(),
        quantity: 1,
        unitPrice: price,
        totalPrice: price,
        url: href.startsWith('http') ? href : `https://www.${getRegionByCode(header.region)?.domain}${href}`,
        orderHeader: header,
        seller,
        condition,
        platformData: { orderType: 'digital' },
      });
    } catch (e) {
      debug(`Strategy1: Error: ${e}`);
      continue;
    }
  }

  return items.length > 0 ? items : null;
}

/**
 * Strategy 5 (AZAD): Digital subscriptions (2025)
 * Uses digitalOrderSummaryContainer
 */
async function extractItemsStrategy5(page: Page, header: OrderHeader, currency: string): Promise<Item[] | null> {
  const container = page.locator('#digitalOrderSummaryContainer');
  const isVisible = await container.isVisible().catch(() => false);
  debug(`Strategy5: digitalOrderSummaryContainer visible: ${isVisible}`);
  
  if (!isVisible) return null;

  const items: Item[] = [];
  const links = await container.locator('a[href*="/dp/"]').all();

  for (const link of links) {
    try {
      const href = await link.getAttribute('href', { timeout: 300 }).catch(() => '');
      const name = await link.textContent({ timeout: 300 }).catch(() => '');

      if (!href || !name?.trim()) continue;

      const asin = extractAsinFromUrl(href);

      // Get parent container text for seller info and condition
      const parentText = await link.locator('xpath=ancestor::*[5]').first().textContent({ timeout: 300 }).catch(() => '');
      const seller = extractSellerFromText(parentText || '');
      const condition = extractConditionFromText(parentText || '');

      debug(`Strategy5: Found subscription item: ${asin} - ${name.slice(0, 40)}${seller ? ` - Seller: ${seller.name}` : ''}`);

      items.push({
        id: asin || href,
        asin,
        name: name.trim(),
        quantity: 1,
        unitPrice: parseMoney('', currency),
        totalPrice: parseMoney('', currency),
        url: href.startsWith('http') ? href : `https://www.${getRegionByCode(header.region)?.domain}${href}`,
        orderHeader: header,
        seller,
        condition,
        platformData: { orderType: 'digital_subscription' },
      });
    } catch (e) {
      debug(`Strategy5: Error: ${e}`);
      continue;
    }
  }

  return items.length > 0 ? items : null;
}

/**
 * Extract items using AZAD-style strategies.
 */
export async function extractItems(
  page: Page,
  header: OrderHeader
): Promise<Item[]> {
  const regionConfig = getRegionByCode(header.region);
  const currency = regionConfig?.currency || 'USD';

  debug(`Starting item extraction for order ${header.id}`);

  // Try strategies in priority order (matching AZAD)
  const strategies = [
    { name: 'Strategy4 (2024+ data-component)', fn: () => extractItemsStrategy4(page, header, currency) },
    { name: 'Strategy0 (fixed-left-grid)', fn: () => extractItemsStrategy0(page, header, currency) },
    { name: 'Strategy3 (grocery/fresh)', fn: () => extractItemsStrategy3(page, header, currency) },
    { name: 'Strategy2 (2016 orderDetails)', fn: () => extractItemsStrategy2(page, header, currency) },
    { name: 'Strategy5 (digital subscriptions)', fn: () => extractItemsStrategy5(page, header, currency) },
    { name: 'Strategy1 (digital orders)', fn: () => extractItemsStrategy1(page, header, currency) },
  ];

  for (const strategy of strategies) {
    try {
      debug(`Trying ${strategy.name}...`);
      const result = await Promise.race([
        strategy.fn(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000)) // 1s timeout per strategy
      ]);
      if (result && result.length > 0) {
        debug(`${strategy.name} found ${result.length} items`);
        return result;
      }
      debug(`${strategy.name} returned no items`);
    } catch (e) {
      debug(`${strategy.name} failed: ${e}`);
    }
  }

  debug(`No items found for order ${header.id}`);
  return [];
}
