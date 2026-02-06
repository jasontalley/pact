'use client';

import { AppLayout } from '@/components/layout';
import { InvariantList } from '@/components/invariants';
import { Shield, Info } from 'lucide-react';

export default function InvariantSettingsPage() {
  return (
    <AppLayout showSidebar>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Invariant Settings</h1>
          </div>
          <p className="text-muted-foreground">
            Configure the invariant rules that are enforced at commitment time. Invariants
            protect the integrity of your intent atoms by ensuring they meet quality standards.
          </p>
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Understanding Invariants</p>
              <ul className="space-y-1 list-disc list-inside">
                <li><strong>Blocking</strong> invariants prevent commits when violated</li>
                <li><strong>Warning</strong> invariants allow commits but require justification</li>
                <li><strong>Built-in</strong> invariants (INV-001 through INV-009) can be disabled but not deleted</li>
                <li><strong>Custom</strong> invariants can be created for project-specific rules</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Invariant Summary */}
        <InvariantSummary />

        {/* Invariant List */}
        <div className="mt-8">
          <InvariantList />
        </div>
      </div>
    </AppLayout>
  );
}

/**
 * Summary statistics for invariants
 */
function InvariantSummary() {
  return (
    <div className="grid grid-cols-4 gap-4">
      <SummaryCard
        label="Total"
        description="Configured invariants"
        icon={<Shield className="h-6 w-6" />}
      />
      <SummaryCard
        label="Enabled"
        description="Active rules"
        icon={<Shield className="h-6 w-6 text-green-600" />}
      />
      <SummaryCard
        label="Blocking"
        description="Prevent commits"
        icon={<Shield className="h-6 w-6 text-red-600" />}
      />
      <SummaryCard
        label="Warnings"
        description="Allow with justification"
        icon={<Shield className="h-6 w-6 text-yellow-600" />}
      />
    </div>
  );
}

function SummaryCard({
  label,
  description,
  icon,
}: {
  label: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-card border rounded-lg p-4">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-muted rounded-lg">{icon}</div>
        <div>
          <p className="font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}
