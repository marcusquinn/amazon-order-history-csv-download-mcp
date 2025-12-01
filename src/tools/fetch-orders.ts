/**
 * Order fetching orchestration.
 * Handles the full flow of navigating pages and extracting order data.
 */

import { Page } from "playwright";
import { AmazonPlugin } from "../amazon/adapter";
import { OrderHeader, Payment } from "../core/types/order";
import { Money } from "../core/types/money";
import { Item } from "../core/types/item";
import { Shipment } from "../core/types/shipment";
import { Transaction } from "../core/types/transaction";
import {
  extractOrderHeaders,
  extractOrderDetails,
  hasNextPage,
  goToNextPage,
} from "../amazon/extractors";
import { extractFromInvoice } from "../amazon/extractors/invoice";
import { getRegionByCode } from "../amazon/regions";

/**
 * Parse invoice address lines into simple line1-line7 structure.
 */
function parseInvoiceAddressLines(lines: string[]): {
  line1?: string;
  line2?: string;
  line3?: string;
  line4?: string;
  line5?: string;
  line6?: string;
  line7?: string;
} {
  if (lines.length === 0) return {};

  // Clean each line and filter empty ones
  const cleaned = lines
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0);

  return {
    line1: cleaned[0],
    line2: cleaned[1],
    line3: cleaned[2],
    line4: cleaned[3],
    line5: cleaned[4],
    line6: cleaned[5],
    line7: cleaned[6],
  };
}

/**
 * Options for fetching orders.
 */
export interface FetchOrdersOptions {
  region: string;
  year?: number;
  startDate?: string;
  endDate?: string;
  includeItems?: boolean;
  includeShipments?: boolean;
  includeTransactions?: boolean;
  /** Visit ship-track pages to get actual carrier tracking numbers (slower, ~2s per shipment) */
  fetchTrackingNumbers?: boolean;
  useInvoice?: boolean;
  maxOrders?: number;
  /** Filter to a specific order ID (for get_amazon_order_details) */
  orderId?: string;
  onProgress?: (message: string, current: number, total: number) => void;
}

/**
 * Enriched order with both header and optional details.
 * The recipient field is kept as string for simplicity.
 */
export interface EnrichedOrder extends OrderHeader {
  shippingRefund?: Money;
  gift?: Money;
  refund?: Money;
  payments?: Payment[];
  invoiceUrl?: string;
  items?: Item[];
  shipments?: Shipment[];
}

/**
 * Result of fetching orders.
 */
export interface FetchOrdersResult {
  orders: EnrichedOrder[];
  items: Item[];
  shipments: Shipment[];
  transactions: Transaction[];
  totalFound: number;
  errors: string[];
}

/**
 * Fetch orders from Amazon.
 */
export async function fetchOrders(
  page: Page,
  plugin: AmazonPlugin,
  options: FetchOrdersOptions,
): Promise<FetchOrdersResult> {
  const {
    region,
    year,
    startDate,
    endDate,
    includeItems = false,
    includeShipments = false,
    includeTransactions = false,
    fetchTrackingNumbers = false,
    useInvoice = true, // Default to invoice extraction (faster)
    maxOrders,
    orderId,
    onProgress,
  } = options;

  const result: FetchOrdersResult = {
    orders: [],
    items: [],
    shipments: [],
    transactions: [],
    totalFound: 0,
    errors: [],
  };

  const regionConfig = getRegionByCode(region);
  if (!regionConfig) {
    result.errors.push(
      `Unknown region: ${region}. Valid regions: us, uk, ca, de, fr, es, it, nl, jp, au, mx, in, ae, sa, ie, be`,
    );
    return result;
  }
  const domain = regionConfig.domain;
  const currency = regionConfig.currency || "USD";
  const currencySymbol =
    currency === "GBP" ? "£" : currency === "EUR" ? "€" : "$";

  try {
    // If specific orderId requested, skip order list and go directly to invoice/detail
    if (orderId) {
      console.error(
        `[fetch-orders] Fetching single order: ${orderId} (region: ${region})`,
      );
      onProgress?.(`Fetching order ${orderId}...`, 0, 1);

      // Create header for this order
      const header: OrderHeader = {
        id: orderId,
        orderId,
        date: null,
        total: { amount: 0, currency, currencySymbol, formatted: "" },
        detailUrl: `https://www.${domain}/gp/your-account/order-details?orderID=${orderId}`,
        platform: "amazon",
        region,
      };

      const enrichedOrder: EnrichedOrder = { ...header };

      // Go to invoice page and extract items directly (inline, with timeouts)
      const invoiceUrl = `https://www.${domain}/gp/css/summary/print.html?orderID=${orderId}`;
      console.error(`[fetch-orders] Navigating to invoice: ${invoiceUrl}`);

      await page.goto(invoiceUrl, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });
      const currentUrl = page.url();
      console.error(`[fetch-orders] Current URL: ${currentUrl}`);

      await page
        .waitForSelector('[data-component="purchasedItems"], table, .a-box', {
          timeout: 3000,
        })
        .catch(() => {});

      // Check for error banners (e.g., "We're unable to load your order details")
      const errorBanner = await page
        .locator(
          '[data-component="errorbanner"], .a-alert-error, .a-alert-info',
        )
        .first();
      const errorBannerCount = await errorBanner.count().catch(() => 0);
      if (errorBannerCount > 0) {
        const errorText = await errorBanner
          .textContent({ timeout: 500 })
          .catch(() => "");
        if (
          errorText?.includes("unable to load") ||
          errorText?.includes("problem loading")
        ) {
          console.error(
            `[fetch-orders] Error detected: ${errorText.slice(0, 200)}`,
          );
          result.errors.push(
            `Order page error: ${errorText.slice(0, 200).trim()}`,
          );
        }
      }

      // Try to extract items - first try data-component, then fall back to extractFromInvoice
      let itemContainers = await page
        .locator('[data-component="purchasedItems"]')
        .all();
      console.error(
        `[fetch-orders] Found ${itemContainers.length} purchasedItems containers on invoice page`,
      );

      // Invoice pages often don't have data-component, try the full invoice extractor
      if (itemContainers.length === 0) {
        console.error(
          `[fetch-orders] No data-component items found, using extractFromInvoice`,
        );
        const invoiceData = await extractFromInvoice(page, header);

        // Copy over invoice data (amounts, recipient, payments) regardless of items
        console.error(
          `[fetch-orders] Invoice data: subtotal=${invoiceData.subtotal?.formatted}, total=${invoiceData.total?.formatted}, vat=${invoiceData.vat?.formatted}, shipping=${invoiceData.shipping?.formatted}`,
        );
        if (invoiceData.subtotal) enrichedOrder.subtotal = invoiceData.subtotal;
        if (invoiceData.total) enrichedOrder.grandTotal = invoiceData.total;
        if (invoiceData.shipping) enrichedOrder.shipping = invoiceData.shipping;
        if (invoiceData.tax) enrichedOrder.tax = invoiceData.tax;
        if (invoiceData.vat) enrichedOrder.vat = invoiceData.vat;
        if (invoiceData.gift) enrichedOrder.promotion = invoiceData.gift;
        if (invoiceData.recipientName) {
          enrichedOrder.recipient = invoiceData.recipientName;
          if (invoiceData.shippingAddress) {
            // Prepend recipient name as line1 if address doesn't start with it
            const addressWithName = [
              invoiceData.recipientName,
              ...invoiceData.shippingAddress,
            ];
            enrichedOrder.shippingAddress =
              parseInvoiceAddressLines(addressWithName);
          }
        }
        if (invoiceData.payments && invoiceData.payments.length > 0) {
          enrichedOrder.payments = invoiceData.payments;
          // Also set paymentMethod from first payment
          const firstPayment = invoiceData.payments[0];
          enrichedOrder.paymentMethod = {
            type: firstPayment.method,
            lastFour: firstPayment.lastFour,
          };
        }

        // Convert invoice items to full Item type if found
        if (invoiceData.items && invoiceData.items.length > 0) {
          // Create enriched header with all order data for items
          const enrichedHeader: OrderHeader = {
            ...header,
            recipient:
              typeof enrichedOrder.recipient === "string"
                ? enrichedOrder.recipient
                : undefined,
            subtotal: enrichedOrder.subtotal,
            shipping: enrichedOrder.shipping,
            tax: enrichedOrder.tax,
            vat: enrichedOrder.vat,
            promotion: enrichedOrder.promotion,
            grandTotal: enrichedOrder.grandTotal,
            shippingAddress: enrichedOrder.shippingAddress,
            paymentMethod: enrichedOrder.paymentMethod,
          };

          const items = invoiceData.items.map((ii) => ({
            id: ii.asin || ii.name.slice(0, 50),
            asin: ii.asin,
            name: ii.name,
            quantity: ii.quantity,
            unitPrice: ii.unitPrice,
            totalPrice: {
              ...ii.unitPrice,
              amount: ii.unitPrice.amount * ii.quantity,
              formatted: `${currencySymbol}${(ii.unitPrice.amount * ii.quantity).toFixed(2)}`,
            },
            url: ii.asin ? `https://www.${domain}/dp/${ii.asin}` : "",
            orderHeader: enrichedHeader,
            condition: ii.condition,
            seller: ii.seller ? { name: ii.seller } : undefined,
            subscriptionFrequency: ii.subscriptionFrequency,
            platformData: { source: "invoice" },
          }));

          console.error(
            `[fetch-orders] extractFromInvoice found ${items.length} items`,
          );
          enrichedOrder.items = items;
          result.items = items;
        }
      }

      // Only use inline extraction if we found data-component containers (detail page)
      // Otherwise extractFromInvoice already handled it above
      if (itemContainers.length > 0) {
        // Create enriched header with all order data for items
        const enrichedHeader: OrderHeader = {
          ...header,
          recipient:
            typeof enrichedOrder.recipient === "string"
              ? enrichedOrder.recipient
              : undefined,
          subtotal: enrichedOrder.subtotal,
          shipping: enrichedOrder.shipping,
          tax: enrichedOrder.tax,
          vat: enrichedOrder.vat,
          promotion: enrichedOrder.promotion,
          grandTotal: enrichedOrder.grandTotal,
          shippingAddress: enrichedOrder.shippingAddress,
          paymentMethod: enrichedOrder.paymentMethod,
        };

        const extractedItems: Item[] = [];
        for (const container of itemContainers) {
          try {
            // Title + ASIN
            const titleLink = container
              .locator('[data-component="itemTitle"] a')
              .first();
            const titleCount = await titleLink.count().catch(() => 0);
            if (titleCount === 0) continue;

            const name = await titleLink
              .textContent({ timeout: 500 })
              .catch(() => "");
            if (!name?.trim()) continue;

            const href = await titleLink
              .getAttribute("href", { timeout: 500 })
              .catch(() => "");
            const asinMatch = href?.match(/\/dp\/([A-Z0-9]+)/i);
            const asin = asinMatch ? asinMatch[1] : undefined;

            // Price
            const priceEl = container
              .locator('[data-component="unitPrice"] .a-offscreen')
              .first();
            const priceText = await priceEl
              .textContent({ timeout: 500 })
              .catch(() => "");
            const priceMatch = priceText?.match(/[£$€]?([\d,.]+)/);
            const priceAmount = priceMatch
              ? parseFloat(priceMatch[1].replace(",", ""))
              : 0;

            // Quantity (check badge first, then quantity component)
            let quantity = 1;
            const qtyBadge = container
              .locator(".od-item-view-qty span")
              .first();
            const qtyBadgeCount = await qtyBadge.count().catch(() => 0);
            if (qtyBadgeCount > 0) {
              const qtyText = await qtyBadge
                .textContent({ timeout: 500 })
                .catch(() => "");
              const qtyMatch = qtyText?.match(/(\d+)/);
              if (qtyMatch) quantity = parseInt(qtyMatch[1], 10);
            }

            // Seller
            let seller: string | undefined;
            const sellerEl = container
              .locator('[data-component="orderedMerchant"]')
              .first();
            const sellerCount = await sellerEl.count().catch(() => 0);
            if (sellerCount > 0) {
              const sellerText = await sellerEl
                .textContent({ timeout: 500 })
                .catch(() => "");
              const sellerMatch = sellerText?.match(/Sold by:\s*(.+)/i);
              if (sellerMatch) seller = sellerMatch[1].trim();
            }

            // Condition
            let condition: string | undefined;
            const condEl = container
              .locator('[data-component="itemCondition"]')
              .first();
            const condCount = await condEl.count().catch(() => 0);
            if (condCount > 0) {
              const condText = await condEl
                .textContent({ timeout: 500 })
                .catch(() => "");
              const condMatch = condText?.match(/Condition:\s*(.+)/i);
              if (condMatch) condition = condMatch[1].trim();
            }

            // Subscription frequency
            let subscriptionFrequency: string | undefined;
            const freqEl = container
              .locator('[data-component="deliveryFrequency"]')
              .first();
            const freqCount = await freqEl.count().catch(() => 0);
            if (freqCount > 0) {
              const freqText = await freqEl
                .textContent({ timeout: 500 })
                .catch(() => "");
              const freqMatch = freqText?.match(/Auto-delivered:\s*(.+)/i);
              if (freqMatch) subscriptionFrequency = freqMatch[1].trim();
            }

            extractedItems.push({
              id: asin || name.trim().slice(0, 50),
              asin,
              name: name.trim(),
              quantity,
              unitPrice: {
                amount: priceAmount,
                currency,
                currencySymbol,
                formatted: `${currencySymbol}${priceAmount.toFixed(2)}`,
              },
              totalPrice: {
                amount: priceAmount * quantity,
                currency,
                currencySymbol,
                formatted: `${currencySymbol}${(priceAmount * quantity).toFixed(2)}`,
              },
              url: asin ? `https://www.${domain}/dp/${asin}` : "",
              orderHeader: enrichedHeader,
              condition,
              seller: seller ? { name: seller } : undefined,
              subscriptionFrequency,
              platformData: { source: "invoice" },
            });
          } catch {
            continue;
          }
        }

        console.error(
          `[fetch-orders] Extracted ${extractedItems.length} items from data-component`,
        );

        // Store items
        if (extractedItems.length > 0) {
          enrichedOrder.items = extractedItems;
          result.items = extractedItems;
        }
      }

      // If no items found from invoice, try the detail page
      if (result.items.length === 0 && result.errors.length === 0) {
        console.error(
          `[fetch-orders] No items from invoice, trying detail page extraction`,
        );
        await page.goto(header.detailUrl, {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        });
        await page
          .waitForSelector('[data-component="purchasedItems"], .a-box', {
            timeout: 2000,
          })
          .catch(() => {});

        // Check for error banners on detail page
        const detailErrorBanner = await page
          .locator(
            '[data-component="errorbanner"], .a-alert-error, .a-alert-info',
          )
          .first();
        const detailErrorCount = await detailErrorBanner.count().catch(() => 0);
        if (detailErrorCount > 0) {
          const errorText = await detailErrorBanner
            .textContent({ timeout: 500 })
            .catch(() => "");
          if (
            errorText?.includes("unable to load") ||
            errorText?.includes("problem loading")
          ) {
            console.error(
              `[fetch-orders] Detail page error: ${errorText.slice(0, 200)}`,
            );
            result.errors.push(
              `Order detail error: ${errorText.slice(0, 200).trim()}`,
            );
          }
        }

        if (result.errors.length === 0) {
          const items = await plugin.extractItems(page, header).catch(() => []);
          if (items.length > 0) {
            console.error(
              `[fetch-orders] Found ${items.length} items from detail page`,
            );
            enrichedOrder.items = items;
            result.items = items;
          }
        }
      }

      // Get shipments from detail page if requested
      if (includeShipments) {
        console.error(`[fetch-orders] Fetching shipments from detail page`);
        // Only navigate if not already there
        if (!page.url().includes("order-details")) {
          await page.goto(header.detailUrl, {
            waitUntil: "domcontentloaded",
            timeout: 15000,
          });
          await page
            .waitForSelector('[data-component="shipments"], .a-box', {
              timeout: 2000,
            })
            .catch(() => {});
        }

        const shipments = await plugin
          .extractShipments(page, header, fetchTrackingNumbers)
          .catch(() => []);
        enrichedOrder.shipments = shipments;
        result.shipments = shipments;
        console.error(`[fetch-orders] Found ${shipments.length} shipments`);
      }

      // Get transactions if requested
      if (includeTransactions) {
        const transactions = await plugin
          .extractTransactions(page, header)
          .catch(() => []);
        result.transactions = transactions;
        console.error(
          `[fetch-orders] Found ${transactions.length} transactions`,
        );
      }

      result.orders = [enrichedOrder];
      result.totalFound = 1;

      return result;
    }

    // Build order list URL (for multi-order fetch)
    const listUrl = plugin.getOrderListUrl(region, {
      year,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    // Navigate to order list
    console.error(`[fetch-orders] Navigating to: ${listUrl}`);
    onProgress?.("Navigating to order history...", 0, 0);
    await page.goto(listUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    // Wait for order cards to appear (more reliable than fixed timeout)
    await page
      .waitForSelector('.order-card, [class*="order-card"], .a-box-group', {
        timeout: 3000,
      })
      .catch(() => {});
    console.error(`[fetch-orders] Page loaded, URL: ${page.url()}`);

    // Check authentication
    console.error(`[fetch-orders] Checking auth...`);
    const authStatus = await plugin.checkAuthStatus(page, region);
    console.error(`[fetch-orders] Auth result: ${JSON.stringify(authStatus)}`);
    if (!authStatus.authenticated) {
      result.errors.push(`Not authenticated: ${authStatus.message}`);
      return result;
    }

    // Extract orders from all pages
    let pageNum = 1;
    let hasMore = true;

    while (hasMore) {
      console.error(`[fetch-orders] Extracting page ${pageNum}...`);
      onProgress?.(
        `Extracting orders from page ${pageNum}...`,
        result.orders.length,
        0,
      );

      // Extract order headers from current page
      const pageHeaders = await extractOrderHeaders(page, region);
      console.error(
        `[fetch-orders] Found ${pageHeaders.length} orders on page ${pageNum}`,
      );
      // Cast to the enriched type for result storage
      result.orders.push(...(pageHeaders as EnrichedOrder[]));
      onProgress?.(
        `Found ${result.orders.length} orders (page ${pageNum})...`,
        result.orders.length,
        0,
      );

      // Check if we've hit the max
      if (maxOrders && result.orders.length >= maxOrders) {
        result.orders = result.orders.slice(0, maxOrders);
        break;
      }

      // Check for next page
      hasMore = await hasNextPage(page);
      console.error(`[fetch-orders] Has next page: ${hasMore}`);
      if (hasMore && result.orders.length < (maxOrders || 1000)) {
        const navigated = await goToNextPage(page);
        console.error(`[fetch-orders] Navigated to next: ${navigated}`);
        if (!navigated) break;
        pageNum++;
      } else {
        hasMore = false;
      }
    }

    result.totalFound = result.orders.length;
    const extractionMode = useInvoice ? "invoice" : "detail";
    onProgress?.(
      `Found ${result.totalFound} orders, starting ${extractionMode} extraction...`,
      0,
      result.totalFound,
    );

    // If detailed extraction requested, visit each order
    if (includeItems || includeShipments || includeTransactions) {
      const startTime = Date.now();
      let processedCount = 0;

      for (let i = 0; i < result.orders.length; i++) {
        const order = result.orders[i];

        // Calculate ETA based on average time per order
        const elapsed = Date.now() - startTime;
        const avgTimePerOrder =
          processedCount > 0
            ? elapsed / processedCount
            : useInvoice
              ? 1500
              : 3000;
        const remaining = result.orders.length - i;
        const etaSeconds = Math.round((avgTimePerOrder * remaining) / 1000);
        const etaStr =
          etaSeconds > 60
            ? `~${Math.round(etaSeconds / 60)}m ${etaSeconds % 60}s`
            : `~${etaSeconds}s`;

        console.error(
          `[fetch-orders] Processing order ${i + 1}/${result.orders.length}: ${order.id} (${extractionMode} mode)`,
        );
        onProgress?.(
          `Order ${i + 1}/${result.orders.length} (${order.id}) - ETA: ${etaStr}`,
          i + 1,
          result.orders.length,
        );

        // Skip cancelled orders - they have no useful detail to extract
        const orderStatus = order.status?.label?.toLowerCase() || "";
        if (orderStatus === "cancelled") {
          console.error(`[fetch-orders] Skipping cancelled order ${order.id}`);
          order.items = [];
          processedCount++;
          continue;
        }

        // Create header for extraction functions
        let recipientStr: string | undefined;
        if (typeof order.recipient === "string") {
          recipientStr = order.recipient;
        } else if (
          order.recipient &&
          typeof order.recipient === "object" &&
          "name" in order.recipient
        ) {
          recipientStr = (order.recipient as { name: string }).name;
        }

        const header: OrderHeader = {
          id: order.id,
          orderId: order.orderId,
          date: order.date,
          total: order.total,
          detailUrl: order.detailUrl,
          recipient: recipientStr,
          platform: order.platform,
          region: order.region,
        };

        try {
          if (useInvoice) {
            // Invoice-based extraction (faster, cleaner HTML)
            console.error(
              `[fetch-orders] Using invoice extraction for ${order.id}`,
            );
            onProgress?.(
              `Order ${i + 1}/${result.orders.length} - Loading invoice...`,
              i,
              result.orders.length,
            );
            const invoiceData = await extractFromInvoice(page, header);

            // Merge all invoice data into order (amounts, recipient, payments)
            if (invoiceData.subtotal) order.subtotal = invoiceData.subtotal;
            if (invoiceData.shipping) order.shipping = invoiceData.shipping;
            if (invoiceData.tax) order.tax = invoiceData.tax;
            if (invoiceData.vat) order.vat = invoiceData.vat;
            if (invoiceData.total) order.grandTotal = invoiceData.total;
            if (invoiceData.gift) order.promotion = invoiceData.gift;
            if (invoiceData.payments && invoiceData.payments.length > 0) {
              order.payments = invoiceData.payments;
              // Also set paymentMethod from first payment
              const firstPayment = invoiceData.payments[0];
              order.paymentMethod = {
                type: firstPayment.method,
                lastFour: firstPayment.lastFour,
              };
            }
            if (invoiceData.recipientName) {
              order.recipient = invoiceData.recipientName;
              if (invoiceData.shippingAddress) {
                // Prepend recipient name as line1 if address doesn't start with it
                const addressWithName = [
                  invoiceData.recipientName,
                  ...invoiceData.shippingAddress,
                ];
                order.shippingAddress =
                  parseInvoiceAddressLines(addressWithName);
              }
            }

            // Extract items from invoice if requested
            if (includeItems) {
              // Create enriched header with all order data for items
              // This includes shippingAddress, status, etc. that were merged above
              const enrichedHeader: OrderHeader = {
                id: order.id,
                orderId: order.orderId,
                date: order.date,
                total: order.total,
                detailUrl: order.detailUrl,
                recipient: recipientStr,
                status: order.status,
                platform: order.platform,
                region: order.region,
                subtotal: order.subtotal,
                shipping: order.shipping,
                tax: order.tax,
                vat: order.vat,
                promotion: order.promotion,
                grandTotal: order.grandTotal,
                shippingAddress: order.shippingAddress,
                paymentMethod: order.paymentMethod,
                subscribeAndSave: order.subscribeAndSave,
              };

              // Check if invoice has items and matches expected count from order list
              const expectedItemCount = order.itemCount || 0;
              const invoiceItemCount = invoiceData.items?.length || 0;

              if (
                invoiceData.items &&
                invoiceItemCount > 0 &&
                (expectedItemCount === 0 ||
                  invoiceItemCount >= expectedItemCount)
              ) {
                // Invoice has items and count looks correct - use invoice data
                const items = invoiceData.items.map((ii) => ({
                  id: ii.asin || ii.name.slice(0, 50),
                  asin: ii.asin,
                  name: ii.name,
                  quantity: ii.quantity,
                  unitPrice: ii.unitPrice,
                  totalPrice: {
                    ...ii.unitPrice,
                    amount: ii.unitPrice.amount * ii.quantity,
                  },
                  url: ii.asin
                    ? `https://www.${regionConfig.domain}/dp/${ii.asin}`
                    : "",
                  orderHeader: enrichedHeader,
                  condition: ii.condition,
                  seller: ii.seller ? { name: ii.seller } : undefined,
                  subscriptionFrequency: ii.subscriptionFrequency,
                  platformData: { source: "invoice" },
                }));
                console.error(
                  `[fetch-orders] Found ${items.length} items from invoice (expected ${expectedItemCount})`,
                );
                result.items.push(...items);
                order.items = items;
              } else {
                // Fallback to detail page if:
                // - Invoice extraction found no items, OR
                // - Invoice item count doesn't match expected count from order list
                console.error(
                  `[fetch-orders] Invoice has ${invoiceItemCount} items but expected ${expectedItemCount}, falling back to detail page`,
                );
                await page.goto(order.detailUrl, {
                  waitUntil: "domcontentloaded",
                  timeout: 15000,
                });
                await page
                  .waitForSelector('.a-box, [data-component="orderDetails"]', {
                    timeout: 1000,
                  })
                  .catch(() => {});
                const items = await plugin
                  .extractItems(page, enrichedHeader)
                  .catch(() => []);
                console.error(
                  `[fetch-orders] Found ${items.length} items from detail page`,
                );
                result.items.push(...items);
                order.items = items;
              }
            }

            // Shipments need detail page (not on invoice)
            if (includeShipments) {
              console.error(
                `[fetch-orders] Fetching shipments from detail page`,
              );
              onProgress?.(
                `Order ${i + 1}/${result.orders.length} - Fetching shipments...`,
                i,
                result.orders.length,
              );
              await page.goto(order.detailUrl, {
                waitUntil: "domcontentloaded",
                timeout: 15000,
              });
              await page
                .waitForSelector(
                  '[data-component="shipments"], .shipment-is-delivered, .a-box',
                  { timeout: 1000 },
                )
                .catch(() => {});
              const shipments = await plugin
                .extractShipments(page, header, fetchTrackingNumbers)
                .catch(() => []);
              result.shipments.push(...shipments);
              order.shipments = shipments;
            }

            // Transactions from detail page
            if (includeTransactions) {
              if (!includeShipments) {
                await page.goto(order.detailUrl, {
                  waitUntil: "domcontentloaded",
                  timeout: 15000,
                });
              }
              const transactions = await plugin
                .extractTransactions(page, header)
                .catch(() => []);
              result.transactions.push(...transactions);
            }

            processedCount++;
          } else {
            // Detail page extraction (original method)
            console.error(`[fetch-orders] Navigating to: ${order.detailUrl}`);
            onProgress?.(
              `Order ${i + 1}/${result.orders.length} - Loading details...`,
              i,
              result.orders.length,
            );
            await page.goto(order.detailUrl, {
              waitUntil: "domcontentloaded",
              timeout: 30000,
            });
            await page
              .waitForSelector(
                '#od-subtotals, [data-component="orderDetails"], .order-details, .a-box',
                { timeout: 1500 },
              )
              .catch(() => {});
            console.error(`[fetch-orders] Page loaded for order ${order.id}`);

            // Run extractions in parallel for speed
            const extractionPromises: Promise<void>[] = [];

            // Order details extraction
            extractionPromises.push(
              extractOrderDetails(page, region)
                .then((details) => {
                  Object.assign(order, details);
                  console.error(`[fetch-orders] Order details extracted`);
                })
                .catch(() => {}),
            );

            // Items extraction
            if (includeItems) {
              extractionPromises.push(
                plugin
                  .extractItems(page, header)
                  .then((items) => {
                    console.error(`[fetch-orders] Found ${items.length} items`);
                    result.items.push(...items);
                    order.items = items;
                  })
                  .catch(() => {
                    order.items = [];
                  }),
              );
            }

            // Shipments extraction
            if (includeShipments) {
              extractionPromises.push(
                plugin
                  .extractShipments(page, header, fetchTrackingNumbers)
                  .then((shipments) => {
                    result.shipments.push(...shipments);
                    order.shipments = shipments;
                  })
                  .catch(() => {}),
              );
            }

            // Transactions extraction
            if (includeTransactions) {
              extractionPromises.push(
                plugin
                  .extractTransactions(page, header)
                  .then((transactions) => {
                    result.transactions.push(...transactions);
                  })
                  .catch(() => {}),
              );
            }

            // Wait for all extractions to complete
            await Promise.all(extractionPromises);
            processedCount++;
          }
        } catch (error) {
          result.errors.push(`Error extracting order ${order.id}: ${error}`);
          processedCount++;
        }
      }
    }

    onProgress?.(
      `Complete! ${result.orders.length} orders, ${result.items.length} items`,
      result.orders.length,
      result.orders.length,
    );
    return result;
  } catch (error) {
    result.errors.push(`Fetch error: ${error}`);
    return result;
  }
}

// NOTE: fetchOrderDetails has been removed - use fetchOrders with orderId option instead.
// This ensures all order fetching uses the same proven logic.
