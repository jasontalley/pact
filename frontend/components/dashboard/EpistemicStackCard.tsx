'use client';

import { useEpistemicMetrics } from '@/hooks/metrics/use-epistemic-metrics';
import { ShieldCheck, GitCommitHorizontal, Lightbulb, HelpCircle } from 'lucide-react';

const levels = [
  {
    key: 'proven' as const,
    label: 'Proven',
    description: 'Atoms with linked, accepted tests',
    color: 'bg-green-500',
    textColor: 'text-green-700',
    bgLight: 'bg-green-50',
    icon: ShieldCheck,
  },
  {
    key: 'committed' as const,
    label: 'Committed',
    description: 'Committed atoms without test evidence',
    color: 'bg-blue-500',
    textColor: 'text-blue-700',
    bgLight: 'bg-blue-50',
    icon: GitCommitHorizontal,
  },
  {
    key: 'inferred' as const,
    label: 'Inferred',
    description: 'Recommendations pending review',
    color: 'bg-amber-500',
    textColor: 'text-amber-700',
    bgLight: 'bg-amber-50',
    icon: Lightbulb,
  },
];

export function EpistemicStackCard() {
  const { data, isLoading, error } = useEpistemicMetrics();

  if (isLoading) {
    return (
      <div className="bg-card rounded-lg border p-6 shadow-sm animate-pulse">
        <div className="h-6 bg-muted rounded w-48 mb-4" />
        <div className="h-8 bg-muted rounded w-24 mb-6" />
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 bg-muted rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-card rounded-lg border p-6 shadow-sm">
        <p className="text-sm text-muted-foreground">Unable to load epistemic metrics</p>
      </div>
    );
  }

  const certaintyPercent = Math.round(data.totalCertainty * 100);
  const qualityWeightedPercent = data.qualityWeightedCertainty != null
    ? Math.round(data.qualityWeightedCertainty * 100)
    : null;

  return (
    <div className="bg-card rounded-lg border p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">Epistemic Stack</h3>
          <p className="text-sm text-muted-foreground">
            What your system knows and how confidently
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold">{certaintyPercent}%</p>
          <p className="text-xs text-muted-foreground">Certainty</p>
          {qualityWeightedPercent != null && qualityWeightedPercent !== certaintyPercent && (
            <p className="text-xs text-muted-foreground">
              {qualityWeightedPercent}% quality-weighted
            </p>
          )}
        </div>
      </div>

      {/* Stacked bar with proven sub-segments */}
      <div className="flex h-3 rounded-full overflow-hidden bg-muted mb-6">
        {data.proven.percentage > 0 && data.provenBreakdown && (
          <>
            {data.provenBreakdown.highConfidence.percentage > 0 && (
              <div
                className="bg-green-600 transition-all duration-500"
                style={{ width: `${data.provenBreakdown.highConfidence.percentage * data.proven.percentage * 100}%` }}
                title={`High confidence: ${data.provenBreakdown.highConfidence.count}`}
              />
            )}
            {data.provenBreakdown.mediumConfidence.percentage > 0 && (
              <div
                className="bg-green-400 transition-all duration-500"
                style={{ width: `${data.provenBreakdown.mediumConfidence.percentage * data.proven.percentage * 100}%` }}
                title={`Medium confidence: ${data.provenBreakdown.mediumConfidence.count}`}
              />
            )}
            {data.provenBreakdown.lowConfidence.percentage > 0 && (
              <div
                className="bg-green-300 transition-all duration-500"
                style={{ width: `${data.provenBreakdown.lowConfidence.percentage * data.proven.percentage * 100}%` }}
                title={`Low confidence: ${data.provenBreakdown.lowConfidence.count}`}
              />
            )}
          </>
        )}
        {data.proven.percentage > 0 && !data.provenBreakdown && (
          <div
            className="bg-green-500 transition-all duration-500"
            style={{ width: `${data.proven.percentage * 100}%` }}
          />
        )}
        {data.committed.percentage > 0 && (
          <div
            className="bg-blue-500 transition-all duration-500"
            style={{ width: `${data.committed.percentage * 100}%` }}
          />
        )}
        {data.inferred.percentage > 0 && (
          <div
            className="bg-amber-500 transition-all duration-500"
            style={{ width: `${data.inferred.percentage * 100}%` }}
          />
        )}
      </div>

      {/* Level details */}
      <div className="space-y-3">
        {levels.map((level) => {
          const value = data[level.key];
          return (
            <div
              key={level.key}
              className={`flex items-center justify-between p-3 rounded-lg ${level.bgLight}`}
            >
              <div className="flex items-center gap-3">
                <level.icon className={`h-5 w-5 ${level.textColor}`} />
                <div>
                  <p className={`text-sm font-medium ${level.textColor}`}>{level.label}</p>
                  <p className="text-xs text-muted-foreground">{level.description}</p>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-lg font-bold ${level.textColor}`}>{value.count}</p>
                <p className="text-xs text-muted-foreground">
                  {Math.round(value.percentage * 100)}%
                </p>
              </div>
            </div>
          );
        })}

        {/* Unknown level */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
          <div className="flex items-center gap-3">
            <HelpCircle className="h-5 w-5 text-gray-500" />
            <div>
              <p className="text-sm font-medium text-gray-600">Unknown</p>
              <p className="text-xs text-muted-foreground">Gaps in knowledge</p>
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>{data.unknown.orphanTestsCount} orphan tests</p>
            <p>{data.unknown.uncoveredCodeFilesCount} uncovered files</p>
          </div>
        </div>
      </div>
    </div>
  );
}
