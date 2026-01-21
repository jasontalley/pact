'use client';

import { useState, useCallback } from 'react';
import { useLayoutStore } from '@/stores/layout';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { CreateAtomDialog } from '@/components/atoms/CreateAtomDialog';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AppLayoutProps {
  children: React.ReactNode;
  showSidebar?: boolean;
  fullHeight?: boolean;
}

export function AppLayout({ children, showSidebar = true, fullHeight = false }: AppLayoutProps) {
  const { sidebarOpen, toggleSidebar, setSidebarOpen } = useLayoutStore();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const handleCreateAtom = useCallback(() => {
    setCreateDialogOpen(true);
  }, []);

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
                <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
              </div>
            </div>
          </>
        )}

        {/* Main content */}
        <main className={cn('flex-1 overflow-auto', fullHeight && 'h-full')}>
          {children}
        </main>
      </div>

      <CreateAtomDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </div>
  );
}
