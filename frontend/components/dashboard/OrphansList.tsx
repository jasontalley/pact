'use client';

import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { AtomSummary, TestSummary } from '@/lib/api/metrics';

interface OrphansListProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab: 'atoms' | 'tests' | 'code';
  orphanAtoms: AtomSummary[];
  orphanTests: TestSummary[];
  uncoveredFiles: string[];
}

type TabKey = 'atoms' | 'tests' | 'code';

const tabs: { key: TabKey; label: string }[] = [
  { key: 'atoms', label: 'Orphan Atoms' },
  { key: 'tests', label: 'Orphan Tests' },
  { key: 'code', label: 'Uncovered Code' },
];

export function OrphansList({
  open,
  onOpenChange,
  defaultTab,
  orphanAtoms,
  orphanTests,
  uncoveredFiles,
}: OrphansListProps) {
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab);

  // Sync default tab when parent changes it
  if (open && activeTab !== defaultTab) {
    setActiveTab(defaultTab);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Orphans & Gaps</SheetTitle>
          <SheetDescription>
            Items without proper coupling between atoms, tests, and code
          </SheetDescription>
        </SheetHeader>

        {/* Tabs */}
        <div className="flex border-b mt-4 mb-4">
          {tabs.map((tab) => {
            const count =
              tab.key === 'atoms'
                ? orphanAtoms.length
                : tab.key === 'tests'
                  ? orphanTests.length
                  : uncoveredFiles.length;

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex-1 py-2 text-sm font-medium border-b-2 transition-colors',
                  activeTab === tab.key
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="space-y-2">
          {activeTab === 'atoms' && (
            orphanAtoms.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No orphan atoms. All committed atoms have linked tests.
              </p>
            ) : (
              orphanAtoms.map((atom) => (
                <div
                  key={atom.id}
                  className="p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-medium">{atom.atomId}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted">
                      {atom.status}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {atom.description}
                  </p>
                </div>
              ))
            )
          )}

          {activeTab === 'tests' && (
            orphanTests.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No orphan tests. All tests reference atoms.
              </p>
            ) : (
              orphanTests.map((test) => (
                <div
                  key={test.id}
                  className="p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                >
                  <p className="font-mono text-sm truncate">{test.filePath}</p>
                  <p className="text-sm text-muted-foreground mt-1">{test.testName}</p>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted mt-1 inline-block">
                    {test.status}
                  </span>
                </div>
              ))
            )
          )}

          {activeTab === 'code' && (
            uncoveredFiles.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                All source files have atom coverage.
              </p>
            ) : (
              uncoveredFiles.map((filePath) => (
                <div
                  key={filePath}
                  className="p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                >
                  <p className="font-mono text-sm truncate">{filePath}</p>
                </div>
              ))
            )
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
