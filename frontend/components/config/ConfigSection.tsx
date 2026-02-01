'use client';

import { cn } from '@/lib/utils';
import type { ConfigValue, ConfigCategory } from '@/types/config';
import { ConfigField } from './ConfigField';
import {
  Thermometer,
  Gauge,
  Timer,
  Layers,
  Shield,
  RotateCcw,
  Activity,
  Zap,
  AlertTriangle,
  FileText,
  Search,
  LineChart,
  Bell,
  Heart,
  FlaskConical,
} from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

interface ConfigSectionProps {
  title: string;
  description?: string;
  configs: ConfigValue[];
  defaultExpanded?: boolean;
  className?: string;
}

/**
 * Category icons
 */
const categoryIcons: Record<string, React.ElementType> = {
  temperature: Thermometer,
  threshold: Gauge,
  timeout: Timer,
  limits: Layers,
  'circuit-breaker': Shield,
  retry: RotateCcw,
  'rate-limit': Activity,
  fallback: Zap,
  constraints: AlertTriangle,
  logging: FileText,
  tracing: Search,
  metrics: LineChart,
  alerting: Bell,
  health: Heart,
  'feature-flag': Zap,
  experimental: FlaskConical,
};

/**
 * ConfigSection component - Groups configurations by category
 */
export function ConfigSection({
  title,
  description,
  configs,
  defaultExpanded = true,
  className,
}: ConfigSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultExpanded);

  if (configs.length === 0) {
    return null;
  }

  // Get icon based on first config's category
  const firstCategory = configs[0]?.category;
  const Icon = categoryIcons[firstCategory] || Layers;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className={cn('', className)}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-lg">{title}</CardTitle>
                  {description && (
                    <CardDescription>{description}</CardDescription>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {configs.length} setting{configs.length !== 1 ? 's' : ''}
                </span>
                <ChevronDown
                  className={cn(
                    'h-5 w-5 text-muted-foreground transition-transform',
                    isOpen && 'rotate-180'
                  )}
                />
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {configs.map((config) => (
              <ConfigField key={`${config.domain}-${config.key}`} config={config} />
            ))}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

/**
 * Group configurations by category
 */
export function groupConfigsByCategory(configs: ConfigValue[]): Map<ConfigCategory, ConfigValue[]> {
  const groups = new Map<ConfigCategory, ConfigValue[]>();

  for (const config of configs) {
    const category = config.category;
    if (!groups.has(category)) {
      groups.set(category, []);
    }
    groups.get(category)!.push(config);
  }

  return groups;
}

/**
 * Category display names
 */
export const categoryNames: Record<ConfigCategory, string> = {
  temperature: 'Temperature Settings',
  threshold: 'Thresholds',
  timeout: 'Timeouts',
  limits: 'Limits',
  'circuit-breaker': 'Circuit Breaker',
  retry: 'Retry Policy',
  'rate-limit': 'Rate Limiting',
  fallback: 'Fallback Behavior',
  constraints: 'Safety Constraints',
  logging: 'Logging',
  tracing: 'Tracing',
  metrics: 'Metrics',
  alerting: 'Alerting',
  health: 'Health Checks',
  'feature-flag': 'Feature Flags',
  experimental: 'Experimental',
};

/**
 * Category descriptions
 */
export const categoryDescriptions: Record<ConfigCategory, string> = {
  temperature: 'Control AI model creativity and randomness',
  threshold: 'Define quality and validation thresholds',
  timeout: 'Configure operation timeouts',
  limits: 'Set resource and processing limits',
  'circuit-breaker': 'Configure failure detection and recovery',
  retry: 'Configure retry attempts and backoff',
  'rate-limit': 'Control request rates',
  fallback: 'Define fallback behavior on failures',
  constraints: 'Safety rules and constraints',
  logging: 'Configure log output and verbosity',
  tracing: 'Configure distributed tracing',
  metrics: 'Configure metrics collection',
  alerting: 'Configure alerting thresholds',
  health: 'Configure health check behavior',
  'feature-flag': 'Enable or disable features',
  experimental: 'Experimental and beta features',
};
