#!/usr/bin/env node

/**
 * Core sync script for consumer mode.
 * Checks for updates to the core framework and downloads if needed.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const CONFIG_FILE = path.join(__dirname, '..', '.core-config.json');
const CORE_VERSION_FILE = path.join(__dirname, '..', 'src', 'core', '.core-version');
const CORE_DIR = path.join(__dirname, '..', 'src', 'core');

/**
 * Load configuration.
 */
function loadConfig() {
  try {
    const configPath = fs.existsSync(path.join(__dirname, '..', '.core-config.local.json'))
      ? path.join(__dirname, '..', '.core-config.local.json')
      : CONFIG_FILE;
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return {
      coreRepo: 'marcusquinn/ecommerce-order-history-csv-download-mcp-core',
      coreBranch: 'main',
      autoUpdate: true,
      devMode: false,
    };
  }
}

/**
 * Check if running in developer mode.
 */
function isDevMode() {
  const config = loadConfig();
  return config.devMode || process.env.CORE_DEV_MODE === 'true';
}

/**
 * Get current local core version.
 */
function getLocalVersion() {
  try {
    return fs.readFileSync(CORE_VERSION_FILE, 'utf8').trim();
  } catch {
    return null;
  }
}

/**
 * Fetch latest release version from GitHub.
 */
async function fetchLatestVersion(repo) {
  return new Promise((resolve, reject) => {
    const url = `https://api.github.com/repos/${repo}/releases/latest`;
    
    https.get(url, { headers: { 'User-Agent': 'amazon-order-history-mcp' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.tag_name || null);
        } catch {
          resolve(null);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Main sync function.
 */
async function syncCore() {
  console.log('[sync-core] Checking core framework...');
  
  // Skip if in dev mode
  if (isDevMode()) {
    console.log('[sync-core] Developer mode enabled, skipping sync');
    return;
  }
  
  const config = loadConfig();
  
  if (!config.autoUpdate) {
    console.log('[sync-core] Auto-update disabled, skipping sync');
    return;
  }
  
  const localVersion = getLocalVersion();
  console.log(`[sync-core] Local version: ${localVersion || 'none'}`);
  
  try {
    const latestVersion = await fetchLatestVersion(config.coreRepo);
    console.log(`[sync-core] Latest version: ${latestVersion || 'unknown'}`);
    
    if (latestVersion && latestVersion !== localVersion) {
      console.log('[sync-core] Update available, but auto-download not yet implemented');
      console.log('[sync-core] Please update manually or run: npm run update-core');
    } else {
      console.log('[sync-core] Core is up to date');
    }
  } catch (error) {
    console.log(`[sync-core] Could not check for updates: ${error.message}`);
    console.log('[sync-core] Continuing with local core...');
  }
}

// Run if called directly
if (require.main === module) {
  syncCore().catch(console.error);
}

module.exports = { syncCore, isDevMode, loadConfig };
