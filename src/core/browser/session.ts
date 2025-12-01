/**
 * Browser session management for Playwright.
 * Handles persistent sessions, cookie storage, and authentication state.
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_USER_DATA_DIR = path.join(process.cwd(), '.browser-data');
const COOKIES_FILE = 'cookies.json';

export interface SessionOptions {
  headless?: boolean;
  userDataDir?: string;
  slowMo?: number;
  timeout?: number;
}

export interface SessionState {
  browser: Browser | null;
  context: BrowserContext | null;
  page: Page | null;
  isInitialized: boolean;
}

/**
 * Browser session manager for persistent authentication.
 */
export class BrowserSession {
  private state: SessionState = {
    browser: null,
    context: null,
    page: null,
    isInitialized: false,
  };

  private options: Required<SessionOptions>;

  constructor(options: SessionOptions = {}) {
    this.options = {
      headless: options.headless ?? true,
      userDataDir: options.userDataDir ?? DEFAULT_USER_DATA_DIR,
      slowMo: options.slowMo ?? 50,
      timeout: options.timeout ?? 30000,
    };
  }

  /**
   * Initialize the browser session.
   */
  async initialize(): Promise<void> {
    if (this.state.isInitialized) {
      return;
    }

    // Ensure user data directory exists
    if (!fs.existsSync(this.options.userDataDir)) {
      fs.mkdirSync(this.options.userDataDir, { recursive: true });
    }

    // Launch browser with persistent context
    this.state.browser = await chromium.launch({
      headless: this.options.headless,
      slowMo: this.options.slowMo,
    });

    // Create context with stored state if available
    const storageStatePath = path.join(this.options.userDataDir, COOKIES_FILE);
    const contextOptions: Parameters<Browser['newContext']>[0] = {
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    if (fs.existsSync(storageStatePath)) {
      try {
        contextOptions.storageState = storageStatePath;
      } catch {
        // Invalid storage state, start fresh
      }
    }

    this.state.context = await this.state.browser.newContext(contextOptions);
    this.state.context.setDefaultTimeout(this.options.timeout);

    this.state.page = await this.state.context.newPage();
    this.state.isInitialized = true;
  }

  /**
   * Get the current page, initializing if needed.
   */
  async getPage(): Promise<Page> {
    if (!this.state.isInitialized || !this.state.page) {
      await this.initialize();
    }
    return this.state.page!;
  }

  /**
   * Save current session state (cookies, localStorage).
   */
  async saveState(): Promise<void> {
    if (!this.state.context) {
      return;
    }

    const storageStatePath = path.join(this.options.userDataDir, COOKIES_FILE);
    await this.state.context.storageState({ path: storageStatePath });
  }

  /**
   * Navigate to a URL.
   */
  async navigateTo(url: string, waitUntil: 'load' | 'domcontentloaded' | 'networkidle' = 'networkidle'): Promise<void> {
    const page = await this.getPage();
    await page.goto(url, { waitUntil });
  }

  /**
   * Wait for navigation after an action.
   */
  async waitForNavigation(): Promise<void> {
    const page = await this.getPage();
    await page.waitForLoadState('networkidle');
  }

  /**
   * Take a screenshot (useful for debugging).
   */
  async screenshot(filename: string): Promise<void> {
    const page = await this.getPage();
    const screenshotPath = path.join(this.options.userDataDir, filename);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  }

  /**
   * Check if we're on a login page.
   */
  async isOnLoginPage(): Promise<boolean> {
    const page = await this.getPage();
    const url = page.url();
    return url.includes('/ap/signin') || url.includes('/ap/cvf');
  }

  /**
   * Wait for user to complete login manually.
   */
  async waitForManualLogin(timeoutMs = 300000): Promise<boolean> {
    const page = await this.getPage();
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (!(await this.isOnLoginPage())) {
        await this.saveState();
        return true;
      }
      await page.waitForTimeout(1000);
    }

    return false;
  }

  /**
   * Close the browser session.
   */
  async close(): Promise<void> {
    if (this.state.context) {
      await this.saveState();
    }

    if (this.state.browser) {
      await this.state.browser.close();
    }

    this.state = {
      browser: null,
      context: null,
      page: null,
      isInitialized: false,
    };
  }

  /**
   * Get session statistics.
   */
  getStats(): { isInitialized: boolean; hasPage: boolean } {
    return {
      isInitialized: this.state.isInitialized,
      hasPage: this.state.page !== null,
    };
  }
}

/**
 * Global session instance for reuse across tool calls.
 */
let globalSession: BrowserSession | null = null;

/**
 * Get or create the global browser session.
 */
export function getGlobalSession(options?: SessionOptions): BrowserSession {
  if (!globalSession) {
    globalSession = new BrowserSession(options);
  }
  return globalSession;
}

/**
 * Close the global session.
 */
export async function closeGlobalSession(): Promise<void> {
  if (globalSession) {
    await globalSession.close();
    globalSession = null;
  }
}
