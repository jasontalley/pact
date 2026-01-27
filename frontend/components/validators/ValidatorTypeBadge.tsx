'use client';

import { cn } from '@/lib/utils';
import type { ValidatorType } from '@/types/validator';

interface ValidatorTypeBadgeProps {
  type: ValidatorType;
  className?: string;
}

const typeConfig: Record<ValidatorType, { label: string; className: string }> = {
  gherkin: {
    label: 'Gherkin',
    className: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  },
  executable: {
    label: 'Executable',
    className: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  },
  declarative: {
    label: 'Declarative',
    className: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  },
};

/**
 * Badge component for displaying validator type
 */
export function ValidatorTypeBadge({ type, className }: ValidatorTypeBadgeProps) {
  const config = typeConfig[type];

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
