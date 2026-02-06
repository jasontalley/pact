'use client';

import { cn } from '@/lib/utils';
import type { AtomStatus } from '@/types/atom';

interface StatusBadgeProps {
  status: AtomStatus;
  className?: string;
}

const statusConfig: Record<
  AtomStatus,
  { label: string; className: string }
> = {
  proposed: {
    label: 'Proposed',
    className: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  },
  draft: {
    label: 'Draft',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  },
  committed: {
    label: 'Committed',
    className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  },
  superseded: {
    label: 'Superseded',
    className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  },
  abandoned: {
    label: 'Abandoned',
    className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  },
};

/**
 * Badge component for displaying atom status
 */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];

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
