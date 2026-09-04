/**
 * Safe invoice PDF rendering and publication for Amazon orders.
 */

import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, isAbsolute, join } from "node:path";
import type { Page } from "playwright";
import { getInvoiceUrl } from "../amazon/extractors/invoice";

const ORDER_ID_PATTERN = /^[A-Za-z0-9]{3}-\d{7}-\d{7}$/;
const INVOICE_SELECTOR =
  '[data-component="purchasedItems"], [data-component="chargeSummary"]';
const ERROR_SELECTOR =
  "#error, .a-alert-error, .a-box.a-alert-error, [data-testid='error']";

export type DownloadInvoiceResult =
  | { success: true; filePath: string; bytes: number }
  | { success: false; error: string };

export interface DownloadInvoiceOptions {
  page: Page;
  orderId: string;
  domain: string;
  outputPath: string;
}

/**
 * Validates the documented Amazon order ID before it reaches navigation or disk.
 */
export function isValidAmazonOrderId(orderId: string): boolean {
  return ORDER_ID_PATTERN.test(orderId);
}

/**
 * Render a positively identified invoice and atomically publish its PDF.
 */
export async function downloadAmazonInvoice(
  options: DownloadInvoiceOptions,
): Promise<DownloadInvoiceResult> {
  const { page, orderId, domain, outputPath } = options;

  if (!isValidAmazonOrderId(orderId)) {
    return { success: false, error: "Invalid Amazon order ID" };
  }

  if (!isAbsolute(outputPath)) {
    return { success: false, error: "output_path must be an absolute path" };
  }

  const invoiceUrl = getInvoiceUrl(encodeURIComponent(orderId), domain);
  const expectedUrl = new URL(invoiceUrl);

  try {
    await page.goto(invoiceUrl, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
  } catch (error) {
    return {
      success: false,
      error: `Unable to load invoice: ${String(error)}`,
    };
  }

  let currentUrl: URL;
  try {
    currentUrl = new URL(page.url());
  } catch {
    return {
      success: false,
      error: "Invoice navigation returned an invalid URL",
    };
  }

  if (
    currentUrl.protocol !== "https:" ||
    currentUrl.hostname !== expectedUrl.hostname ||
    currentUrl.pathname !== expectedUrl.pathname
  ) {
    return {
      success: false,
      error: "Invoice navigation did not reach the requested print page",
    };
  }

  if ((await page.locator(ERROR_SELECTOR).count()) > 0) {
    return { success: false, error: "Amazon returned an invoice error page" };
  }

  try {
    await page.waitForSelector(INVOICE_SELECTOR, { timeout: 5000 });
  } catch (error) {
    return {
      success: false,
      error: `Invoice-specific content was not found: ${String(error)}`,
    };
  }

  const pageText = (await page.textContent("body")) ?? "";
  if (!pageText.includes(orderId)) {
    return {
      success: false,
      error: "Invoice does not match the requested order ID",
    };
  }

  let pdf: Buffer;
  try {
    pdf = await page.pdf({ format: "A4", printBackground: true });
  } catch (error) {
    return {
      success: false,
      error: `Unable to render invoice PDF: ${String(error)}`,
    };
  }

  if (pdf.length === 0) {
    return { success: false, error: "Invoice PDF render produced no data" };
  }

  const parentDirectory = dirname(outputPath);
  const temporaryPath = join(
    parentDirectory,
    `.${orderId}.${randomUUID()}.pdf.tmp`,
  );

  try {
    await mkdir(parentDirectory, { recursive: true });
    await writeFile(temporaryPath, pdf);
    await rename(temporaryPath, outputPath);
    return { success: true, filePath: outputPath, bytes: pdf.length };
  } catch (error) {
    return {
      success: false,
      error: `Unable to save invoice PDF: ${String(error)}`,
    };
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}
