/**
 * DOM extraction utilities using XPath and CSS selectors.
 * Includes strategy pattern for handling Amazon's changing DOM structure.
 */

import { Page, Locator } from 'playwright';

/**
 * Execute an XPath query and return the first matching element's text content.
 */
export async function getTextByXPath(
  page: Page,
  xpath: string,
  defaultValue = ''
): Promise<string> {
  try {
    const element = page.locator(`xpath=${xpath}`).first();
    const text = await element.textContent({ timeout: 5000 });
    return text?.trim() || defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Execute multiple XPath queries and return the first successful result.
 */
export async function getTextByXPaths(
  page: Page,
  xpaths: string[],
  defaultValue = ''
): Promise<string> {
  for (const xpath of xpaths) {
    const result = await getTextByXPath(page, xpath, '');
    if (result) {
      return result;
    }
  }
  return defaultValue;
}

/**
 * Execute an XPath query and return all matching elements.
 */
export async function getElementsByXPath(
  page: Page,
  xpath: string
): Promise<Locator[]> {
  const locator = page.locator(`xpath=${xpath}`);
  const count = await locator.count();
  const elements: Locator[] = [];
  for (let i = 0; i < count; i++) {
    elements.push(locator.nth(i));
  }
  return elements;
}

/**
 * Extract text using a regex pattern from XPath results.
 */
export async function extractByRegex(
  page: Page,
  xpaths: string[],
  pattern: RegExp | null,
  defaultValue: string
): Promise<string> {
  const text = await getTextByXPaths(page, xpaths, '');
  
  if (!text) {
    return defaultValue;
  }
  
  if (pattern) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
    if (match && match[0]) {
      return match[0].trim();
    }
    return defaultValue;
  }
  
  return text;
}

/**
 * Get an attribute value from an element found by XPath.
 */
export async function getAttributeByXPath(
  page: Page,
  xpath: string,
  attribute: string,
  defaultValue = ''
): Promise<string> {
  try {
    const element = page.locator(`xpath=${xpath}`).first();
    const value = await element.getAttribute(attribute, { timeout: 5000 });
    return value || defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Strategy function type for extraction.
 */
export type ExtractionStrategy<T> = () => Promise<T | null>;

/**
 * Try multiple extraction strategies and return the first successful result.
 */
export async function firstMatchingStrategy<T>(
  strategies: ExtractionStrategy<T>[],
  defaultValue: T
): Promise<T> {
  for (const strategy of strategies) {
    try {
      const result = await strategy();
      if (result !== null && result !== undefined) {
        // For strings, also check if non-empty
        if (typeof result === 'string' && result.trim() === '') {
          continue;
        }
        // For arrays, check if non-empty
        if (Array.isArray(result) && result.length === 0) {
          continue;
        }
        return result;
      }
    } catch {
      // Strategy failed, try next
      continue;
    }
  }
  return defaultValue;
}

/**
 * Money regex pattern for extracting amounts.
 */
export function moneyRegex(): RegExp {
  return /([£$€¥₹]|AED|SAR|CAD|AUD|MXN|USD|GBP|EUR|INR|JPY)?\s*([\d,]+\.?\d*)/;
}

/**
 * Wait for any of the given selectors to be visible.
 */
export async function waitForAnySelector(
  page: Page,
  selectors: string[],
  timeout = 10000
): Promise<string | null> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    for (const selector of selectors) {
      try {
        const isVisible = await page.locator(selector).first().isVisible();
        if (isVisible) {
          return selector;
        }
      } catch {
        // Selector not found, continue
      }
    }
    await page.waitForTimeout(100);
  }
  
  return null;
}
