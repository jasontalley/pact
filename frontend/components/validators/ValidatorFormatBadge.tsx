'use client';

import { cn } from '@/lib/utils';
import type { ValidatorFormat } from '@/types/validator';

interface ValidatorFormatBadgeProps {
  format: ValidatorFormat;
  className?: string;
}

const formatConfig: Record<ValidatorFormat, { label: string; className: string }> = {
  gherkin: {
    label: 'Gherkin',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  },
  natural_language: {
    label: 'Natural Language',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  },
  typescript: {
    label: 'TypeScript',
    className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  },
  json: {
    label: 'JSON',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  },
};

/**
 * Badge component for displaying validator format
 */
export function ValidatorFormatBadge({ format, className }: ValidatorFormatBadgeProps) {
  const config = formatConfig[format];

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
