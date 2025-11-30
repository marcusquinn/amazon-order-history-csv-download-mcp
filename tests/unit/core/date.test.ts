/**
 * Tests for date parsing utilities.
 */

import { normalizeDateString, parseDate, dateToIsoString } from '../../../src/core/utils/date';

describe('date parsing', () => {
  describe('normalizeDateString', () => {
    test('US format: October 14, 2024', () => {
      expect(normalizeDateString('October 14, 2024')).toBe('2024-10-14');
    });

    test('US format short: Oct 14, 2024', () => {
      expect(normalizeDateString('Oct 14, 2024')).toBe('2024-10-14');
    });

    test('UK format: 14 October 2024', () => {
      expect(normalizeDateString('14 October 2024')).toBe('2024-10-14');
    });

    test('UK format short: 14 Oct 2024', () => {
      expect(normalizeDateString('14 Oct 2024')).toBe('2024-10-14');
    });

    test('German format: 14. Oktober 2024', () => {
      expect(normalizeDateString('14. Oktober 2024')).toBe('2024-10-14');
    });

    test('German format: 29 Dezember 2017', () => {
      expect(normalizeDateString('29 Dezember 2017')).toBe('2017-12-29');
    });

    test('French format: 14 octobre 2024', () => {
      expect(normalizeDateString('14 octobre 2024')).toBe('2024-10-14');
    });

    test('Spanish format: 14 de octubre de 2024', () => {
      expect(normalizeDateString('14 de octubre de 2024')).toBe('2024-10-14');
    });

    test('Italian format: 22. luglio 2016', () => {
      expect(normalizeDateString('22. luglio 2016')).toBe('2016-07-22');
    });

    test('Japanese format: 2024年10月14日', () => {
      expect(normalizeDateString('2024年10月14日')).toBe('2024-10-14');
    });

    test('ISO format passthrough: 2024-10-14', () => {
      expect(normalizeDateString('2024-10-14')).toBe('2024-10-14');
    });

    test('null input returns null', () => {
      expect(normalizeDateString('')).toBe(null);
    });
  });

  describe('parseDate', () => {
    test('parses US format to Date object', () => {
      const date = parseDate('October 14, 2024');
      expect(date).toBeInstanceOf(Date);
      expect(date?.getFullYear()).toBe(2024);
      expect(date?.getMonth()).toBe(9); // 0-indexed
      expect(date?.getDate()).toBe(14);
    });

    test('returns null for invalid date', () => {
      expect(parseDate('invalid')).toBe(null);
    });
  });

  describe('dateToIsoString', () => {
    test('formats Date to ISO string', () => {
      const date = new Date(2024, 9, 14); // October 14, 2024
      expect(dateToIsoString(date)).toBe('2024-10-14');
    });

    test('returns empty string for null', () => {
      expect(dateToIsoString(null)).toBe('');
    });
  });
});
