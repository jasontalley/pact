'use client';

import { AppLayout } from '@/components/layout';
import { DashboardStats } from '@/components/dashboard/DashboardStats';
import { EpistemicStackCard } from '@/components/dashboard/EpistemicStackCard';
import { CouplingHealthCard } from '@/components/dashboard/CouplingHealthCard';
import { TrendChart } from '@/components/dashboard/TrendChart';
import { TestQualityCard } from '@/components/dashboard/TestQualityCard';
import { CoverageCard } from '@/components/dashboard/CoverageCard';
import { RecentAtoms } from '@/components/dashboard/RecentAtoms';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { DriftDebtCard } from '@/components/dashboard/DriftDebtCard';
import { CommitmentBacklogCard } from '@/components/dashboard/CommitmentBacklogCard';
import { DriftTrendChart } from '@/components/dashboard/DriftTrendChart';

export default function DashboardPage() {
  return (
    <AppLayout showSidebar={false}>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">
            Overview of your Intent Atoms and system health
          </p>
        </div>

        {/* Epistemic Stack + Coupling Health */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <EpistemicStackCard />
          <CouplingHealthCard />
        </div>

        {/* Test Quality + Coverage */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <TestQualityCard />
          <CoverageCard />
        </div>

        {/* Drift Debt + Commitment Backlog */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <DriftDebtCard />
          <CommitmentBacklogCard />
          <DriftTrendChart />
        </div>

        {/* Trend Chart */}
        <div className="mb-8">
          <TrendChart />
        </div>

        {/* Stats Grid */}
        <DashboardStats />

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
          {/* Recent Atoms - 2 columns */}
          <div className="lg:col-span-2">
            <RecentAtoms />
          </div>

          {/* Quick Actions - 1 column */}
          <div>
            <QuickActions />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
