'use client';

import { useState } from 'react';
import { AppLayout } from '@/components/layout';
import { useLLMUsage, useBudgetStatus, useUsageTrends } from '@/hooks/llm';
import type { UsageQuery, ProviderUsage, ModelUsage, AgentUsage } from '@/types/llm';
import { cn } from '@/lib/utils';
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Cpu,
  Clock,
  Zap,
  Database,
  Activity,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

export default function LLMUsageDashboardPage() {
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');
  const query: UsageQuery = { period };

  const { data: usage, isLoading } = useLLMUsage(query);
  const { dailyUtilization, monthlyUtilization } = useBudgetStatus();

  return (
    <AppLayout showSidebar>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <BarChart3 className="h-8 w-8 text-primary" />
                <h1 className="text-3xl font-bold">LLM Usage Dashboard</h1>
              </div>
              <p className="text-muted-foreground">
                Monitor token usage, costs, and performance across all LLM providers.
              </p>
            </div>
            <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <DashboardSkeleton />
        ) : usage ? (
          <div className="space-y-8">
            {/* Summary Cards */}
            <div className="grid grid-cols-4 gap-4">
              <SummaryCard
                icon={<Zap className="h-5 w-5" />}
                label="Total Requests"
                value={usage.totals.requests.toLocaleString()}
                subtext={`${usage.totals.successfulRequests.toLocaleString()} successful`}
                color="blue"
              />
              <SummaryCard
                icon={<Database className="h-5 w-5" />}
                label="Total Tokens"
                value={formatTokens(usage.totals.totalTokens)}
                subtext={`${formatTokens(usage.totals.inputTokens)} in / ${formatTokens(usage.totals.outputTokens)} out`}
                color="purple"
              />
              <SummaryCard
                icon={<DollarSign className="h-5 w-5" />}
                label="Total Cost"
                value={`$${usage.totals.totalCost.toFixed(2)}`}
                subtext={period === 'day' ? 'Today' : period === 'week' ? 'This week' : 'This month'}
                color="green"
              />
              <SummaryCard
                icon={<Clock className="h-5 w-5" />}
                label="Avg Latency"
                value={`${Math.round(usage.totals.averageLatencyMs)}ms`}
                subtext={`${(usage.totals.cacheHitRate * 100).toFixed(1)}% cache hit`}
                color="orange"
              />
            </div>

            {/* Budget Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Budget Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-8">
                  <BudgetMeter
                    label="Daily Budget"
                    current={usage.budget.dailyCost}
                    limit={usage.budget.dailyLimit}
                    utilization={dailyUtilization}
                  />
                  <BudgetMeter
                    label="Monthly Budget"
                    current={usage.budget.monthlyCost}
                    limit={usage.budget.monthlyLimit}
                    utilization={monthlyUtilization}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Detailed Tabs */}
            <Tabs defaultValue="providers" className="space-y-4">
              <TabsList>
                <TabsTrigger value="providers">By Provider</TabsTrigger>
                <TabsTrigger value="models">By Model</TabsTrigger>
                <TabsTrigger value="agents">By Agent</TabsTrigger>
              </TabsList>

              <TabsContent value="providers">
                <ProviderUsageTable data={usage.byProvider} />
              </TabsContent>

              <TabsContent value="models">
                <ModelUsageTable data={usage.byModel} />
              </TabsContent>

              <TabsContent value="agents">
                <AgentUsageTable data={usage.byAgent} />
              </TabsContent>
            </Tabs>

            {/* Usage Trend Chart Placeholder */}
            <UsageTrendSection />
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            No usage data available for the selected period.
          </div>
        )}
      </div>
    </AppLayout>
  );
}

/**
 * Summary statistic card
 */
function SummaryCard({
  icon,
  label,
  value,
  subtext,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext: string;
  color: 'blue' | 'purple' | 'green' | 'orange';
}) {
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400',
    purple: 'bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400',
    green: 'bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400',
    orange: 'bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400',
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn('p-2 rounded-lg', colorClasses[color])}>
            {icon}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{subtext}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Budget utilization meter
 */
function BudgetMeter({
  label,
  current,
  limit,
  utilization,
}: {
  label: string;
  current: number;
  limit: number;
  utilization: number;
}) {
  const isOverBudget = utilization >= 100;
  const isNearLimit = utilization >= 80;

  return (
    <div className="space-y-2">
      <div className="flex justify-between">
        <span className="font-medium">{label}</span>
        <span className={cn('font-medium', isOverBudget && 'text-red-500')}>
          ${current.toFixed(2)} / ${limit.toFixed(2)}
        </span>
      </div>
      <Progress
        value={Math.min(utilization, 100)}
        className={cn(
          'h-3',
          isOverBudget && '[&>div]:bg-red-500',
          isNearLimit && !isOverBudget && '[&>div]:bg-yellow-500'
        )}
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{utilization.toFixed(1)}% utilized</span>
        {isOverBudget && (
          <Badge variant="destructive" className="text-xs">
            Over Budget
          </Badge>
        )}
        {isNearLimit && !isOverBudget && (
          <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800">
            Near Limit
          </Badge>
        )}
      </div>
    </div>
  );
}

/**
 * Provider usage table
 */
function ProviderUsageTable({ data }: { data: ProviderUsage[] }) {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No provider usage data available.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Provider</TableHead>
            <TableHead className="text-right">Requests</TableHead>
            <TableHead className="text-right">Success Rate</TableHead>
            <TableHead className="text-right">Tokens</TableHead>
            <TableHead className="text-right">Cost</TableHead>
            <TableHead className="text-right">Avg Latency</TableHead>
            <TableHead className="text-right">Cache Hit</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => (
            <TableRow key={row.provider}>
              <TableCell className="font-medium capitalize">{row.provider}</TableCell>
              <TableCell className="text-right">{row.totalRequests.toLocaleString()}</TableCell>
              <TableCell className="text-right">
                <Badge
                  variant={
                    row.successfulRequests / row.totalRequests >= 0.95
                      ? 'default'
                      : row.successfulRequests / row.totalRequests >= 0.8
                        ? 'secondary'
                        : 'destructive'
                  }
                >
                  {((row.successfulRequests / row.totalRequests) * 100).toFixed(1)}%
                </Badge>
              </TableCell>
              <TableCell className="text-right">{formatTokens(row.totalTokens)}</TableCell>
              <TableCell className="text-right font-medium">
                ${row.totalCost.toFixed(2)}
              </TableCell>
              <TableCell className="text-right">{Math.round(row.averageLatencyMs)}ms</TableCell>
              <TableCell className="text-right">
                {(row.cacheHitRate * 100).toFixed(1)}%
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

/**
 * Model usage table
 */
function ModelUsageTable({ data }: { data: ModelUsage[] }) {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No model usage data available.
        </CardContent>
      </Card>
    );
  }

  // Sort by cost descending
  const sorted = [...data].sort((a, b) => b.totalCost - a.totalCost);

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Model</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead className="text-right">Requests</TableHead>
            <TableHead className="text-right">Tokens</TableHead>
            <TableHead className="text-right">Cost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => (
            <TableRow key={`${row.provider}-${row.model}`}>
              <TableCell className="font-medium font-mono text-sm">{row.model}</TableCell>
              <TableCell className="capitalize">{row.provider}</TableCell>
              <TableCell className="text-right">{row.totalRequests.toLocaleString()}</TableCell>
              <TableCell className="text-right">{formatTokens(row.totalTokens)}</TableCell>
              <TableCell className="text-right font-medium">
                ${row.totalCost.toFixed(2)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

/**
 * Agent usage table
 */
function AgentUsageTable({ data }: { data: AgentUsage[] }) {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No agent usage data available.
        </CardContent>
      </Card>
    );
  }

  // Sort by cost descending
  const sorted = [...data].sort((a, b) => b.totalCost - a.totalCost);

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Agent</TableHead>
            <TableHead className="text-right">Requests</TableHead>
            <TableHead className="text-right">Tokens</TableHead>
            <TableHead className="text-right">Cost</TableHead>
            <TableHead className="text-right">Avg Latency</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => (
            <TableRow key={row.agentName}>
              <TableCell className="font-medium">{formatAgentName(row.agentName)}</TableCell>
              <TableCell className="text-right">{row.totalRequests.toLocaleString()}</TableCell>
              <TableCell className="text-right">{formatTokens(row.totalTokens)}</TableCell>
              <TableCell className="text-right font-medium">
                ${row.totalCost.toFixed(2)}
              </TableCell>
              <TableCell className="text-right">{Math.round(row.averageLatencyMs)}ms</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

/**
 * Usage trend section with chart placeholder
 */
function UsageTrendSection() {
  const { data: trends, isLoading } = useUsageTrends();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Usage Trends
        </CardTitle>
        <CardDescription>
          Token usage and cost over time
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : trends ? (
          <div className="h-64 flex items-center justify-center border-2 border-dashed rounded-lg">
            <div className="text-center text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Chart visualization coming soon</p>
              <p className="text-xs mt-1">
                {trends.daily?.length || 0} daily data points available
              </p>
            </div>
          </div>
        ) : (
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            No trend data available
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Dashboard loading skeleton
 */
function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Skeleton className="w-10 h-10 rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-2 gap-8">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </CardContent>
      </Card>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/**
 * Format large token numbers
 */
function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toString();
}

/**
 * Format agent name from snake_case to Title Case
 */
function formatAgentName(name: string): string {
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
