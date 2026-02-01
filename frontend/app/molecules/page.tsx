'use client';

import { useState } from 'react';
import { AppLayout } from '@/components/layout';
import { MoleculeList, CreateMoleculeDialog } from '@/components/molecules';
import { useMoleculeStatistics } from '@/hooks/molecules';
import type { Molecule } from '@/types/molecule';
import { Layers, TrendingUp, GitBranch, CheckCircle } from 'lucide-react';

export default function MoleculesPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const { data: statistics } = useMoleculeStatistics();

  const handleEditMolecule = (molecule: Molecule) => {
    // For now, just navigate to detail page where editing can happen
    window.location.href = `/molecules/${molecule.id}`;
  };

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Layers className="h-8 w-8 text-primary" />
              Molecules
            </h1>
            <p className="text-muted-foreground mt-1">
              Group atoms into meaningful features, stories, and capabilities
            </p>
          </div>
        </div>

        {/* Statistics Cards */}
        {statistics && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-card rounded-lg border p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Layers className="h-4 w-4" />
                <span className="text-sm">Total Molecules</span>
              </div>
              <p className="text-2xl font-bold">{statistics.totalMolecules}</p>
            </div>

            <div className="bg-card rounded-lg border p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <GitBranch className="h-4 w-4" />
                <span className="text-sm">Root Molecules</span>
              </div>
              <p className="text-2xl font-bold">{statistics.rootMoleculeCount}</p>
            </div>

            <div className="bg-card rounded-lg border p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm">Orphan Atoms</span>
              </div>
              <p className="text-2xl font-bold">{statistics.orphanAtomCount}</p>
            </div>

            <div className="bg-card rounded-lg border p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <TrendingUp className="h-4 w-4" />
                <span className="text-sm">Avg Atoms/Molecule</span>
              </div>
              <p className="text-2xl font-bold">
                {statistics.averageAtomsPerMolecule?.toFixed(1) ?? '0'}
              </p>
            </div>
          </div>
        )}

        {/* Molecule List */}
        <div className="bg-card rounded-lg border p-6">
          <MoleculeList
            onCreateMolecule={() => setShowCreateDialog(true)}
            onEditMolecule={handleEditMolecule}
            showMetrics={true}
          />
        </div>

        {/* Create Dialog */}
        <CreateMoleculeDialog
          isOpen={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
        />
      </div>
    </AppLayout>
  );
}
