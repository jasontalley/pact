'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'vertical' | 'horizontal' | 'both';
}

const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, children, orientation = 'vertical', ...props }, ref) => {
    return (
      <div ref={ref} className={cn('relative overflow-hidden', className)} {...props}>
        <div
          className={cn(
            'h-full w-full',
            orientation === 'vertical' && 'overflow-y-auto overflow-x-hidden',
            orientation === 'horizontal' && 'overflow-x-auto overflow-y-hidden',
            orientation === 'both' && 'overflow-auto'
          )}
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'hsl(var(--muted)) transparent',
          }}
        >
          {children}
        </div>
      </div>
    );
  }
);
ScrollArea.displayName = 'ScrollArea';

const ScrollBar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex touch-none select-none transition-colors', className)}
      {...props}
    />
  )
);
ScrollBar.displayName = 'ScrollBar';

export { ScrollArea, ScrollBar };
