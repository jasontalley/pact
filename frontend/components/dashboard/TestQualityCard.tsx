'use client';

import { useQuery } from '@tanstack/react-query';
import { metricsApi } from '@/lib/api/metrics';
import { Award } from 'lucide-react';

interface TestQualityAggregate {
  averageScore: number;
  totalAnalyzed: number;
  gradeDistribution: {
    A: number;
    B: number;
    C: number;
    D: number;
    F: number;
  };
}

function gradeColor(grade: string): string {
  switch (grade) {
    case 'A': return 'bg-green-500';
    case 'B': return 'bg-blue-500';
    case 'C': return 'bg-yellow-500';
    case 'D': return 'bg-orange-500';
    case 'F': return 'bg-red-500';
    default: return 'bg-gray-500';
  }
}

function gradeTextColor(grade: string): string {
  switch (grade) {
    case 'A': return 'text-green-700';
    case 'B': return 'text-blue-700';
    case 'C': return 'text-yellow-700';
    case 'D': return 'text-orange-700';
    case 'F': return 'text-red-700';
    default: return 'text-gray-700';
  }
}

function scoreToGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

export function TestQualityCard() {
  const { data: trends } = useQuery({
    queryKey: ['metrics', 'trends', 'month'],
    queryFn: () => metricsApi.getTrends('month'),
    staleTime: 60_000,
  });

  // Extract quality data from the latest trend's additionalMetrics
  const latestTrend = trends && trends.length > 0 ? trends[trends.length - 1] : null;
  const qualityData = latestTrend?.additionalMetrics?.testQuality as TestQualityAggregate | undefined;

  if (!qualityData || qualityData.totalAnalyzed === 0) {
    return (
      <div className="bg-card rounded-lg border p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Award className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Test Quality</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          No test quality data available. Run quality analysis to see scores.
        </p>
      </div>
    );
  }

  const avgScore = Math.round(qualityData.averageScore);
  const overallGrade = scoreToGrade(avgScore);
  const grades = ['A', 'B', 'C', 'D', 'F'] as const;
  const total = qualityData.totalAnalyzed;

  return (
    <div className="bg-card rounded-lg border p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Award className="h-5 w-5" />
            Test Quality
          </h3>
          <p className="text-sm text-muted-foreground">
            {total} tests analyzed
          </p>
        </div>
        <div className="text-right">
          <p className={`text-3xl font-bold ${gradeTextColor(overallGrade)}`}>{overallGrade}</p>
          <p className="text-xs text-muted-foreground">{avgScore}/100</p>
        </div>
      </div>

      {/* Grade distribution bar */}
      <div className="mb-4">
        <p className="text-xs text-muted-foreground mb-2">Grade Distribution</p>
        <div className="flex h-4 rounded-full overflow-hidden bg-muted">
          {grades.map((grade) => {
            const count = qualityData.gradeDistribution[grade] || 0;
            const pct = total > 0 ? (count / total) * 100 : 0;
            if (pct === 0) return null;
            return (
              <div
                key={grade}
                className={`${gradeColor(grade)} transition-all duration-500`}
                style={{ width: `${pct}%` }}
                title={`${grade}: ${count} (${Math.round(pct)}%)`}
              />
            );
          })}
        </div>
      </div>

      {/* Grade breakdown */}
      <div className="grid grid-cols-5 gap-2">
        {grades.map((grade) => {
          const count = qualityData.gradeDistribution[grade] || 0;
          return (
            <div key={grade} className="text-center">
              <div className={`text-sm font-bold ${gradeTextColor(grade)}`}>{count}</div>
              <div className="text-xs text-muted-foreground">{grade}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
