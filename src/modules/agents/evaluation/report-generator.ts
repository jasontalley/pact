/**
 * HTML Report Generator
 *
 * Generates a self-contained HTML report from EvaluationReport[].
 * Uses template literals and inline CSS — no external dependencies.
 *
 * Output: test-results/agents/reports/evaluation-{timestamp}.html
 */

import * as fs from 'fs';
import * as path from 'path';
import { EvaluationReport, EvaluationCaseResult, TaggedFailure } from './run-artifact.types';

/**
 * Generate a self-contained HTML report from evaluation results.
 *
 * @param reports - Array of evaluation reports
 * @param outputDir - Directory to write the HTML file
 * @returns Path to the generated HTML file
 */
export function generateHtmlReport(
  reports: EvaluationReport[],
  outputDir: string,
): string {
  const reportsDir = path.join(outputDir, 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.join(reportsDir, `evaluation-${timestamp}.html`);

  const totalCases = reports.reduce((s, r) => s + r.totalCases, 0);
  const totalPassed = reports.reduce((s, r) => s + r.passedCases, 0);
  const totalFailed = reports.reduce((s, r) => s + r.failedCases, 0);
  const totalSkipped = reports.reduce((s, r) => s + r.skippedCases, 0);
  const overallStatus = totalFailed === 0 ? 'PASS' : 'FAIL';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pact Agent Evaluation Report</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace; background: #0d1117; color: #c9d1d9; padding: 24px; line-height: 1.5; }
  h1 { color: #f0f6fc; font-size: 24px; margin-bottom: 8px; }
  h2 { color: #f0f6fc; font-size: 18px; margin: 24px 0 12px; }
  h3 { color: #8b949e; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; margin: 16px 0 8px; }
  .header { border-bottom: 1px solid #30363d; padding-bottom: 16px; margin-bottom: 24px; }
  .header .meta { color: #8b949e; font-size: 13px; }
  .status-pass { color: #3fb950; font-weight: 600; }
  .status-fail { color: #f85149; font-weight: 600; }
  .status-skip { color: #d29922; font-weight: 600; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; }
  .badge-pass { background: #1b4332; color: #3fb950; }
  .badge-fail { background: #3d1116; color: #f85149; }
  .badge-skip { background: #3d2e00; color: #d29922; }
  .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin: 16px 0; }
  .summary-card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; text-align: center; }
  .summary-card .number { font-size: 28px; font-weight: 700; }
  .summary-card .label { font-size: 12px; color: #8b949e; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #21262d; }
  th { background: #161b22; color: #8b949e; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
  tr:hover { background: #161b22; }
  details { margin: 8px 0; }
  summary { cursor: pointer; padding: 8px 12px; background: #161b22; border: 1px solid #30363d; border-radius: 6px; font-weight: 600; }
  summary:hover { background: #1c2128; }
  .detail-content { padding: 12px; border: 1px solid #30363d; border-top: none; border-radius: 0 0 6px 6px; background: #0d1117; }
  .failure-item { padding: 8px; margin: 4px 0; background: #1c1018; border-left: 3px solid #f85149; border-radius: 0 4px 4px 0; }
  .failure-tag { display: inline-block; padding: 1px 6px; background: #3d1116; color: #f85149; border-radius: 4px; font-size: 11px; margin-right: 6px; }
  .critical-tag { background: #f85149; color: #fff; }
  .metrics { display: flex; gap: 16px; flex-wrap: wrap; margin: 8px 0; }
  .metric { font-size: 13px; color: #8b949e; }
  .metric span { color: #c9d1d9; font-weight: 600; }
  .histogram { display: flex; align-items: flex-end; gap: 2px; height: 80px; margin: 12px 0; }
  .histogram-bar { flex: 1; min-width: 24px; background: #238636; border-radius: 2px 2px 0 0; position: relative; }
  .histogram-bar.fail { background: #da3633; }
  .histogram-bar .bar-label { position: absolute; bottom: -18px; left: 50%; transform: translateX(-50%); font-size: 10px; color: #8b949e; white-space: nowrap; }
  footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #30363d; color: #484f58; font-size: 12px; }
</style>
</head>
<body>

<div class="header">
  <h1>Pact Agent Evaluation Report</h1>
  <div class="meta">
    Generated: ${new Date().toISOString()} | Suites: ${reports.length} | Overall: <span class="status-${overallStatus.toLowerCase()}">${overallStatus}</span>
  </div>
</div>

<div class="summary-grid">
  <div class="summary-card">
    <div class="number">${totalCases}</div>
    <div class="label">Total Cases</div>
  </div>
  <div class="summary-card">
    <div class="number status-pass">${totalPassed}</div>
    <div class="label">Passed</div>
  </div>
  <div class="summary-card">
    <div class="number status-fail">${totalFailed}</div>
    <div class="label">Failed</div>
  </div>
  <div class="summary-card">
    <div class="number status-skip">${totalSkipped}</div>
    <div class="label">Skipped</div>
  </div>
</div>

<h2>Suite Summary</h2>
<table>
  <thead>
    <tr>
      <th>Suite</th>
      <th>Agent</th>
      <th>Total</th>
      <th>Passed</th>
      <th>Failed</th>
      <th>Skipped</th>
      <th>Status</th>
      <th>Avg Duration</th>
    </tr>
  </thead>
  <tbody>
${reports.map((r) => `    <tr>
      <td>${escHtml(r.suite)}</td>
      <td>${escHtml(r.agent)}</td>
      <td>${r.totalCases}</td>
      <td class="status-pass">${r.passedCases}</td>
      <td class="${r.failedCases > 0 ? 'status-fail' : ''}">${r.failedCases}</td>
      <td>${r.skippedCases}</td>
      <td><span class="badge badge-${r.failedCases === 0 ? 'pass' : 'fail'}">${r.failedCases === 0 ? 'PASS' : 'FAIL'}</span></td>
      <td>${r.aggregateMetrics ? Math.round(r.aggregateMetrics.avgDurationMs) + 'ms' : '-'}</td>
    </tr>`).join('\n')}
  </tbody>
</table>

${reports.map((r) => renderSuiteDetail(r)).join('\n')}

<footer>
  Pact Agent Evaluation | ${new Date().toISOString()}
</footer>

</body>
</html>`;

  fs.writeFileSync(outputPath, html, 'utf-8');
  return outputPath;
}

/**
 * Render the detail section for a single suite.
 */
function renderSuiteDetail(report: EvaluationReport): string {
  const isOpen = report.failedCases > 0 ? ' open' : '';

  return `
<h2>${escHtml(report.suite)} — ${escHtml(report.agent)}</h2>
<details${isOpen}>
  <summary>${report.passedCases} passed, ${report.failedCases} failed, ${report.skippedCases} skipped</summary>
  <div class="detail-content">
${report.aggregateMetrics ? `    <div class="metrics">
      <div class="metric">Avg Duration: <span>${Math.round(report.aggregateMetrics.avgDurationMs)}ms</span></div>
      <div class="metric">Avg Tokens: <span>${Math.round(report.aggregateMetrics.avgTokens)}</span></div>
      ${report.aggregateMetrics.avgCostUsd ? `<div class="metric">Avg Cost: <span>$${report.aggregateMetrics.avgCostUsd.toFixed(4)}</span></div>` : ''}
    </div>` : ''}

    <table>
      <thead>
        <tr>
          <th>Case</th>
          <th>Name</th>
          <th>Result</th>
          <th>Reason</th>
        </tr>
      </thead>
      <tbody>
${report.cases.map((c) => renderCaseRow(c)).join('\n')}
      </tbody>
    </table>

${report.cases.filter((c) => c.result === 'fail').map((c) => renderFailureDetail(c)).join('\n')}
  </div>
</details>`;
}

/**
 * Render a single case row in the table.
 */
function renderCaseRow(c: EvaluationCaseResult): string {
  const resultClass = c.result === 'pass' ? 'pass' : c.result === 'fail' ? 'fail' : 'skip';
  return `        <tr>
          <td>${escHtml(c.caseId)}</td>
          <td>${escHtml(c.name)}</td>
          <td><span class="badge badge-${resultClass}">${c.result.toUpperCase()}</span></td>
          <td>${c.reason ? escHtml(truncate(c.reason, 120)) : '-'}</td>
        </tr>`;
}

/**
 * Render failure detail for a failed case.
 */
function renderFailureDetail(c: EvaluationCaseResult): string {
  if (!c.failures || c.failures.length === 0) return '';

  return `
    <div style="margin: 8px 0;">
      <strong>${escHtml(c.caseId)}: ${escHtml(c.name)}</strong>
${c.failures.map((f) => renderFailureItem(f)).join('\n')}
    </div>`;
}

/**
 * Render a single failure item.
 */
function renderFailureItem(f: TaggedFailure): string {
  const critClass = f.isCritical ? ' critical-tag' : '';
  return `      <div class="failure-item">
        <span class="failure-tag${critClass}">${escHtml(f.tag)}${f.isCritical ? ' CRITICAL' : ''}</span>
        ${escHtml(f.reason)}
        ${f.contractViolation ? `<br><small>Contract: ${escHtml(f.contractViolation)}</small>` : ''}
      </div>`;
}

/**
 * Escape HTML special characters.
 */
function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Truncate a string to maxLen characters.
 */
function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}
