'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LayoutDashboard, List, Plus, Menu, X, Settings, Layers, GitCompare, AlertTriangle, MessageSquarePlus, GitPullRequest, CheckSquare } from 'lucide-react';
import { useConflictMetrics } from '@/hooks/conflicts/use-conflicts';
import { usePendingCount } from '@/hooks/atoms/use-atoms';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
}

const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { href: '/atoms', label: 'Atoms', icon: <List className="h-4 w-4" /> },
  { href: '/atoms/pending', label: 'Pending Review', icon: <CheckSquare className="h-4 w-4" /> },
  { href: '/molecules', label: 'Molecules', icon: <Layers className="h-4 w-4" /> },
  { href: '/reconciliation', label: 'Reconciliation', icon: <GitCompare className="h-4 w-4" /> },
  { href: '/interview', label: 'Interview', icon: <MessageSquarePlus className="h-4 w-4" /> },
  { href: '/change-sets', label: 'Change Sets', icon: <GitPullRequest className="h-4 w-4" /> },
  { href: '/conflicts', label: 'Conflicts', icon: <AlertTriangle className="h-4 w-4" /> },
  { href: '/settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> },
];

interface HeaderProps {
  onCreateAtom?: () => void;
}

export function Header({ onCreateAtom }: HeaderProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: conflictMetrics } = useConflictMetrics();
  const { data: pendingCount } = usePendingCount();
  const openConflictCount = conflictMetrics?.open ?? 0;
  const hasContradictions = (conflictMetrics?.byType?.contradiction ?? 0) > 0;
  const pendingReviewCount = pendingCount ?? 0;

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  return (
    <header className="border-b bg-background sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl font-bold text-primary">Pact</span>
          </Link>

          {/* Desktop navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href);
              const isConflicts = item.href === '/conflicts';
              const isPendingReview = item.href === '/atoms/pending';
              const showConflictBadge = isConflicts && openConflictCount > 0;
              const showPendingBadge = isPendingReview && pendingReviewCount > 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors relative',
                    isActive
                      ? 'bg-accent text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  )}
                >
                  {item.icon}
                  {item.label}
                  {showConflictBadge && (
                    <span className={cn(
                      'inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full text-xs font-bold text-white',
                      hasContradictions ? 'bg-red-500' : 'bg-yellow-500',
                    )}>
                      {openConflictCount}
                    </span>
                  )}
                  {showPendingBadge && (
                    <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full text-xs font-bold text-white bg-purple-500">
                      {pendingReviewCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {/* Desktop: New Atom button */}
          {onCreateAtom && (
            <button
              onClick={onCreateAtom}
              className="hidden md:flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>New Atom</span>
            </button>
          )}

          {/* Mobile: Hamburger menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden flex items-center justify-center p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile navigation drawer */}
      <div
        className={cn(
          'md:hidden fixed inset-0 top-[57px] z-40 transition-opacity duration-200',
          mobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      >
        {/* Overlay */}
        <button
          type="button"
          aria-label="Close menu"
          className="absolute inset-0 bg-black/50 cursor-default"
          onClick={() => setMobileMenuOpen(false)}
        />

        {/* Navigation panel */}
        <nav
          className={cn(
            'absolute top-0 right-0 h-full w-64 bg-background shadow-lg transition-transform duration-200',
            mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
          )}
        >
          <div className="p-4 space-y-2">
            {navItems.map((item) => {
              const isActive = item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href);
              const isConflicts = item.href === '/conflicts';
              const isPendingReview = item.href === '/atoms/pending';
              const showConflictBadge = isConflicts && openConflictCount > 0;
              const showPendingBadge = isPendingReview && pendingReviewCount > 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors',
                    isActive
                      ? 'bg-accent text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  )}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.icon}
                  {item.label}
                  {showConflictBadge && (
                    <span className={cn(
                      'inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full text-xs font-bold text-white ml-auto',
                      hasContradictions ? 'bg-red-500' : 'bg-yellow-500',
                    )}>
                      {openConflictCount}
                    </span>
                  )}
                  {showPendingBadge && (
                    <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full text-xs font-bold text-white bg-purple-500 ml-auto">
                      {pendingReviewCount}
                    </span>
                  )}
                </Link>
              );
            })}

            {/* Mobile: New Atom button in menu */}
            {onCreateAtom && (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onCreateAtom();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors mt-4"
              >
                <Plus className="h-4 w-4" />
                New Atom
              </button>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
