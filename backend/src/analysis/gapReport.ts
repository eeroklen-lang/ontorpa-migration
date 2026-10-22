import { MigrationReport } from "./migrationReport";

/** One gap across a portfolio: an unmapped activity type, an ontology-only operation or a manual reason. */
export interface Gap {
  name: string;
  occurrences: number;
  /** Occurrences of an unmapped activity by application context, e.g. { desktop: 3, "": 1 } ("" for none). */
  contexts?: Record<string, number>;
  /** Bots the gap occurs in. */
  bots: number;
  /** Pooled coverage the portfolio would gain if the gap were closed: occurrences / steps. */
  gain: number | null;
}

/** A coverage rate over a portfolio. */
export interface PortfolioCoverage {
  /** All steps of all bots together. */
  pooled: number | null;
  /** Median of the bots' own coverage, over bots with steps. */
  median: number | null;
}

/**
 * What keeps a portfolio from migrating automatically, most frequent first: the evidence for
 * the next round of mappings and ontology extensions.
 */
export interface GapReport {
  bots: number;
  botsWithSteps: number;
  steps: number;
  coverage: { ontology: PortfolioCoverage; target?: PortfolioCoverage };
  target?: string;
  /** Activity types without an ontology operation. */
  unmapped: Gap[];
  /** Mapped operations the target has no translation for. */
  ontologyOnly: Gap[];
  /** Steps that need manual redesign, by reason. */
  manual: Gap[];
}

/** Aggregates the migration reports of a portfolio (built with the same target) into its gaps. */
export function buildGapReport(reports: MigrationReport[]): GapReport {
  const steps = reports.reduce((sum, r) => sum + r.totals.steps, 0);
  const target = reports.find((r) => r.target)?.target;

  const unmapped = new GapCounter(steps);
  const ontologyOnly = new GapCounter(steps);
  const manual = new GapCounter(steps);
  reports.forEach((report, bot) => {
    report.unmappedActivities.forEach((u) => unmapped.add(bot, u.activityType, u.count, u.context || ""));
    (report.ontologyOnlyOperations || []).forEach((o) => ontologyOnly.add(bot, o.operation, o.count));
    report.manualWork.items.forEach((item) => manual.add(bot, item.reason || item.activityType, 1));
  });

  const gapReport: GapReport = {
    bots: reports.length,
    botsWithSteps: reports.filter((r) => r.totals.steps > 0).length,
    steps,
    coverage: { ontology: portfolioCoverage(reports, (r) => r.totals.mapped, (r) => r.coverage.ontology) },
    unmapped: unmapped.gaps(),
    ontologyOnly: ontologyOnly.gaps(),
    manual: manual.gaps(),
  };
  if (target) {
    gapReport.target = target;
    gapReport.coverage.target = portfolioCoverage(
      reports,
      (r) => r.totals.mapped - (r.totals.ontologyOnly || 0),
      (r) => r.coverage.target
    );
  }
  return gapReport;
}

class GapCounter {
  private entries = new Map<
    string,
    { occurrences: number; bots: Set<number>; contexts?: Record<string, number> }
  >();

  constructor(private steps: number) {}

  /** Counts a gap in a bot; a context (also "") makes the gap keep a breakdown by context. */
  add(bot: number, name: string, count: number, context?: string) {
    const entry = this.entries.get(name) || { occurrences: 0, bots: new Set<number>() };
    entry.occurrences += count;
    entry.bots.add(bot);
    if (context !== undefined) {
      entry.contexts = entry.contexts || {};
      entry.contexts[context] = (entry.contexts[context] || 0) + count;
    }
    this.entries.set(name, entry);
  }

  gaps(): Gap[] {
    return Array.from(this.entries, ([name, { occurrences, bots, contexts }]) => ({
      name,
      occurrences,
      ...(contexts ? { contexts } : {}),
      bots: bots.size,
      gain: this.steps === 0 ? null : occurrences / this.steps,
    })).sort((a, b) => b.occurrences - a.occurrences || b.bots - a.bots || a.name.localeCompare(b.name));
  }
}

function portfolioCoverage(
  reports: MigrationReport[],
  covered: (report: MigrationReport) => number,
  share: (report: MigrationReport) => number | null | undefined
): PortfolioCoverage {
  const steps = reports.reduce((sum, r) => sum + r.totals.steps, 0);
  const shares = reports
    .map(share)
    .filter((s): s is number => typeof s === "number")
    .sort((a, b) => a - b);
  return {
    pooled: steps === 0 ? null : reports.reduce((sum, r) => sum + covered(r), 0) / steps,
    median: median(shares),
  };
}

function median(sorted: number[]): number | null {
  if (sorted.length === 0) {
    return null;
  }
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
