'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { AppLayout } from '@/components/layout';
import { useAtoms } from '@/hooks/atoms/use-atoms';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { QualityBadge } from '@/components/quality/QualityBadge';
import { formatDistanceToNow } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import type { AtomStatus, AtomCategory, AtomScope } from '@/types/atom';

function AtomsListContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Get filter values from URL (managed by Sidebar)
  const status = searchParams.get('status') as AtomStatus | null;
  const category = searchParams.get('category') as AtomCategory | null;
  const scope = (searchParams.get('scope') as AtomScope) || 'all';
  const search = searchParams.get('search') || undefined;
  const tags = searchParams.getAll('tag');
  const page = parseInt(searchParams.get('page') || '1', 10);

  const { data, isLoading, error } = useAtoms({
    status: status || undefined,
    category: category || undefined,
    scope,
    search,
    tags: tags.length > 0 ? tags : undefined,
    page,
    limit: 20,
    sortBy: 'createdAt',
    sortOrder: 'DESC',
  });

  // Handle scope change
  const handleScopeChange = (newScope: AtomScope) => {
    const params = new URLSearchParams(searchParams.toString());
    if (newScope === 'all') {
      params.delete('scope');
    } else {
      params.set('scope', newScope);
    }
    params.delete('page'); // Reset pagination on scope change
    router.push(`${pathname}?${params.toString()}`);
  };

  const atoms = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <AppLayout showSidebar>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Intent Atoms</h2>
            <p className="text-muted-foreground">
              Browse and filter all intent atoms
            </p>
          </div>
          {/* Scope Toggle */}
          <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
            {([
              { value: 'all', label: 'All' },
              { value: 'main', label: 'Main' },
              { value: 'proposed', label: 'Proposed' },
            ] as const).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => handleScopeChange(value)}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                  scope === value
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-24 bg-muted rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-12 text-destructive">
            Failed to load atoms
          </div>
        ) : atoms.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No atoms found matching your criteria
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              Showing {atoms.length} of {total} atoms
            </p>

            <div className="space-y-3">
              {atoms.map((atom) => (
                <Link
                  key={atom.id}
                  href={`/atoms/${atom.id}`}
                  className="block bg-card rounded-lg border p-4 hover:bg-accent transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-mono text-sm font-semibold">
                          {atom.atomId}
                        </span>
                        <StatusBadge status={atom.status} />
                        <span className="text-xs text-muted-foreground capitalize">
                          {atom.category}
                        </span>
                      </div>
                      <p className="text-sm text-foreground mb-2">
                        {atom.description}
                      </p>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-muted-foreground">
                          Created {formatDistanceToNow(new Date(atom.createdAt))}
                        </span>
                        {atom.tags.length > 0 && (
                          <div className="flex gap-1">
                            {atom.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="text-xs bg-muted px-1.5 py-0.5 rounded"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="ml-4">
                      <QualityBadge score={atom.qualityScore} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-6">
                {page > 1 && (
                  <Link
                    href={`/atoms?page=${page - 1}`}
                    className="px-3 py-1 border rounded hover:bg-accent"
                  >
                    Previous
                  </Link>
                )}
                <span className="px-3 py-1">
                  Page {page} of {totalPages}
                </span>
                {page < totalPages && (
                  <Link
                    href={`/atoms?page=${page + 1}`}
                    className="px-3 py-1 border rounded hover:bg-accent"
                  >
                    Next
                  </Link>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}

function AtomsListSkeleton() {
  return (
    <AppLayout showSidebar>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="h-9 w-48 bg-muted animate-pulse rounded" />
            <div className="h-5 w-64 bg-muted animate-pulse rounded mt-2" />
          </div>
        </div>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    </AppLayout>
  );
}

export default function AtomsListPage() {
  return (
    <Suspense fallback={<AtomsListSkeleton />}>
      <AtomsListContent />
    </Suspense>
  );
}
