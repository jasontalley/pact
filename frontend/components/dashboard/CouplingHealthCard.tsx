'use client';

import { useState } from 'react';
import { useCouplingMetrics } from '@/hooks/metrics/use-coupling-metrics';
import { OrphansList } from './OrphansList';
import { Link2, TestTube, FileCode } from 'lucide-react';

function rateColor(rate: number): string {
  if (rate >= 0.8) return 'bg-green-500';
  if (rate >= 0.6) return 'bg-yellow-500';
  return 'bg-red-500';
}

function rateTextColor(rate: number): string {
  if (rate >= 0.8) return 'text-green-700';
  if (rate >= 0.6) return 'text-yellow-700';
  return 'text-red-700';
}

interface CouplingBarProps {
  label: string;
  description: string;
  rate: number;
  icon: React.ReactNode;
  onClick?: () => void;
}

function CouplingBar({ label, description, rate, icon, onClick }: CouplingBarProps) {
  const percent = Math.round(rate * 100);
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left p-3 rounded-lg hover:bg-accent/50 transition-colors"
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium">{label}</span>
        </div>
        <span className={`text-sm font-bold ${rateTextColor(rate)}`}>{percent}%</span>
      </div>
      <p className="text-xs text-muted-foreground mb-2">{description}</p>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${rateColor(rate)}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </button>
  );
}

export function CouplingHealthCard() {
  const { data, isLoading, error } = useCouplingMetrics();
  const [orphansOpen, setOrphansOpen] = useState(false);
  const [orphansTab, setOrphansTab] = useState<'atoms' | 'tests' | 'code'>('atoms');

  if (isLoading) {
    return (
      <div className="bg-card rounded-lg border p-6 shadow-sm animate-pulse">
        <div className="h-6 bg-muted rounded w-48 mb-4" />
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-card rounded-lg border p-6 shadow-sm">
        <p className="text-sm text-muted-foreground">Unable to load coupling metrics</p>
      </div>
    );
  }

  const orphanAtomCount = data.atomTestCoupling.orphanAtoms.length;
  const orphanTestCount = data.testAtomCoupling.orphanTests.length;
  const uncoveredCount = data.codeAtomCoverage.uncoveredFiles.length;

  return (
    <>
      <div className="bg-card rounded-lg border p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Coupling Health</h3>
            <p className="text-sm text-muted-foreground">
              How well atoms, tests, and code are connected
            </p>
          </div>
          {data.atomTestCoupling.averageCouplingStrength != null && (
            <div className="text-right">
              <p className={`text-2xl font-bold ${rateTextColor(data.atomTestCoupling.averageCouplingStrength)}`}>
                {Math.round(data.atomTestCoupling.averageCouplingStrength * 100)}%
              </p>
              <p className="text-xs text-muted-foreground">Avg Strength</p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <CouplingBar
            label="Atom → Test"
            description={`${data.atomTestCoupling.atomsWithTests} of ${data.atomTestCoupling.totalAtoms} atoms have linked tests`}
            rate={data.atomTestCoupling.rate}
            icon={<Link2 className="h-4 w-4 text-muted-foreground" />}
            onClick={() => { setOrphansTab('atoms'); setOrphansOpen(true); }}
          />
          <CouplingBar
            label="Test → Atom"
            description={`${data.testAtomCoupling.testsWithAtoms} of ${data.testAtomCoupling.totalTests} tests reference atoms`}
            rate={data.testAtomCoupling.rate}
            icon={<TestTube className="h-4 w-4 text-muted-foreground" />}
            onClick={() => { setOrphansTab('tests'); setOrphansOpen(true); }}
          />
          <CouplingBar
            label="Code → Atom"
            description={`${data.codeAtomCoverage.filesWithAtoms} of ${data.codeAtomCoverage.totalSourceFiles} files have atom coverage`}
            rate={data.codeAtomCoverage.rate}
            icon={<FileCode className="h-4 w-4 text-muted-foreground" />}
            onClick={() => { setOrphansTab('code'); setOrphansOpen(true); }}
          />
        </div>

        {/* Strength distribution */}
        {data.atomTestCoupling.strengthDistribution && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-xs text-muted-foreground mb-2">Coupling Strength Distribution</p>
            <div className="flex gap-4 text-xs">
              <span className="text-green-700">
                Strong: {data.atomTestCoupling.strengthDistribution.strong}
              </span>
              <span className="text-yellow-700">
                Moderate: {data.atomTestCoupling.strengthDistribution.moderate}
              </span>
              <span className="text-red-700">
                Weak: {data.atomTestCoupling.strengthDistribution.weak}
              </span>
            </div>
          </div>
        )}

        {/* Summary line */}
        {(orphanAtomCount > 0 || orphanTestCount > 0 || uncoveredCount > 0) && (
          <div className="mt-4 pt-4 border-t">
            <button
              type="button"
              onClick={() => setOrphansOpen(true)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Orphan Atoms: {orphanAtomCount} | Orphan Tests: {orphanTestCount} | Uncovered: {uncoveredCount}
            </button>
          </div>
        )}
      </div>

      <OrphansList
        open={orphansOpen}
        onOpenChange={setOrphansOpen}
        defaultTab={orphansTab}
        orphanAtoms={data.atomTestCoupling.orphanAtoms}
        orphanTests={data.testAtomCoupling.orphanTests}
        uncoveredFiles={data.codeAtomCoverage.uncoveredFiles}
      />
    </>
  );
}
