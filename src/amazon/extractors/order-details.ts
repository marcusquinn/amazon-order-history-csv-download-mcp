/**
 * Order detail page extraction.
 * Extracts detailed order information including totals, taxes, shipping, and payments.
 * Based on AZAD's proven extraction patterns.
 * @see https://github.com/philipmulcahy/azad
 */

import { Page } from 'playwright';
import { OrderDetails, OrderHeader, Payment } from '../../core/types/order';
import { Money, parseMoney } from '../../core/types/money';
import { parseDate } from '../../core/utils/date';
import { getTextByXPaths } from '../../core/utils/extraction';
import { getRegionByCode } from '../regions';

/**
 * Extract Grand Total using AZAD's comprehensive XPath patterns.
 * Supports multiple currencies and label formats across regions.
 */
async function extractGrandTotal(page: Page, currency: string): Promise<Money> {
  const currencies = ['$', '£', '€', 'AUD', 'CAD', 'GBP', 'USD'];
  const titles = [
    'Grand total',
    'Grand Total',
    'Total general',
    'Total for this order',
    'Total of this order',
    'Total de este pedido',
    'Total del pedido',
    'Montant total TTC',
    'Total général du paiement',
  ];

  // AZAD's comprehensive Grand Total XPaths
  const xpaths = [
    // Colored price text
    '//span[@class="a-color-price a-text-bold"]/text()',
    
    // "Total for this Order" format
    '//b[contains(text(),"Total for this Order")]/text()',
    
    // Grand total amount span
    '//span[contains(@id,"grand-total-amount")]/text()',
    
    // od-subtotals with Grand Total / Montant total TTC / Total général
    `//div[contains(@id,"od-subtotals")]//*[${titles.map(t => `.//text()[contains(.,"${t}")]`).join(' or ')}]/parent::div/following-sibling::div/span`,
    
    // Grand Total with currency symbols
    `//span[contains(text(),"Grand Total:")]/parent::*/parent::*/parent::*/div/span[${currencies.map(ccy => `contains(text(), "${ccy}")`).join(' or ')}]/parent::*/parent::*`,
    
    // Alternative Grand Total structure
    `//span[contains(text(),"Grand Total:")]/parent::*/parent::*/div/span[${currencies.map(ccy => `contains(text(), "${ccy}")`).join(' or ')}]/parent::*/parent::*`,
    
    // Generic Total match
    `//*[${titles.map(t => `contains(text(), "${t}")`).join(' or ')}]`,
  ];

  const totalText = await getTextByXPaths(page, xpaths, '');
  
  // Clean up the extracted value
  if (totalText) {
    // Remove label prefix if present
    const cleaned = totalText
      .replace(/^.*:/, '')  // Remove everything before colon
      .replace(/[\n\t ]/g, '')  // Remove whitespace
      .replace('-', '');  // Remove negative sign
    
    return parseMoney(cleaned, currency);
  }

  return parseMoney('', currency);
}

/**
 * Extract shipping/postage cost.
 */
async function extractShipping(page: Page, currency: string): Promise<Money> {
  const shippingText = await getTextByXPaths(page, [
    '//div[contains(@id,"od-subtotals")]//span[contains(text(),"Shipping") or contains(text(),"Postage") or contains(text(),"Livraison") or contains(text(),"Delivery") or contains(text(),"Costi di spedizione")]/../following-sibling::div/span',
    '//span[contains(text(),"Shipping")]/../following-sibling::span',
  ], '');

  return parseMoney(shippingText, currency);
}

/**
 * Extract shipping refund (FREE shipping credit).
 */
async function extractShippingRefund(page: Page, currency: string): Promise<Money | undefined> {
  const refundText = await getTextByXPaths(page, [
    '//div[contains(@id,"od-subtotals")]//span[contains(text(),"FREE Shipping")]/../following-sibling::div/span',
  ], '');

  if (!refundText) return undefined;
  return parseMoney(refundText, currency);
}

/**
 * Extract tax based on region using AZAD's comprehensive XPaths.
 * Supports VAT (UK/EU), US Tax, GST/HST (CA/AU), PST/QST/RST (CA).
 */
async function extractTax(page: Page, currency: string, region: string): Promise<Money> {
  const regionConfig = getRegionByCode(region);
  const taxFields = regionConfig?.taxFields || ['tax'];

  // AZAD's VAT words and extended variants
  const vatWords = ['VAT', 'tax', 'TVA', 'IVA'];
  const vatWordsExtended = [
    ...vatWords.map(w => `Estimated ${w}`),
    ...vatWords,
  ];

  // Build XPath queries based on region's tax fields
  const xpaths: string[] = [];

  if (taxFields.includes('vat')) {
    // AZAD's VAT extraction patterns
    xpaths.push(
      // Standard od-subtotals VAT extraction (excluding "before" and "esclusa")
      ...vatWordsExtended.map(label =>
        `//div[contains(@id,"od-subtotals")]//span[contains(text(),"${label}") and not(contains(text(),"before") or contains(text(),"Before") or contains(text(),"esclusa"))]/parent::div/following-sibling::div/span`
      ),
      // Payment summary preview
      '//div[contains(@class,"a-row pmts-summary-preview-single-item-amount")]//span[contains(text(),"VAT")]/parent::div/following-sibling::div/span',
      // Digital order summary
      '//div[@id="digitalOrderSummaryContainer"]//*[text()[contains(.,"VAT: ")]]',
      '//div[contains(@class, "orderSummary")]//*[text()[contains(.,"VAT: ")]]',
    );
  }

  if (taxFields.includes('tax')) {
    // AZAD's US Tax patterns
    xpaths.push(
      '//div[text() = "Tax Collected:"]/following-sibling::div/text()',
      '//span[.//text()[contains(.,"Estimated tax to be collected:")]]/../../../div[2]/span/text()',
      '//span[contains(@id, "totalTax-amount")]/text()',
      './/tr[contains(td,"Tax Collected:")]',
    );
  }

  if (taxFields.includes('gst')) {
    // AZAD's Canadian GST/HST patterns
    xpaths.push(
      // GST with "not Before" exclusion
      '//div[contains(@id,"od-subtotals")]//span[contains(text(),"GST") and not(contains(.,"Before"))]/ancestor::div[position()=1]/following-sibling::div/span',
      '//div[contains(@id,"od-subtotals")]//span[contains(text(),"HST") and not(contains(.,"Before"))]/ancestor::div[position()=1]/following-sibling::div/span',
      '//*[text()[contains(.,"GST") and not(contains(.,"Before"))]]',
      '//div[contains(@class,"a-row pmts-summary-preview-single-item-amount")]//span[contains(text(),"GST")]/parent::div/following-sibling::div/span',
    );
  }

  if (taxFields.includes('pst')) {
    // AZAD's Canadian PST/QST/RST patterns
    xpaths.push(
      '//div[contains(@id,"od-subtotals")]//span[contains(text(),"PST") and not(contains(.,"Before"))]/ancestor::div[position()=1]/following-sibling::div/span',
      '//div[contains(@id,"od-subtotals")]//span[contains(text(),"QST") and not(contains(.,"Before"))]/ancestor::div[position()=1]/following-sibling::div/span',
      '//div[contains(@id,"od-subtotals")]//span[contains(text(),"RST") and not(contains(.,"Before"))]/ancestor::div[position()=1]/following-sibling::div/span',
      '//*[text()[contains(.,"PST") and not(contains(.,"Before"))]]',
      '//div[contains(@class,"a-row pmts-summary-preview-single-item-amount")]//span[contains(text(),"PST")]/parent::div/following-sibling::div/span',
    );
  }

  // Default tax queries using starts-with pattern like AZAD
  xpaths.push(
    ...vatWordsExtended.map(label =>
      `//div[contains(@id, "od-subtotals")]//span[.//text()[starts-with(., "${label}")]]/parent::div/following-sibling::div/span`
    ),
  );

  const taxText = await getTextByXPaths(page, xpaths, '');
  
  // Handle "VAT: £10.00" format (AZAD's extraction pattern)
  let cleaned = taxText;
  const vatMatch = taxText.match(/VAT:\s*([$£€]?[\d,]+\.?\d*)/i);
  if (vatMatch) {
    cleaned = vatMatch[1];
  } else {
    // Generic tax label pattern
    const match = taxText.match(/(?:VAT|Tax|GST|PST|HST|QST|RST|IVA|TVA)[:\s]*([$£€]?[\d,]+\.?\d*)/i);
    if (match) {
      cleaned = match[1];
    }
  }

  return parseMoney(cleaned, currency);
}

/**
 * Extract gift card/certificate amount.
 */
async function extractGiftAmount(page: Page, currency: string): Promise<Money | undefined> {
  const giftText = await getTextByXPaths(page, [
    '//div[contains(@id,"od-subtotals")]//span[contains(text(),"Gift") and not(contains(text(),"wrap"))]/../following-sibling::div/span',
    '//span[contains(@id, "giftCardAmount-amount")]',
    '//span[contains(text(),"Gift Certificate")]',
    '//span[contains(text(),"Gift Card") and not(contains(text(),"Gift Cards"))]',
  ], '');

  if (!giftText) return undefined;

  // Extract amount from various formats
  const match = giftText.match(/Gift (?:Certificate|Card) Amount:\s*-?([\d£$€.,]+)/i);
  const cleaned = match ? match[1] : giftText.replace('-', '');

  return parseMoney(cleaned, currency);
}

/**
 * Extract refund amount.
 */
async function extractRefund(page: Page, currency: string): Promise<Money | undefined> {
  const refundText = await getTextByXPaths(page, [
    '//div[contains(@id,"od-subtotals")]//span[contains(text(),"Refund") or contains(text(),"Totale rimborso")]/../following-sibling::div/span',
  ], '');

  if (!refundText) return undefined;
  return parseMoney(refundText, currency);
}

/**
 * Extract Subscribe & Save discount.
 */
async function extractSubscribeAndSave(page: Page, currency: string): Promise<Money | undefined> {
  const snsText = await getTextByXPaths(page, [
    '//span[contains(text(), "Subscribe & Save:")]/../following-sibling::div/span',
    '//span[contains(text(), "Subscribe and Save")]/../following-sibling::div/span',
  ], '');

  if (!snsText) return undefined;
  return parseMoney(snsText, currency);
}

/**
 * Extract recipient name using AZAD's comprehensive patterns.
 * Enhanced with data-component selectors for 2024+ layouts.
 */
async function extractRecipientName(page: Page): Promise<string> {
  // First try data-component selectors (2024+ layouts)
  const dataComponentSelectors = [
    '[data-component="shippingAddress"] .displayAddressFullName',
    '[data-component="shippingAddress"] ul li:first-child',
    '[data-component="deliveryAddress"] .displayAddressFullName',
    '[data-component="deliveryAddress"] ul li:first-child',
  ];
  
  for (const selector of dataComponentSelectors) {
    const elem = page.locator(selector).first();
    const count = await elem.count().catch(() => 0);
    if (count > 0) {
      const text = await elem.textContent({ timeout: 300 }).catch(() => '');
      if (text?.trim()) {
        return text.trim();
      }
    }
  }
  
  // Fallback to XPath patterns (AZAD compatibility)
  const recipientText = await getTextByXPaths(page, [
    // 2025 Physical orders (AZAD's primary)
    './/*[contains(@class,"displayAddressFullName")]',
    
    // .com physical orders 2025 (AZAD's data-component)
    './/div[@data-component="shippingAddress"]/ul/li[1]',
    
    // US Digital orders (AZAD's table sample pattern)
    './/table[contains(@class,"sample")]/tbody/tr/td/div/text()[2]',
    
    // Recipient trigger text
    './/div[contains(@class,"recipient")]//span[@class="trigger-text"]',
    
    // Recipient div with text
    './/div[contains(text(),"Recipient")]',
    
    // Address full name in list
    './/li[contains(@class,"displayAddressFullName")]/text()',
    
    // Ship to section
    '//div[contains(@class,"ship-to")]//span[@class="a-text-bold"]',
    
    // Delivery address section
    '//div[contains(@class,"delivery-address")]//span[1]',
  ], '');

  return recipientText.trim();
}

/**
 * Extract payment information using AZAD's comprehensive patterns.
 */
async function extractPayments(page: Page): Promise<Payment[]> {
  const payments: Payment[] = [];

  // Strategy 1 (AZAD): Credit Card transactions table
  const creditCardRows = await page.locator('xpath=//b[contains(text(),"Credit Card transactions") or contains(text(),"Transactions de carte de crédit")]/../../..//td[contains(text(),":")]/..').all();
  
  for (const row of creditCardRows) {
    const text = await row.textContent().catch(() => '');
    if (text) {
      const cleaned = text
        .replace(/[\n\r]/g, ' ')
        .replace(/  */g, ' ')
        .trim();
      
      // Parse card info
      const cardMatch = cleaned.match(/(Visa|Mastercard|Amex|American Express|Discover).*?(\d{4})/i);
      
      if (cardMatch) {
        payments.push({
          method: cardMatch[1],
          lastFour: cardMatch[2],
        });
      }
    }
  }

  // Strategy 2 (AZAD): New style payment method
  if (payments.length === 0) {
    const paymentMethodText = await getTextByXPaths(page, [
      '//*[contains(text(), "Payment Method")]/../self::*',
    ], '');

    if (paymentMethodText) {
      // Extract card name from "Payment Method: Visa |"
      const cardNameMatch = paymentMethodText.match(/Payment Method:\s*([A-Za-z0-9 /]*)\s*\|/);
      const lastDigitsMatch = paymentMethodText.match(/Last digits:\s*(\d+)/i);

      if (cardNameMatch) {
        payments.push({
          method: cardNameMatch[1].trim(),
          lastFour: lastDigitsMatch ? lastDigitsMatch[1] : undefined,
        });
      }
    }
  }

  // Strategy 3 (AZAD): Payment plan widget (2024+)
  if (payments.length === 0) {
    const paymentBoxes = await page.locator('xpath=//*[@data-component="viewPaymentPlanSummaryWidget"]//*[contains(@class, "pmts-payments-instrument-detail-box")]').all();
    
    for (const box of paymentBoxes) {
      // Get text content - Playwright's textContent already handles most cases
      const text = await box.textContent().catch(() => '');
      const cleanedText = (text || '').replace(/\s+/g, ' ').trim();

      if (cleanedText) {
        const cardMatch = cleanedText.match(/(Visa|Mastercard|Amex|American Express|Discover).*?(\*{3,4})?\s*(\d{4})/i);
        if (cardMatch) {
          payments.push({
            method: cardMatch[1],
            lastFour: cardMatch[3],
          });
        } else {
          // Gift card or other method
          if (cleanedText.toLowerCase().includes('gift')) {
            payments.push({ method: 'Amazon Gift Card' });
          } else {
            payments.push({ method: cleanedText.slice(0, 50) });
          }
        }
      }
    }
  }

  // Strategy 4 (AZAD): Payment station method
  if (payments.length === 0) {
    const paystationText = await getTextByXPaths(page, [
      '//*[contains(@class, "paystationpaymentmethod")]',
    ], '');

    if (paystationText) {
      const cardMatch = paystationText.match(/(Visa|Mastercard|Amex|American Express|Discover).*?(\d{4})/i);
      if (cardMatch) {
        payments.push({
          method: cardMatch[1],
          lastFour: cardMatch[2],
        });
      } else {
        payments.push({ method: paystationText.trim().slice(0, 50) });
      }
    }
  }

  // Fallback: Simple "ending in" pattern
  if (payments.length === 0) {
    const transactionText = await getTextByXPaths(page, [
      '//span[contains(text(),"ending in")]',
      '//div[contains(@class,"payment-method")]//span',
      '//span[contains(text(),"Visa") or contains(text(),"Mastercard") or contains(text(),"Amex")]',
    ], '');

    if (transactionText) {
      const match = transactionText.match(/(Visa|Mastercard|Amex|Discover|American Express).*?(\d{4})/i);
      if (match) {
        payments.push({
          method: match[1],
          lastFour: match[2],
        });
      } else {
        payments.push({ method: transactionText.trim() });
      }
    }
  }

  return payments;
}

/**
 * Extract invoice URL.
 */
async function extractInvoiceUrl(page: Page, domain: string): Promise<string | undefined> {
  const href = await page.locator('a[href*="/invoice"], a[href*="_invoice"]')
    .first().getAttribute('href').catch(() => null);

  if (href) {
    if (href.startsWith('http')) return href;
    return `https://www.${domain}${href}`;
  }

  return undefined;
}

/**
 * Extract order header from the detail page.
 * Useful when navigating directly to an order detail URL.
 */
export async function extractOrderHeader(
  page: Page,
  region: string
): Promise<OrderHeader | null> {
  const regionConfig = getRegionByCode(region);
  const currency = regionConfig?.currency || 'USD';

  // Extract order ID from page
  const orderIdText = await getTextByXPaths(page, [
    '//*[contains(text(),"Order #") or contains(text(),"Order ID")]',
    '//bdi[contains(text(),"Order")]',
    '//span[contains(@class,"order-id")]',
  ], '');

  const idMatch = orderIdText.match(/(\d{3}-\d{7}-\d{7})/);
  if (!idMatch) return null;

  const id = idMatch[1];

  // Extract date
  const dateText = await getTextByXPaths(page, [
    '//span[contains(text(),"Ordered on") or contains(text(),"Order placed")]',
    '//*[contains(@class,"order-date")]',
  ], '');
  const date = parseDate(dateText);

  // Extract total using AZAD's comprehensive patterns
  const total = await extractGrandTotal(page, currency);

  return {
    id,
    orderId: id,
    date,
    total,
    detailUrl: page.url(),
    platform: 'amazon',
    region,
  };
}

/**
 * Extract all order details from the current detail page.
 */
export async function extractOrderDetails(
  page: Page,
  region: string
): Promise<OrderDetails> {
  const regionConfig = getRegionByCode(region);
  const domain = regionConfig?.domain || 'amazon.com';
  const currency = regionConfig?.currency || 'USD';

  const [
    shipping,
    shippingRefund,
    tax,
    gift,
    refund,
    subscribeAndSave,
    recipientName,
    payments,
    invoiceUrl,
  ] = await Promise.all([
    extractShipping(page, currency),
    extractShippingRefund(page, currency),
    extractTax(page, currency, region),
    extractGiftAmount(page, currency),
    extractRefund(page, currency),
    extractSubscribeAndSave(page, currency),
    extractRecipientName(page),
    extractPayments(page),
    extractInvoiceUrl(page, domain),
  ]);

  return {
    shipping,
    shippingRefund,
    tax,
    gift,
    refund,
    subscribeAndSave,
    recipient: {
      name: recipientName,
    },
    payments,
    invoiceUrl,
  };
}
