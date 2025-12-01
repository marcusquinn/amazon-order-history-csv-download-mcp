/**
 * Amazon region configurations for all 16 supported countries.
 */

import { Region } from '../core/types';

export const AMAZON_REGIONS: Region[] = [
  {
    code: 'us',
    domain: 'amazon.com',
    currency: 'USD',
    language: 'en_US',
    dateFormat: 'MMMM D, YYYY',
    taxFields: ['tax'],
  },
  {
    code: 'uk',
    domain: 'amazon.co.uk',
    currency: 'GBP',
    language: 'en_GB',
    dateFormat: 'D MMMM YYYY',
    taxFields: ['vat'],
  },
  {
    code: 'ca',
    domain: 'amazon.ca',
    currency: 'CAD',
    language: 'en_US',
    dateFormat: 'MMMM D, YYYY',
    taxFields: ['gst', 'pst'],
  },
  {
    code: 'de',
    domain: 'amazon.de',
    currency: 'EUR',
    language: 'en_GB',
    dateFormat: 'D. MMMM YYYY',
    taxFields: ['vat'],
  },
  {
    code: 'fr',
    domain: 'amazon.fr',
    currency: 'EUR',
    language: 'en_GB',
    dateFormat: 'D MMMM YYYY',
    taxFields: ['vat'],
  },
  {
    code: 'es',
    domain: 'amazon.es',
    currency: 'EUR',
    language: 'en_GB',
    dateFormat: 'D de MMMM de YYYY',
    taxFields: ['vat'],
  },
  {
    code: 'it',
    domain: 'amazon.it',
    currency: 'EUR',
    language: 'en_GB',
    dateFormat: 'D MMMM YYYY',
    taxFields: ['vat'],
  },
  {
    code: 'nl',
    domain: 'amazon.nl',
    currency: 'EUR',
    language: 'en_GB',
    dateFormat: 'D MMMM YYYY',
    taxFields: ['vat'],
  },
  {
    code: 'jp',
    domain: 'amazon.co.jp',
    currency: 'JPY',
    language: 'ja_JP',
    dateFormat: 'YYYY年M月D日',
    taxFields: [],
  },
  {
    code: 'au',
    domain: 'amazon.com.au',
    currency: 'AUD',
    language: 'en_AU',
    dateFormat: 'D MMMM YYYY',
    taxFields: ['gst'],
  },
  {
    code: 'mx',
    domain: 'amazon.com.mx',
    currency: 'MXN',
    language: 'en_US',
    dateFormat: 'D de MMMM de YYYY',
    taxFields: ['iva'],
  },
  {
    code: 'in',
    domain: 'amazon.in',
    currency: 'INR',
    language: 'en_GB',
    dateFormat: 'D MMMM YYYY',
    taxFields: ['gst'],
  },
  {
    code: 'ae',
    domain: 'amazon.ae',
    currency: 'AED',
    language: 'en_AE',
    dateFormat: 'D MMMM YYYY',
    taxFields: ['vat'],
  },
  {
    code: 'sa',
    domain: 'amazon.sa',
    currency: 'SAR',
    language: 'en_AE',
    dateFormat: 'D MMMM YYYY',
    taxFields: ['vat'],
  },
  {
    code: 'ie',
    domain: 'amazon.ie',
    currency: 'EUR',
    language: 'en_GB',
    dateFormat: 'D MMMM YYYY',
    taxFields: ['vat'],
  },
  {
    code: 'be',
    domain: 'amazon.com.be',
    currency: 'EUR',
    language: 'en_GB',
    dateFormat: 'D MMMM YYYY',
    taxFields: ['vat'],
  },
];

/**
 * Get region by code (case-insensitive).
 */
export function getRegionByCode(code: string): Region | undefined {
  const normalizedCode = code?.toLowerCase();
  return AMAZON_REGIONS.find((r) => r.code === normalizedCode);
}

/**
 * Get region by domain.
 */
export function getRegionByDomain(domain: string): Region | undefined {
  return AMAZON_REGIONS.find((r) => r.domain === domain || `www.${r.domain}` === domain);
}

/**
 * Get all region codes.
 */
export function getRegionCodes(): string[] {
  return AMAZON_REGIONS.map((r) => r.code);
}
