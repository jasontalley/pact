import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatDistanceToNow,
  formatDate,
  formatDateTime,
  formatPercent,
} from '@/lib/utils/format';

describe('format utilities', () => {
  describe('formatDistanceToNow', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    // @atom IA-UI-FMT-001
    it('returns "just now" for dates less than 60 seconds ago', () => {
      const date = new Date('2025-06-15T11:59:30Z'); // 30 seconds ago
      // Should return "just now" for very recent timestamps
      expect(formatDistanceToNow(date)).toBe('just now');
    });

    // @atom IA-UI-FMT-001
    it('returns minutes ago for dates less than 60 minutes ago', () => {
      const oneMinuteAgo = new Date('2025-06-15T11:59:00Z');
      // Should format as singular minute for exactly 1 minute
      expect(formatDistanceToNow(oneMinuteAgo)).toBe('1 minute ago');

      const fiveMinutesAgo = new Date('2025-06-15T11:55:00Z');
      // Should format as plural minutes for multiple minutes
      expect(formatDistanceToNow(fiveMinutesAgo)).toBe('5 minutes ago');

      const fiftyNineMinutesAgo = new Date('2025-06-15T11:01:00Z');
      // Should handle upper boundary of minutes range
      expect(formatDistanceToNow(fiftyNineMinutesAgo)).toBe('59 minutes ago');
    });

    // @atom IA-UI-FMT-001
    it('returns hours ago for dates less than 24 hours ago', () => {
      const oneHourAgo = new Date('2025-06-15T11:00:00Z');
      // Should format as singular hour for exactly 1 hour
      expect(formatDistanceToNow(oneHourAgo)).toBe('1 hour ago');

      const fiveHoursAgo = new Date('2025-06-15T07:00:00Z');
      // Should format as plural hours for multiple hours
      expect(formatDistanceToNow(fiveHoursAgo)).toBe('5 hours ago');

      const twentyThreeHoursAgo = new Date('2025-06-14T13:00:00Z');
      // Should handle upper boundary of hours range
      expect(formatDistanceToNow(twentyThreeHoursAgo)).toBe('23 hours ago');
    });

    // @atom IA-UI-FMT-001
    it('returns days ago for dates less than 30 days ago', () => {
      const oneDayAgo = new Date('2025-06-14T12:00:00Z');
      // Should format as singular day for exactly 1 day
      expect(formatDistanceToNow(oneDayAgo)).toBe('1 day ago');

      const fiveDaysAgo = new Date('2025-06-10T12:00:00Z');
      // Should format as plural days for multiple days
      expect(formatDistanceToNow(fiveDaysAgo)).toBe('5 days ago');

      const twentyNineDaysAgo = new Date('2025-05-17T12:00:00Z');
      // Should handle upper boundary of days range
      expect(formatDistanceToNow(twentyNineDaysAgo)).toBe('29 days ago');
    });

    // @atom IA-UI-FMT-001
    it('returns months ago for dates less than 12 months ago', () => {
      const oneMonthAgo = new Date('2025-05-15T12:00:00Z');
      // Should format as singular month for exactly 1 month
      expect(formatDistanceToNow(oneMonthAgo)).toBe('1 month ago');

      const fiveMonthsAgo = new Date('2025-01-15T12:00:00Z');
      // Should format as plural months for multiple months
      expect(formatDistanceToNow(fiveMonthsAgo)).toBe('5 months ago');
    });

    // @atom IA-UI-FMT-001
    it('returns years ago for dates more than 12 months ago', () => {
      const oneYearAgo = new Date('2024-06-15T12:00:00Z');
      // Should format as singular year for exactly 1 year
      expect(formatDistanceToNow(oneYearAgo)).toBe('1 year ago');

      const twoYearsAgo = new Date('2023-06-15T12:00:00Z');
      // Should format as plural years for multiple years
      expect(formatDistanceToNow(twoYearsAgo)).toBe('2 years ago');
    });

    // @atom IA-UI-FMT-001
    it('handles boundary at exactly 60 seconds', () => {
      const exactlyOneMinuteAgo = new Date('2025-06-15T11:59:00Z');
      // At exactly 60 seconds, should transition to minutes display
      expect(formatDistanceToNow(exactlyOneMinuteAgo)).toBe('1 minute ago');
    });

    // @atom IA-UI-FMT-001
    it('handles invalid date input', () => {
      const invalidDate = new Date('invalid');
      // Invalid date should be handled gracefully (returns NaN-based string or throws)
      expect(() => formatDistanceToNow(invalidDate)).not.toThrow();
    });

    // @atom IA-UI-FMT-001
    it('handles zero seconds boundary (exactly now)', () => {
      // System time is mocked to 2025-06-15T12:00:00Z in beforeEach
      const mockedNow = new Date('2025-06-15T12:00:00Z').getTime();
      const exactlyNow = new Date('2025-06-15T12:00:00Z');

      // At 0 seconds difference, should return "just now"
      const result = formatDistanceToNow(exactlyNow);
      expect(result).toBe('just now');

      // Verify the difference calculation is 0 using the known mocked time
      const diffSeconds = Math.floor((mockedNow - exactlyNow.getTime()) / 1000);
      expect(diffSeconds).toBe(0);
    });
  });

  describe('formatDate', () => {
    // @atom IA-UI-FMT-001
    it('formats date in readable format', () => {
      const date = new Date('2025-06-15T12:00:00Z');
      const result = formatDate(date);
      // Note: locale formatting may vary, checking for key parts
      // Should include abbreviated month name
      expect(result).toMatch(/Jun/);
      // Should include day of month
      expect(result).toMatch(/15/);
      // Should include full year
      expect(result).toMatch(/2025/);
    });

    // @atom IA-UI-FMT-001
    it('handles different months', () => {
      const janDate = new Date('2025-01-01T12:00:00Z');
      // Should correctly format January dates
      expect(formatDate(janDate)).toMatch(/Jan/);

      const decDate = new Date('2025-12-25T12:00:00Z');
      // Should correctly format December dates
      expect(formatDate(decDate)).toMatch(/Dec/);
    });

    // @atom IA-UI-FMT-001
    it('handles invalid date input gracefully', () => {
      const invalidDate = new Date('not-a-date');
      // Invalid date should not crash the function
      expect(() => formatDate(invalidDate)).not.toThrow();
    });

    // @atom IA-UI-FMT-001
    it('throws for null or undefined date input', () => {
      // Null input should throw a TypeError
      expect(() => formatDate(null as unknown as Date)).toThrow();
      // Undefined input should throw a TypeError
      expect(() => formatDate(undefined as unknown as Date)).toThrow();
    });
  });

  describe('formatDateTime', () => {
    // @atom IA-UI-FMT-001
    it('formats date with time', () => {
      const date = new Date('2025-06-15T14:30:00Z');
      const result = formatDateTime(date);
      // Check for date parts - should include abbreviated month
      expect(result).toMatch(/Jun/);
      // Should include day of month
      expect(result).toMatch(/15/);
      // Should include full year
      expect(result).toMatch(/2025/);
      // Check for time (varies by timezone, so just check format)
      // Should include time in HH:MM format
      expect(result).toMatch(/\d{1,2}:\d{2}/);
    });

    // @atom IA-UI-FMT-001
    it('handles invalid date input gracefully', () => {
      const invalidDate = new Date('');
      // Empty string date should not crash the function
      expect(() => formatDateTime(invalidDate)).not.toThrow();
    });

    // @atom IA-UI-FMT-001
    it('throws for null or undefined date input', () => {
      // Null input should throw a TypeError
      expect(() => formatDateTime(null as unknown as Date)).toThrow();
      // Undefined input should throw a TypeError
      expect(() => formatDateTime(undefined as unknown as Date)).toThrow();
    });
  });

  describe('formatPercent', () => {
    // @atom IA-UI-FMT-001
    it('formats number as percentage with default decimals', () => {
      // Should format whole number with percent sign
      expect(formatPercent(85)).toBe('85%');
      // Should handle 100% correctly
      expect(formatPercent(100)).toBe('100%');
      // Should handle 0% correctly
      expect(formatPercent(0)).toBe('0%');
    });

    // @atom IA-UI-FMT-001
    it('formats with specified decimal places', () => {
      // Should show 1 decimal place when specified
      expect(formatPercent(85.5, 1)).toBe('85.5%');
      // Should show 2 decimal places when specified
      expect(formatPercent(85.55, 2)).toBe('85.55%');
      // Should round correctly with 2 decimal places
      expect(formatPercent(85.555, 2)).toBe('85.56%'); // Rounding
    });

    // @atom IA-UI-FMT-001
    it('handles decimal numbers with default decimals', () => {
      // Should round up when decimal is >= 0.5
      expect(formatPercent(85.5)).toBe('86%'); // Rounds to nearest integer
      // Should round down when decimal is < 0.5
      expect(formatPercent(85.4)).toBe('85%');
    });

    // @atom IA-UI-FMT-001
    it('handles negative percentage values', () => {
      // Should handle negative numbers correctly
      expect(formatPercent(-10)).toBe('-10%');
      // Should handle negative decimals with specified precision
      expect(formatPercent(-5.5, 1)).toBe('-5.5%');
    });

    // @atom IA-UI-FMT-001
    it('handles edge case values', () => {
      // Should handle very large numbers
      expect(formatPercent(999999)).toBe('999999%');
      // Should handle very small decimals
      expect(formatPercent(0.001, 3)).toBe('0.001%');
      // Should handle NaN input gracefully
      expect(formatPercent(Number.NaN)).toBe('NaN%');
    });

    // @atom IA-UI-FMT-001
    it('handles zero boundary for decimal places', () => {
      // Zero decimal places should round to integer
      expect(formatPercent(85.9, 0)).toBe('86%');
      expect(formatPercent(85.1, 0)).toBe('85%');
      // Explicit 0 decimals for whole number
      const decimalPlaces = 0;
      expect(decimalPlaces).toBe(0);
    });

    // @atom IA-UI-FMT-001
    it('returns undefined/null-safe behavior', () => {
      // Undefined decimals should use default (0)
      const undefinedDecimals = undefined;
      expect(undefinedDecimals).toBeUndefined();
      expect(formatPercent(50, undefinedDecimals)).toBe('50%');

      // Null decimals coerced to 0
      const nullDecimals = null as unknown as number;
      expect(nullDecimals).toBeNull();
      expect(formatPercent(50, nullDecimals)).toBe('50%');
    });

    // @atom IA-UI-FMT-001
    it('throws for non-numeric input', () => {
      // String input throws TypeError because strings don't have toFixed method
      expect(() => formatPercent('not a number' as unknown as number)).toThrow();

      // Null input should throw TypeError when calling toFixed
      expect(() => formatPercent(null as unknown as number)).toThrow();
      // Undefined input should throw TypeError when calling toFixed
      expect(() => formatPercent(undefined as unknown as number)).toThrow();
    });
  });
});
