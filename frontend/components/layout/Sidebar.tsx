'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useTags } from '@/hooks/atoms/use-atoms';
import {
  Filter,
  Search,
  Tag,
  CheckCircle2,
  FileEdit,
  Archive,
  Zap,
  Shield,
  Gauge,
  RefreshCw,
  User,
  Wrench,
  X,
} from 'lucide-react';
import type { AtomStatus, AtomCategory } from '@/types/atom';

const statusOptions: { value: AtomStatus; label: string; icon: React.ReactNode }[] = [
  { value: 'draft', label: 'Draft', icon: <FileEdit className="h-4 w-4" /> },
  { value: 'committed', label: 'Committed', icon: <CheckCircle2 className="h-4 w-4" /> },
  { value: 'superseded', label: 'Superseded', icon: <Archive className="h-4 w-4" /> },
];

const categoryOptions: { value: AtomCategory; label: string; icon: React.ReactNode }[] = [
  { value: 'functional', label: 'Functional', icon: <Zap className="h-4 w-4" /> },
  { value: 'performance', label: 'Performance', icon: <Gauge className="h-4 w-4" /> },
  { value: 'security', label: 'Security', icon: <Shield className="h-4 w-4" /> },
  { value: 'reliability', label: 'Reliability', icon: <RefreshCw className="h-4 w-4" /> },
  { value: 'usability', label: 'Usability', icon: <User className="h-4 w-4" /> },
  { value: 'maintainability', label: 'Maintainability', icon: <Wrench className="h-4 w-4" /> },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen = true, onClose }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { data: tagsData } = useTags();
  const popularTags = tagsData?.tags?.slice(0, 10) ?? [];

  const currentStatus = searchParams.get('status');
  const currentCategory = searchParams.get('category');
  const currentSearch = searchParams.get('search');
  const currentTags = searchParams.getAll('tag');

  const updateFilter = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      // Reset to page 1 when filters change
      params.delete('page');
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams]
  );

  const toggleTag = useCallback(
    (tag: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const tags = params.getAll('tag');
      if (tags.includes(tag)) {
        params.delete('tag');
        tags.filter((t) => t !== tag).forEach((t) => params.append('tag', t));
      } else {
        params.append('tag', tag);
      }
      params.delete('page');
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams]
  );

  const clearAllFilters = useCallback(() => {
    router.push(pathname);
  }, [pathname, router]);

  const hasActiveFilters = currentStatus || currentCategory || currentSearch || currentTags.length > 0;

  if (!isOpen) return null;

  return (
    <aside className="w-64 border-r bg-card h-full overflow-y-auto">
      <div className="p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-semibold">Filters</h2>
          </div>
          {onClose && (
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Search */}
        <div>
          <label className="text-sm font-medium text-muted-foreground block mb-2">
            <Search className="h-4 w-4 inline mr-1" />
            Search
          </label>
          <input
            type="text"
            placeholder="Search atoms..."
            value={currentSearch || ''}
            onChange={(e) => updateFilter('search', e.target.value || null)}
            className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Status Filter */}
        <div>
          <label className="text-sm font-medium text-muted-foreground block mb-2">Status</label>
          <div className="space-y-1">
            {statusOptions.map((option) => (
              <button
                key={option.value}
                onClick={() =>
                  updateFilter('status', currentStatus === option.value ? null : option.value)
                }
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors',
                  currentStatus === option.value
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent'
                )}
              >
                {option.icon}
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Category Filter */}
        <div>
          <label className="text-sm font-medium text-muted-foreground block mb-2">Category</label>
          <div className="space-y-1">
            {categoryOptions.map((option) => (
              <button
                key={option.value}
                onClick={() =>
                  updateFilter('category', currentCategory === option.value ? null : option.value)
                }
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors',
                  currentCategory === option.value
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent'
                )}
              >
                {option.icon}
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tags Filter */}
        {popularTags.length > 0 && (
          <div>
            <label className="text-sm font-medium text-muted-foreground block mb-2">
              <Tag className="h-4 w-4 inline mr-1" />
              Tags
            </label>
            <div className="flex flex-wrap gap-1">
              {popularTags.map(({ tag, count }) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    'px-2 py-1 text-xs rounded-full transition-colors',
                    currentTags.includes(tag)
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted hover:bg-accent'
                  )}
                >
                  {tag}
                  <span className="ml-1 text-muted-foreground">({count})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Clear Filters */}
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-md transition-colors"
          >
            <X className="h-4 w-4" />
            Clear all filters
          </button>
        )}
      </div>
    </aside>
  );
}
