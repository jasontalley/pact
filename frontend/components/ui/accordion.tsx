'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';

interface AccordionContextValue {
  value: string | string[];
  onValueChange: (value: string) => void;
  type: 'single' | 'multiple';
}

const AccordionContext = React.createContext<AccordionContextValue | undefined>(undefined);

function useAccordionContext() {
  const context = React.useContext(AccordionContext);
  if (!context) {
    throw new Error('Accordion components must be used within an Accordion');
  }
  return context;
}

interface AccordionSingleProps extends React.HTMLAttributes<HTMLDivElement> {
  type: 'single';
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  collapsible?: boolean;
}

interface AccordionMultipleProps extends React.HTMLAttributes<HTMLDivElement> {
  type: 'multiple';
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
}

type AccordionProps = AccordionSingleProps | AccordionMultipleProps;

const Accordion = React.forwardRef<HTMLDivElement, AccordionProps>(
  ({ type, value, defaultValue, onValueChange, className, children, ...props }, ref) => {
    const [internalValue, setInternalValue] = React.useState<string | string[]>(
      defaultValue || (type === 'multiple' ? [] : '')
    );

    const currentValue = value !== undefined ? value : internalValue;

    const handleValueChange = React.useCallback(
      (itemValue: string) => {
        if (type === 'single') {
          const newValue = currentValue === itemValue ? '' : itemValue;
          setInternalValue(newValue);
          (onValueChange as ((value: string) => void) | undefined)?.(newValue);
        } else {
          const currentArray = currentValue as string[];
          const newValue = currentArray.includes(itemValue)
            ? currentArray.filter((v) => v !== itemValue)
            : [...currentArray, itemValue];
          setInternalValue(newValue);
          (onValueChange as ((value: string[]) => void) | undefined)?.(newValue);
        }
      },
      [type, currentValue, onValueChange]
    );

    return (
      <AccordionContext.Provider
        value={{ value: currentValue, onValueChange: handleValueChange, type }}
      >
        <div ref={ref} className={className} {...props}>
          {children}
        </div>
      </AccordionContext.Provider>
    );
  }
);
Accordion.displayName = 'Accordion';

interface AccordionItemContextValue {
  value: string;
  isOpen: boolean;
}

const AccordionItemContext = React.createContext<AccordionItemContextValue | undefined>(undefined);

function useAccordionItemContext() {
  const context = React.useContext(AccordionItemContext);
  if (!context) {
    throw new Error('AccordionItem components must be used within an AccordionItem');
  }
  return context;
}

interface AccordionItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

const AccordionItem = React.forwardRef<HTMLDivElement, AccordionItemProps>(
  ({ value, className, children, ...props }, ref) => {
    const { value: accordionValue, type } = useAccordionContext();

    const isOpen =
      type === 'single' ? accordionValue === value : (accordionValue as string[]).includes(value);

    return (
      <AccordionItemContext.Provider value={{ value, isOpen }}>
        <div ref={ref} className={cn('border-b', className)} {...props}>
          {children}
        </div>
      </AccordionItemContext.Provider>
    );
  }
);
AccordionItem.displayName = 'AccordionItem';

const AccordionTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, ...props }, ref) => {
  const { onValueChange } = useAccordionContext();
  const { value, isOpen } = useAccordionItemContext();

  return (
    <h3 className="flex">
      <button
        ref={ref}
        type="button"
        aria-expanded={isOpen}
        className={cn(
          'flex flex-1 items-center justify-between py-4 font-medium transition-all hover:underline [&[data-state=open]>svg]:rotate-180',
          className
        )}
        data-state={isOpen ? 'open' : 'closed'}
        onClick={() => onValueChange(value)}
        {...props}
      >
        {children}
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
      </button>
    </h3>
  );
});
AccordionTrigger.displayName = 'AccordionTrigger';

const AccordionContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const { isOpen } = useAccordionItemContext();

    return (
      <div
        ref={ref}
        className={cn(
          'overflow-hidden text-sm transition-all',
          isOpen ? 'animate-accordion-down' : 'animate-accordion-up hidden'
        )}
        {...props}
      >
        <div className={cn('pb-4 pt-0', className)}>{children}</div>
      </div>
    );
  }
);
AccordionContent.displayName = 'AccordionContent';

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
