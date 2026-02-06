'use client';

import { useState } from 'react';
import { AppLayout } from '@/components/layout';
import { useSystemConfig } from '@/hooks/config';
import {
  ConfigSection,
  groupConfigsByCategory,
  categoryNames,
  categoryDescriptions,
} from '@/components/config';
import type { ConfigDomain, ConfigCategory, ConfigValue } from '@/types/config';
import { cn } from '@/lib/utils';
import {
  Settings,
  Bot,
  Shield,
  ShieldAlert,
  Activity,
  Zap,
  Info,
  History,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

/**
 * Domain metadata for tabs
 */
const domainInfo: Record<
  ConfigDomain,
  { name: string; description: string; icon: React.ElementType }
> = {
  agent: {
    name: 'Agent',
    description: 'AI agent temperatures, thresholds, and timeouts',
    icon: Bot,
  },
  resilience: {
    name: 'Resilience',
    description: 'Circuit breakers, retries, and rate limits',
    icon: Shield,
  },
  safety: {
    name: 'Safety',
    description: 'Safety constraints and validation rules',
    icon: ShieldAlert,
  },
  observability: {
    name: 'Observability',
    description: 'Logging, tracing, and metrics',
    icon: Activity,
  },
  features: {
    name: 'Features',
    description: 'Feature flags and experimental settings',
    icon: Zap,
  },
};

export default function SystemSettingsPage() {
  const [activeTab, setActiveTab] = useState<ConfigDomain>('agent');
  const { data: config, isLoading, error } = useSystemConfig();

  return (
    <AppLayout showSidebar>
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <Settings className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold">System Configuration</h1>
            </div>
            <Link href="/settings/system/audit">
              <Button variant="outline" size="sm">
                <History className="h-4 w-4 mr-2" />
                Audit Log
              </Button>
            </Link>
          </div>
          <p className="text-muted-foreground">
            Configure system-wide settings for agents, resilience, safety, observability, and
            features.
          </p>
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8 dark:bg-blue-950 dark:border-blue-800">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div className="text-sm text-blue-800 dark:text-blue-200">
              <p className="font-medium mb-1">Configuration Hierarchy</p>
              <p>
                Settings follow a layered pattern:{' '}
                <strong>UI Override</strong> (highest priority) →{' '}
                <strong>Environment Variable</strong> →{' '}
                <strong>Code Default</strong> (lowest priority).
                Changes made here create UI overrides that take precedence over environment
                variables.
              </p>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && <SettingsSkeleton />}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 dark:bg-red-950 dark:border-red-800">
            <p className="text-red-800 dark:text-red-200">
              Failed to load configuration: {(error as Error).message}
            </p>
          </div>
        )}

        {/* Settings Tabs */}
        {config && (
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as ConfigDomain)}
            className="space-y-6"
          >
            <TabsList className="grid w-full grid-cols-5">
              {(Object.keys(domainInfo) as ConfigDomain[]).map((domain) => {
                const info = domainInfo[domain];
                const Icon = info.icon;
                const count = config[domain]?.length || 0;
                return (
                  <TabsTrigger
                    key={domain}
                    value={domain}
                    className="flex items-center gap-2"
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{info.name}</span>
                    <span className="text-xs text-muted-foreground">({count})</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {(Object.keys(domainInfo) as ConfigDomain[]).map((domain) => {
              const info = domainInfo[domain];
              const configs = config[domain] || [];
              const grouped = groupConfigsByCategory(configs);

              return (
                <TabsContent key={domain} value={domain} className="space-y-4">
                  {/* Domain Header */}
                  <div className="mb-6">
                    <h2 className="text-xl font-semibold">{info.name} Settings</h2>
                    <p className="text-muted-foreground">{info.description}</p>
                  </div>

                  {/* Grouped Sections */}
                  {Array.from(grouped.entries()).map(([category, categoryConfigs]) => (
                    <ConfigSection
                      key={category}
                      title={categoryNames[category] || category}
                      description={categoryDescriptions[category]}
                      configs={categoryConfigs}
                      defaultExpanded={true}
                    />
                  ))}

                  {configs.length === 0 && (
                    <Card>
                      <CardContent className="py-8 text-center text-muted-foreground">
                        No configurations available for this domain.
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </div>
    </AppLayout>
  );
}

/**
 * Loading skeleton
 */
function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Tabs skeleton */}
      <div className="grid w-full grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>

      {/* Content skeleton */}
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Skeleton className="h-5 w-5" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-48" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {[1, 2, 3].map((j) => (
                <div key={j} className="py-4 border-b last:border-b-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-40" />
                      <Skeleton className="h-4 w-64" />
                    </div>
                    <Skeleton className="h-10 w-32" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
