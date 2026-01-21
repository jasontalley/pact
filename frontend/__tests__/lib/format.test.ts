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

    it('returns "just now" for dates less than 60 seconds ago', () => {
      const date = new Date('2025-06-15T11:59:30Z'); // 30 seconds ago
      expect(formatDistanceToNow(date)).toBe('just now');
    });

    it('returns minutes ago for dates less than 60 minutes ago', () => {
      const oneMinuteAgo = new Date('2025-06-15T11:59:00Z');
      expect(formatDistanceToNow(oneMinuteAgo)).toBe('1 minute ago');

      const fiveMinutesAgo = new Date('2025-06-15T11:55:00Z');
      expect(formatDistanceToNow(fiveMinutesAgo)).toBe('5 minutes ago');

      const fiftyNineMinutesAgo = new Date('2025-06-15T11:01:00Z');
      expect(formatDistanceToNow(fiftyNineMinutesAgo)).toBe('59 minutes ago');
    });

    it('returns hours ago for dates less than 24 hours ago', () => {
      const oneHourAgo = new Date('2025-06-15T11:00:00Z');
      expect(formatDistanceToNow(oneHourAgo)).toBe('1 hour ago');

      const fiveHoursAgo = new Date('2025-06-15T07:00:00Z');
      expect(formatDistanceToNow(fiveHoursAgo)).toBe('5 hours ago');

      const twentyThreeHoursAgo = new Date('2025-06-14T13:00:00Z');
      expect(formatDistanceToNow(twentyThreeHoursAgo)).toBe('23 hours ago');
    });

    it('returns days ago for dates less than 30 days ago', () => {
      const oneDayAgo = new Date('2025-06-14T12:00:00Z');
      expect(formatDistanceToNow(oneDayAgo)).toBe('1 day ago');

      const fiveDaysAgo = new Date('2025-06-10T12:00:00Z');
      expect(formatDistanceToNow(fiveDaysAgo)).toBe('5 days ago');

      const twentyNineDaysAgo = new Date('2025-05-17T12:00:00Z');
      expect(formatDistanceToNow(twentyNineDaysAgo)).toBe('29 days ago');
    });

    it('returns months ago for dates less than 12 months ago', () => {
      const oneMonthAgo = new Date('2025-05-15T12:00:00Z');
      expect(formatDistanceToNow(oneMonthAgo)).toBe('1 month ago');

      const fiveMonthsAgo = new Date('2025-01-15T12:00:00Z');
      expect(formatDistanceToNow(fiveMonthsAgo)).toBe('5 months ago');
    });

    it('returns years ago for dates more than 12 months ago', () => {
      const oneYearAgo = new Date('2024-06-15T12:00:00Z');
      expect(formatDistanceToNow(oneYearAgo)).toBe('1 year ago');

      const twoYearsAgo = new Date('2023-06-15T12:00:00Z');
      expect(formatDistanceToNow(twoYearsAgo)).toBe('2 years ago');
    });
  });

  describe('formatDate', () => {
    it('formats date in readable format', () => {
      const date = new Date('2025-06-15T12:00:00Z');
      const result = formatDate(date);
      // Note: locale formatting may vary, checking for key parts
      expect(result).toMatch(/Jun/);
      expect(result).toMatch(/15/);
      expect(result).toMatch(/2025/);
    });

    it('handles different months', () => {
      const janDate = new Date('2025-01-01T12:00:00Z');
      expect(formatDate(janDate)).toMatch(/Jan/);

      const decDate = new Date('2025-12-25T12:00:00Z');
      expect(formatDate(decDate)).toMatch(/Dec/);
    });
  });

  describe('formatDateTime', () => {
    it('formats date with time', () => {
      const date = new Date('2025-06-15T14:30:00Z');
      const result = formatDateTime(date);
      // Check for date parts
      expect(result).toMatch(/Jun/);
      expect(result).toMatch(/15/);
      expect(result).toMatch(/2025/);
      // Check for time (varies by timezone, so just check format)
      expect(result).toMatch(/\d{1,2}:\d{2}/);
    });
  });

  describe('formatPercent', () => {
    it('formats number as percentage with default decimals', () => {
      expect(formatPercent(85)).toBe('85%');
      expect(formatPercent(100)).toBe('100%');
      expect(formatPercent(0)).toBe('0%');
    });

    it('formats with specified decimal places', () => {
      expect(formatPercent(85.5, 1)).toBe('85.5%');
      expect(formatPercent(85.55, 2)).toBe('85.55%');
      expect(formatPercent(85.555, 2)).toBe('85.56%'); // Rounding
    });

    it('handles decimal numbers with default decimals', () => {
      expect(formatPercent(85.5)).toBe('86%'); // Rounds to nearest integer
      expect(formatPercent(85.4)).toBe('85%');
    });
  });
});
