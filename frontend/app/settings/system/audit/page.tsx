'use client';

import { useState } from 'react';
import { AppLayout } from '@/components/layout';
import { useConfigAuditLog } from '@/hooks/config';
import type { AuditLogFilters, ConfigDomain } from '@/types/config';
import { cn } from '@/lib/utils';
import {
  History,
  ArrowLeft,
  Filter,
  Calendar,
  User,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Database,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';

const DOMAINS: ConfigDomain[] = ['agent', 'resilience', 'safety', 'observability', 'features'];
const PAGE_SIZE = 20;

export default function AuditLogPage() {
  const [filters, setFilters] = useState<AuditLogFilters>({
    limit: PAGE_SIZE,
    offset: 0,
  });

  const { data, isLoading, refetch, isFetching } = useConfigAuditLog(filters);

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;
  const currentPage = Math.floor((filters.offset || 0) / PAGE_SIZE) + 1;

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({
      ...prev,
      offset: (page - 1) * PAGE_SIZE,
    }));
  };

  const handleFilterChange = (key: keyof AuditLogFilters, value: string | undefined) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value || undefined,
      offset: 0, // Reset to first page on filter change
    }));
  };

  return (
    <AppLayout showSidebar>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-2">
            <Link href="/settings/system">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            </Link>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <History className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-3xl font-bold">Configuration Audit Log</h1>
                <p className="text-muted-foreground">
                  Track all configuration changes across the system.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={cn('h-4 w-4 mr-2', isFetching && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">Filters</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Domain Filter */}
              <div className="space-y-2">
                <Label>Domain</Label>
                <Select
                  value={filters.domain || 'all'}
                  onValueChange={(v) =>
                    handleFilterChange('domain', v === 'all' ? undefined : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All domains" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All domains</SelectItem>
                    {DOMAINS.map((domain) => (
                      <SelectItem key={domain} value={domain}>
                        {domain.charAt(0).toUpperCase() + domain.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Key Filter */}
              <div className="space-y-2">
                <Label>Key</Label>
                <Input
                  placeholder="Filter by key..."
                  value={filters.key || ''}
                  onChange={(e) => handleFilterChange('key', e.target.value)}
                />
              </div>

              {/* Changed By Filter */}
              <div className="space-y-2">
                <Label>Changed By</Label>
                <Input
                  placeholder="Filter by user..."
                  value={filters.changedBy || ''}
                  onChange={(e) => handleFilterChange('changedBy', e.target.value)}
                />
              </div>

              {/* Date Range */}
              <div className="space-y-2">
                <Label>Date Range</Label>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={filters.startDate || ''}
                    onChange={(e) => handleFilterChange('startDate', e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    type="date"
                    value={filters.endDate || ''}
                    onChange={(e) => handleFilterChange('endDate', e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                Audit Entries
                {data && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({data.total} total)
                  </span>
                )}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <AuditTableSkeleton />
            ) : data && data.items.length > 0 ? (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-40">Timestamp</TableHead>
                      <TableHead className="w-24">Domain</TableHead>
                      <TableHead className="w-48">Key</TableHead>
                      <TableHead>Old Value</TableHead>
                      <TableHead>New Value</TableHead>
                      <TableHead className="w-24">Changed By</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono text-xs">
                          {new Date(entry.changedAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{entry.domain}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{entry.key}</TableCell>
                        <TableCell className="font-mono text-xs max-w-32 truncate">
                          {entry.newValue === null ? (
                            <span className="text-muted-foreground">{formatValue(entry.oldValue)}</span>
                          ) : (
                            formatValue(entry.oldValue)
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs max-w-32 truncate">
                          {entry.newValue === null ? (
                            <Badge variant="secondary" className="gap-1">
                              <RotateCcw className="h-3 w-3" />
                              Reset
                            </Badge>
                          ) : (
                            <span className="text-green-600 dark:text-green-400">
                              {formatValue(entry.newValue)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm">{entry.changedBy}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-48 truncate">
                          {entry.changeReason || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <p className="text-sm text-muted-foreground">
                      Showing {(currentPage - 1) * PAGE_SIZE + 1} to{' '}
                      {Math.min(currentPage * PAGE_SIZE, data.total)} of {data.total} entries
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <span className="text-sm">
                        Page {currentPage} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No audit entries found.</p>
                <p className="text-sm">Configuration changes will appear here.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

/**
 * Format a value for display
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Loading skeleton for audit table
 */
function AuditTableSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex gap-4 py-3 border-b">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-48" />
        </div>
      ))}
    </div>
  );
}
