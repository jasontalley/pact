'use client';

import type { RepoManifest } from '@/types/reconciliation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ManifestViewerProps {
  manifest: RepoManifest;
  compact?: boolean;
}

const EVIDENCE_LABELS: Record<string, string> = {
  test: 'Tests',
  source_export: 'Exports',
  ui_component: 'UI Components',
  api_endpoint: 'API Endpoints',
  documentation: 'Documentation',
  coverage_gap: 'Coverage Gaps',
  code_comment: 'Code Comments',
};

const EVIDENCE_COLORS: Record<string, string> = {
  test: 'bg-green-500',
  source_export: 'bg-blue-500',
  ui_component: 'bg-purple-500',
  api_endpoint: 'bg-amber-500',
  documentation: 'bg-cyan-500',
  coverage_gap: 'bg-red-400',
  code_comment: 'bg-slate-400',
};

function formatDuration(ms: number | null): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

/**
 * Derive a human-readable display name for the manifest.
 * Priority: repositoryUrl > cleaned identity.name > "Repository"
 */
function getDisplayName(manifest: RepoManifest): string {
  // Try repositoryUrl (e.g., https://github.com/owner/repo)
  if (manifest.identity.repositoryUrl) {
    const match = manifest.identity.repositoryUrl.match(/github\.com\/([^/]+\/[^/.]+)/);
    if (match) return match[1];
  }

  const name = manifest.identity.name;
  if (!name) return 'Repository';

  // If name contains a long hex hash (like prisma generated names), skip it
  if (/[a-f0-9]{16,}/.test(name)) return 'Repository';

  // If name is reasonable length, use it
  if (name.length <= 50) return name;

  return 'Repository';
}

const QUALITY_DIMENSION_LABELS: Record<string, string> = {
  intentFidelity: 'Intent Fidelity',
  noVacuousTests: 'Non-Vacuous',
  noBrittleTests: 'Non-Brittle',
  determinism: 'Determinism',
  failureSignalQuality: 'Failure Signals',
  integrationAuthenticity: 'Integration Auth.',
  boundaryAndNegativeCoverage: 'Boundary Coverage',
};

/**
 * Identity section: project name, frameworks, languages, commit, surface area
 */
function IdentitySection({ manifest }: { manifest: RepoManifest }) {
  const { identity, domainModel } = manifest;
  const displayName = getDisplayName(manifest);

  const entityCount = domainModel.entities?.length || 0;
  const apiCount = domainModel.apiSurface?.length || 0;
  const uiCount = domainModel.uiSurface?.length || 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{displayName}</CardTitle>
          <div className="flex gap-2 text-xs text-muted-foreground">
            {identity.commitHash && (
              <span>
                <code className="font-mono">{identity.commitHash.slice(0, 8)}</code>
              </span>
            )}
            <span>{manifest.contentSource}</span>
            <span>{formatDuration(manifest.generationDurationMs)}</span>
          </div>
        </div>
        {identity.description && (
          <CardDescription>{identity.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {identity.languages.map((lang) => (
            <Badge key={lang} variant="secondary">{lang}</Badge>
          ))}
          {identity.frameworks.map((fw) => (
            <Badge key={fw} variant="outline">{fw}</Badge>
          ))}
        </div>
        {/* Surface area counts */}
        {(entityCount > 0 || apiCount > 0 || uiCount > 0) && (
          <div className="flex gap-4 text-sm pt-1">
            {entityCount > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                <span className="text-muted-foreground">Entities</span>
                <span className="font-medium">{entityCount}</span>
              </div>
            )}
            {apiCount > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span className="text-muted-foreground">API Endpoints</span>
                <span className="font-medium">{apiCount}</span>
              </div>
            )}
            {uiCount > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                <span className="text-muted-foreground">UI Components</span>
                <span className="font-medium">{uiCount}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Structure section: file counts by category — full width
 */
function StructureSection({ manifest }: { manifest: RepoManifest }) {
  const { structure } = manifest;
  const categories = [
    { label: 'Source', count: structure.sourceFileCount, color: 'bg-blue-500' },
    { label: 'Test', count: structure.testFileCount, color: 'bg-green-500' },
    { label: 'UI', count: structure.uiFileCount, color: 'bg-purple-500' },
    { label: 'Docs', count: structure.docFileCount, color: 'bg-amber-500' },
    { label: 'Config', count: structure.configFileCount, color: 'bg-gray-500' },
  ];
  const total = structure.totalFiles;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Structure</CardTitle>
        <CardDescription>{formatNumber(total)} files</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-0.5 h-3 rounded-full overflow-hidden mb-3">
          {categories.filter(c => c.count > 0).map((cat) => (
            <div
              key={cat.label}
              className={`${cat.color} transition-all`}
              style={{ width: `${(cat.count / total) * 100}%` }}
              title={`${cat.label}: ${cat.count}`}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {categories.filter(c => c.count > 0).map((cat) => (
            <div key={cat.label} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full ${cat.color}`} />
              <span className="text-muted-foreground">{cat.label}</span>
              <span className="font-medium">{formatNumber(cat.count)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Evidence inventory section: horizontal stacked bar + sorted counts
 */
function EvidenceSection({ manifest }: { manifest: RepoManifest }) {
  const { evidenceInventory } = manifest;
  const byType = evidenceInventory.summary.byType;
  const total = evidenceInventory.summary.total;

  const sorted = Object.entries(byType)
    .sort(([, a], [, b]) => b - a);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Evidence</CardTitle>
        <CardDescription>{formatNumber(total)} items extracted</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Stacked horizontal bar showing proportions */}
        <div className="flex gap-0.5 h-3 rounded-full overflow-hidden mb-3">
          {sorted.filter(([, count]) => count > 0).map(([type, count]) => (
            <div
              key={type}
              className={`${EVIDENCE_COLORS[type] || 'bg-gray-400'} transition-all`}
              style={{ width: `${(count / total) * 100}%` }}
              title={`${EVIDENCE_LABELS[type] || type}: ${count}`}
            />
          ))}
        </div>
        {/* Legend with counts */}
        <div className="space-y-1">
          {sorted.map(([type, count]) => (
            <div key={type} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-full ${EVIDENCE_COLORS[type] || 'bg-gray-400'}`} />
                <span className="text-muted-foreground">
                  {EVIDENCE_LABELS[type] || type}
                </span>
              </div>
              <span className="font-medium tabular-nums">{formatNumber(count)}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t flex gap-4 text-xs text-muted-foreground">
          <span>{evidenceInventory.tests.orphanCount} orphan tests</span>
          <span>{evidenceInventory.tests.linkedCount} linked tests</span>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Health signals section: test quality with dimension breakdown
 */
function HealthSection({ manifest }: { manifest: RepoManifest }) {
  const { healthSignals } = manifest;

  const qualityScore = healthSignals.testQuality
    ? Math.round(healthSignals.testQuality.averageScore)
    : null;

  const scoreColor = qualityScore === null ? 'text-muted-foreground'
    : qualityScore >= 80 ? 'text-green-500'
    : qualityScore >= 60 ? 'text-amber-500'
    : 'text-red-500';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Health Signals</CardTitle>
        {healthSignals.testQuality && (
          <CardDescription>
            Static analysis of test suite quality across 7 dimensions
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {healthSignals.testQuality && (
          <>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-bold tabular-nums ${scoreColor}`}>
                {qualityScore}
              </span>
              <span className="text-sm text-muted-foreground">/ 100 avg quality score</span>
            </div>
            {/* Dimension breakdown */}
            <div className="space-y-1.5">
              {Object.entries(healthSignals.testQuality.dimensionAverages).map(([dim, val]) => {
                const pct = Math.round(val * 100);
                const color = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-400';
                return (
                  <div key={dim} className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground w-32 truncate">
                      {QUALITY_DIMENSION_LABELS[dim] || dim}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="font-medium tabular-nums w-8 text-right">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
        {healthSignals.coverage && (
          <div className="pt-2 border-t">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Coverage</span>
              <span className="font-medium">
                {Math.round(healthSignals.coverage.overallPercent)}%
                <span className="text-xs text-muted-foreground ml-1">
                  ({healthSignals.coverage.fileCount} files, {healthSignals.coverage.format})
                </span>
              </span>
            </div>
          </div>
        )}
        {healthSignals.dependencyCount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Dependencies</span>
            <span className="font-medium">{healthSignals.dependencyCount}</span>
          </div>
        )}
        {!healthSignals.testQuality && !healthSignals.coverage && (
          <p className="text-sm text-muted-foreground">No health signals available</p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Domain Model section: entities, API surface, UI components
 */
function DomainModelSection({ manifest }: { manifest: RepoManifest }) {
  const { domainModel } = manifest;
  const entities = domainModel.entities || [];
  const apiSurface = domainModel.apiSurface || [];
  const uiSurface = domainModel.uiSurface || [];

  if (entities.length === 0 && apiSurface.length === 0 && uiSurface.length === 0) {
    return null;
  }

  // Group entities by type
  const entitiesByType = new Map<string, typeof entities>();
  for (const e of entities) {
    const group = entitiesByType.get(e.type) || [];
    group.push(e);
    entitiesByType.set(e.type, group);
  }

  // Group API endpoints by method
  const apiByMethod = new Map<string, typeof apiSurface>();
  for (const ep of apiSurface) {
    const method = ep.method.toUpperCase();
    const group = apiByMethod.get(method) || [];
    group.push(ep);
    apiByMethod.set(method, group);
  }

  const METHOD_COLORS: Record<string, string> = {
    GET: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    POST: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    PUT: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    PATCH: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    DELETE: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };

  // Group UI components by framework
  const uiByFramework = new Map<string, typeof uiSurface>();
  for (const comp of uiSurface) {
    const fw = comp.framework || 'unknown';
    const group = uiByFramework.get(fw) || [];
    group.push(comp);
    uiByFramework.set(fw, group);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Domain Model</CardTitle>
        <CardDescription>
          {entities.length} entities, {apiSurface.length} endpoints, {uiSurface.length} components
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Entities */}
        {entities.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
              <span className="text-sm font-medium">Entities</span>
              <span className="text-xs text-muted-foreground">({entities.length})</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {Array.from(entitiesByType.entries())
                .sort(([, a], [, b]) => b.length - a.length)
                .map(([type, items]) => (
                  items.slice(0, 15).map((e) => (
                    <Badge key={`${e.name}-${e.filePath}`} variant="outline" className="text-xs">
                      {e.name}
                      <span className="ml-1 text-muted-foreground">{type}</span>
                    </Badge>
                  ))
                )).flat()}
              {entities.length > 15 && (
                <Badge variant="secondary" className="text-xs">
                  +{entities.length - 15} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* API Surface */}
        {apiSurface.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span className="text-sm font-medium">API Endpoints</span>
              <span className="text-xs text-muted-foreground">({apiSurface.length})</span>
            </div>
            {/* Method summary badges */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {Array.from(apiByMethod.entries())
                .sort(([, a], [, b]) => b.length - a.length)
                .map(([method, items]) => (
                  <span
                    key={method}
                    className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded ${METHOD_COLORS[method] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'}`}
                  >
                    {method} <span className="font-normal">{items.length}</span>
                  </span>
                ))}
            </div>
            {/* Sample endpoints */}
            <div className="space-y-0.5 text-xs text-muted-foreground max-h-32 overflow-y-auto">
              {apiSurface.slice(0, 12).map((ep, i) => (
                <div key={`${ep.method}-${ep.path}-${i}`} className="flex gap-2 font-mono">
                  <span className="font-semibold w-12 text-right shrink-0">
                    {ep.method.toUpperCase()}
                  </span>
                  <span className="truncate">{ep.path}</span>
                </div>
              ))}
              {apiSurface.length > 12 && (
                <div className="text-muted-foreground pt-1">
                  +{apiSurface.length - 12} more endpoints
                </div>
              )}
            </div>
          </div>
        )}

        {/* UI Components */}
        {uiSurface.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />
              <span className="text-sm font-medium">UI Components</span>
              <span className="text-xs text-muted-foreground">({uiSurface.length})</span>
            </div>
            {/* Framework breakdown */}
            {uiByFramework.size > 1 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {Array.from(uiByFramework.entries())
                  .sort(([, a], [, b]) => b.length - a.length)
                  .map(([fw, items]) => (
                    <Badge key={fw} variant="secondary" className="text-xs">
                      {fw} ({items.length})
                    </Badge>
                  ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1">
              {uiSurface.slice(0, 20).map((comp, i) => (
                <Badge key={`${comp.name}-${i}`} variant="outline" className="text-xs">
                  {comp.name}
                </Badge>
              ))}
              {uiSurface.length > 20 && (
                <Badge variant="secondary" className="text-xs">
                  +{uiSurface.length - 20} more
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * ManifestViewer — displays a RepoManifest with identity, structure,
 * evidence inventory, health signals, and domain concepts.
 *
 * Use `compact` for a condensed view in the wizard config step.
 */
export function ManifestViewer({ manifest, compact }: ManifestViewerProps) {
  const displayName = getDisplayName(manifest);

  if (compact) {
    return (
      <div className="rounded-lg border p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-medium">{displayName}</span>
            {manifest.identity.commitHash && (
              <code className="ml-2 text-xs text-muted-foreground">
                {manifest.identity.commitHash.slice(0, 8)}
              </code>
            )}
          </div>
          <Badge variant={manifest.status === 'complete' ? 'default' : 'secondary'}>
            {manifest.status}
          </Badge>
        </div>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span>{formatNumber(manifest.structure.totalFiles)} files</span>
          <span>{formatNumber(manifest.evidenceInventory.summary.total)} evidence items</span>
          <span>{formatNumber(manifest.evidenceInventory.tests.orphanCount)} orphan tests</span>
          {manifest.generationDurationMs && (
            <span>{formatDuration(manifest.generationDurationMs)}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {manifest.identity.frameworks.map((fw) => (
            <Badge key={fw} variant="outline" className="text-xs">{fw}</Badge>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <IdentitySection manifest={manifest} />
      {/* Structure: full width */}
      <StructureSection manifest={manifest} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <EvidenceSection manifest={manifest} />
        <HealthSection manifest={manifest} />
      </div>
      <DomainModelSection manifest={manifest} />
    </div>
  );
}
