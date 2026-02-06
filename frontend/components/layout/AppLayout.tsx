'use client';

import { Suspense, useCallback } from 'react';
import { useLayoutStore } from '@/stores/layout';
import { useRefinementWizardStore } from '@/stores/refinement-wizard';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { AgentButton } from '@/components/agents/AgentPanel';
import { AgentChatButton } from '@/components/agents/AgentChat';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

function SidebarSkeleton() {
  return (
    <aside className="w-64 border-r bg-card h-full overflow-y-auto">
      <div className="p-4 space-y-6">
        <div className="h-6 w-20 bg-muted animate-pulse rounded" />
        <div className="h-10 bg-muted animate-pulse rounded" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 bg-muted animate-pulse rounded" />
          ))}
        </div>
      </div>
    </aside>
  );
}

interface AppLayoutProps {
  children: React.ReactNode;
  showSidebar?: boolean;
  fullHeight?: boolean;
}

export function AppLayout({ children, showSidebar = true, fullHeight = false }: AppLayoutProps) {
  const { sidebarOpen, toggleSidebar, setSidebarOpen } = useLayoutStore();
  const openWizard = useRefinementWizardStore((state) => state.openWizard);

  const handleCreateAtom = useCallback(() => {
    openWizard();
  }, [openWizard]);

  return (
    <div className={cn('min-h-screen bg-background flex flex-col', fullHeight && 'h-screen')}>
      <Header onCreateAtom={handleCreateAtom} />

      <div className="flex flex-1 overflow-hidden">
        {showSidebar && (
          <>
            {/* Mobile sidebar toggle */}
            <button
              onClick={toggleSidebar}
              className="md:hidden fixed bottom-4 left-4 z-50 bg-primary text-primary-foreground p-3 rounded-full shadow-lg"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Sidebar - hidden on mobile unless open */}
            <div
              className={cn(
                'fixed md:static inset-0 z-40 transition-transform duration-200 md:translate-x-0',
                sidebarOpen ? 'translate-x-0' : '-translate-x-full'
              )}
            >
              {/* Mobile overlay */}
              <div
                className={cn(
                  'fixed inset-0 bg-black/50 md:hidden transition-opacity',
                  sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
                )}
                onClick={() => setSidebarOpen(false)}
              />

              {/* Sidebar content */}
              <div className="relative h-full md:h-auto">
                <Suspense fallback={<SidebarSkeleton />}>
                  <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
                </Suspense>
              </div>
            </div>
          </>
        )}

        {/* Main content */}
        <main className={cn('flex-1 overflow-auto', fullHeight && 'h-full')}>
          {children}
        </main>
      </div>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
        <AgentChatButton />
        <AgentButton />
      </div>
    </div>
  );
}
