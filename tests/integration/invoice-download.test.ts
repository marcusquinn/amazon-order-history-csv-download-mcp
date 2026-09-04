import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import type { Browser, Page } from "playwright";
import {
  downloadAmazonInvoice,
  isValidAmazonOrderId,
} from "../../src/tools/download-invoice";

const orderId = "123-4567890-1234567";
const domain = "amazon.co.uk";
const bundledBrowser = chromium.executablePath();
const macOsBrowser =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browserExecutable = existsSync(bundledBrowser)
  ? bundledBrowser
  : process.platform === "darwin" && existsSync(macOsBrowser)
    ? macOsBrowser
    : undefined;
const describeWithBrowser = browserExecutable ? describe : describe.skip;

describe("Amazon order ID validation", () => {
  it("accepts only the documented Amazon order ID format", () => {
    expect(isValidAmazonOrderId(orderId)).toBe(true);
    expect(isValidAmazonOrderId("123-4567890-1234567/../invoice")).toBe(false);
    expect(isValidAmazonOrderId("123-4567890-1234567 ")).toBe(false);
    expect(isValidAmazonOrderId("12345678901234567")).toBe(false);
  });
});

describeWithBrowser("invoice PDF download", () => {
  let browser: Browser;
  let page: Page;
  let outputDirectory: string;
  const validFixture = readFileSync(
    join(__dirname, "fixtures/invoice-download-valid.html"),
    "utf-8",
  );
  const errorFixture = readFileSync(
    join(__dirname, "fixtures/invoice-download-error.html"),
    "utf-8",
  );

  beforeAll(async () => {
    if (!browserExecutable) throw new Error("Browser executable not available");
    browser = await chromium.launch({
      headless: true,
      executablePath: browserExecutable,
    });
  });

  beforeEach(async () => {
    page = await browser.newPage();
    outputDirectory = await mkdtemp(join(tmpdir(), "amazon-invoice-download-"));
  });

  afterEach(async () => {
    await page.close();
    await rm(outputDirectory, { recursive: true, force: true });
  });

  afterAll(async () => {
    await browser.close();
  });

  async function routeInvoice(content: string): Promise<void> {
    await page.route(
      "**/gp/css/summary/print.html?orderID=*",
      async (route) => {
        await route.fulfill({ contentType: "text/html", body: content });
      },
    );
  }

  it("renders a non-empty A4 PDF only after invoice identity validation", async () => {
    await routeInvoice(validFixture);
    const outputPath = join(outputDirectory, "nested", "invoice.pdf");

    const result = await downloadAmazonInvoice({
      page,
      orderId,
      domain,
      outputPath,
    });

    expect(result).toEqual(
      expect.objectContaining({ success: true, filePath: outputPath }),
    );
    expect(result.success && result.bytes).toBeGreaterThan(0);
    expect((await readFile(outputPath)).subarray(0, 4).toString()).toBe("%PDF");
  });

  it("rejects Amazon error pages without creating a PDF", async () => {
    await routeInvoice(errorFixture);
    const outputPath = join(outputDirectory, "invoice.pdf");

    const result = await downloadAmazonInvoice({
      page,
      orderId,
      domain,
      outputPath,
    });

    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(existsSync(outputPath)).toBe(false);
  });

  it("rejects an authentication redirect without creating a PDF", async () => {
    await page.route(
      "**/gp/css/summary/print.html?orderID=*",
      async (route) => {
        await route.fulfill({
          status: 302,
          headers: { location: "https://www.amazon.co.uk/ap/signin" },
        });
      },
    );
    await page.route("**/ap/signin", async (route) => {
      await route.fulfill({ contentType: "text/html", body: "Sign in" });
    });
    const outputPath = join(outputDirectory, "invoice.pdf");

    const result = await downloadAmazonInvoice({
      page,
      orderId,
      domain,
      outputPath,
    });

    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(existsSync(outputPath)).toBe(false);
  });

  it("rejects invoice content for a different order and preserves prior output", async () => {
    await routeInvoice(validFixture.replace(orderId, "999-9999999-9999999"));
    const outputPath = join(outputDirectory, "invoice.pdf");
    await writeFile(outputPath, "previous invoice", "utf-8");

    const result = await downloadAmazonInvoice({
      page,
      orderId,
      domain,
      outputPath,
    });

    expect(result).toEqual(expect.objectContaining({ success: false }));
    await expect(readFile(outputPath, "utf-8")).resolves.toBe(
      "previous invoice",
    );
  });

  it("cleans up when the destination parent cannot be created", async () => {
    await routeInvoice(validFixture);
    const occupiedPath = join(outputDirectory, "occupied");
    await writeFile(occupiedPath, "not a directory", "utf-8");
    const outputPath = join(occupiedPath, "invoice.pdf");

    const result = await downloadAmazonInvoice({
      page,
      orderId,
      domain,
      outputPath,
    });

    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(existsSync(outputPath)).toBe(false);
  });
});
