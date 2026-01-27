'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface TooltipProviderProps {
  children: React.ReactNode;
  delayDuration?: number;
}

const TooltipContext = React.createContext<{ delayDuration: number }>({ delayDuration: 200 });

const TooltipProvider = ({
  children,
  delayDuration = 200,
}: TooltipProviderProps) => {
  const contextValue = React.useMemo(() => ({ delayDuration }), [delayDuration]);

  return (
    <TooltipContext.Provider value={contextValue}>
      {children}
    </TooltipContext.Provider>
  );
};

interface TooltipState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const TooltipStateContext = React.createContext<TooltipState | undefined>(undefined);

function useTooltipState() {
  const context = React.useContext(TooltipStateContext);
  if (!context) {
    throw new Error('Tooltip components must be used within a Tooltip');
  }
  return context;
}

interface TooltipProps {
  children: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const Tooltip = ({ children, open, defaultOpen = false, onOpenChange }: TooltipProps) => {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;

  const setOpen = React.useCallback(
    (newOpen: boolean) => {
      if (!isControlled) {
        setInternalOpen(newOpen);
      }
      onOpenChange?.(newOpen);
    },
    [isControlled, onOpenChange]
  );

  const stateContextValue = React.useMemo(
    () => ({ open: isOpen, setOpen }),
    [isOpen, setOpen]
  );

  return (
    <TooltipStateContext.Provider value={stateContextValue}>
      <div className="relative inline-block">{children}</div>
    </TooltipStateContext.Provider>
  );
};

const TooltipTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }>(
  ({ children, asChild, onMouseEnter, onMouseLeave, onFocus, onBlur, ...props }, ref) => {
    const { setOpen } = useTooltipState();
    const { delayDuration } = React.useContext(TooltipContext);
    const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

    const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
      onMouseEnter?.(e);
      timeoutRef.current = setTimeout(() => setOpen(true), delayDuration);
    };

    const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
      onMouseLeave?.(e);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setOpen(false);
    };

    const handleFocus = (e: React.FocusEvent<HTMLButtonElement>) => {
      onFocus?.(e);
      setOpen(true);
    };

    const handleBlur = (e: React.FocusEvent<HTMLButtonElement>) => {
      onBlur?.(e);
      setOpen(false);
    };

    React.useEffect(() => {
      return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };
    }, []);

    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children as React.ReactElement<{
        onMouseEnter?: React.MouseEventHandler;
        onMouseLeave?: React.MouseEventHandler;
        onFocus?: React.FocusEventHandler;
        onBlur?: React.FocusEventHandler;
      }>, {
        onMouseEnter: handleMouseEnter,
        onMouseLeave: handleMouseLeave,
        onFocus: handleFocus,
        onBlur: handleBlur,
      });
    }

    return (
      <button
        ref={ref}
        type="button"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...props}
      >
        {children}
      </button>
    );
  }
);
TooltipTrigger.displayName = 'TooltipTrigger';

const TooltipContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { sideOffset?: number }>(
  ({ className, sideOffset = 4, ...props }, ref) => {
    const { open } = useTooltipState();

    if (!open) return null;

    return (
      <div
        ref={ref}
        role="tooltip"
        className={cn(
          'absolute z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 bottom-full left-1/2 -translate-x-1/2',
          className
        )}
        style={{ marginBottom: sideOffset }}
        {...props}
      />
    );
  }
);
TooltipContent.displayName = 'TooltipContent';

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
