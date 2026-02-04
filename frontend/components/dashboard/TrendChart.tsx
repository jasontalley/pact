'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { metricsApi, MetricsTrend } from '@/lib/api/metrics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, TrendingUp } from 'lucide-react';

type Period = 'week' | 'month' | 'quarter';

export function TrendChart() {
  const [period, setPeriod] = useState<Period>('month');

  const { data: trends, isLoading } = useQuery({
    queryKey: ['metrics', 'trends', period],
    queryFn: () => metricsApi.getTrends(period),
  });

  const extractCertainty = (trend: MetricsTrend): number => {
    const em = trend.epistemicMetrics as { totalCertainty?: number; certaintyPercentage?: number; levels?: { proven?: { count: number }; committed?: { count: number }; inferred?: { count: number }; unknown?: { count: number } } };
    if (em.totalCertainty != null) return em.totalCertainty * 100;
    if (em.certaintyPercentage != null) return em.certaintyPercentage;
    if (em.levels) {
      const total = (em.levels.proven?.count ?? 0) + (em.levels.committed?.count ?? 0) + (em.levels.inferred?.count ?? 0) + (em.levels.unknown?.count ?? 0);
      if (total === 0) return 0;
      return ((em.levels.proven?.count ?? 0) + (em.levels.committed?.count ?? 0)) / total * 100;
    }
    return 0;
  };

  const extractQualityWeightedCertainty = (trend: MetricsTrend): number | null => {
    const am = trend.additionalMetrics as { qualityWeightedCertainty?: number } | null;
    if (am?.qualityWeightedCertainty != null) return am.qualityWeightedCertainty * 100;
    return null;
  };

  const renderChart = (data: MetricsTrend[]) => {
    if (data.length === 0) return <p className="text-sm text-muted-foreground text-center py-4">No data available for this period.</p>;

    const values = data.map(extractCertainty);
    const qwValues = data.map(extractQualityWeightedCertainty);
    const hasQualityLine = qwValues.some((v) => v !== null);
    const allValues = [...values, ...(hasQualityLine ? qwValues.filter((v): v is number => v !== null) : [])];
    const max = Math.max(...allValues, 100);
    const min = Math.min(...allValues, 0);
    const range = max - min || 1;

    const width = 500;
    const height = 150;
    const padding = 20;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const toPoint = (v: number, i: number) => ({
      x: padding + (i / Math.max(values.length - 1, 1)) * chartWidth,
      y: padding + chartHeight - ((v - min) / range) * chartHeight,
    });

    const points = values.map(toPoint);
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    // Quality-weighted line (skip null gaps)
    let qwLinePath = '';
    if (hasQualityLine) {
      const qwPoints = qwValues.map((v, i) => v !== null ? toPoint(v, i) : null);
      let started = false;
      for (const p of qwPoints) {
        if (p === null) { started = false; continue; }
        qwLinePath += `${!started ? 'M' : 'L'} ${p.x} ${p.y} `;
        started = true;
      }
    }

    return (
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40">
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map((pct) => {
            const y = padding + chartHeight - ((pct - min) / range) * chartHeight;
            return (
              <g key={pct}>
                <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="currentColor" strokeOpacity={0.1} />
                <text x={padding - 5} y={y + 3} textAnchor="end" className="fill-muted-foreground" fontSize={8}>{pct}%</text>
              </g>
            );
          })}
          {/* Certainty line */}
          <path d={linePath} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} />
          {/* Quality-weighted line */}
          {hasQualityLine && qwLinePath && (
            <path d={qwLinePath} fill="none" stroke="hsl(var(--primary))" strokeWidth={1.5} strokeDasharray="4 2" strokeOpacity={0.6} />
          )}
          {/* Dots */}
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={3} fill="hsl(var(--primary))" />
          ))}
          {/* X-axis labels (first, middle, last) */}
          {data.length > 0 && (
            <>
              <text x={padding} y={height - 2} className="fill-muted-foreground" fontSize={8}>{data[0].date}</text>
              {data.length > 2 && <text x={width / 2} y={height - 2} textAnchor="middle" className="fill-muted-foreground" fontSize={8}>{data[Math.floor(data.length / 2)].date}</text>}
              <text x={width - padding} y={height - 2} textAnchor="end" className="fill-muted-foreground" fontSize={8}>{data[data.length - 1].date}</text>
            </>
          )}
        </svg>
        {/* Legend */}
        {hasQualityLine && (
          <div className="flex gap-4 justify-center mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block w-4 h-0.5 bg-primary" /> Certainty
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-4 h-0.5 bg-primary opacity-60 border-dashed" style={{ borderTop: '1.5px dashed' }} /> Quality-weighted
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Epistemic Certainty Trend
          </CardTitle>
          <div className="flex gap-1">
            {(['week', 'month', 'quarter'] as Period[]).map((p) => (
              <Button
                key={p}
                variant={period === p ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setPeriod(p)}
                className="text-xs h-7 px-2"
              >
                {p === 'week' ? '7d' : p === 'month' ? '30d' : '90d'}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          renderChart(trends || [])
        )}
      </CardContent>
    </Card>
  );
}
