import { useQuery } from "@tanstack/react-query";
import { ActivityIcon, CoinsIcon, DatabaseZapIcon, ShieldAlertIcon } from "lucide-react";
import { getLlmStats } from "../lib/api";
import PageLoader from "../components/PageLoader";

// Admin-only LLM observability dashboard, fed by the LlmCall collection.
// Access is enforced server-side (ADMIN_EMAILS) — this page just renders
// whatever the API allows, and shows a friendly wall on 403.

const formatCost = (usd) => (usd < 0.01 && usd > 0 ? "<$0.01" : `$${usd.toFixed(2)}`);
const formatPct = (ratio) => `${Math.round(ratio * 100)}%`;

const StatTile = (props) => (
  <div className="rounded-2xl bg-base-200 border border-base-300 p-4">
    <props.icon className="size-5 text-primary" />
    <p className="mt-3 text-2xl font-semibold tracking-tight">{props.value}</p>
    <p className="text-xs text-base-content/50">{props.label}</p>
  </div>
);

const AdminStatsPage = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["llmStats"],
    queryFn: getLlmStats,
    retry: false,
  });

  if (isLoading) return <PageLoader />;

  if (error?.response?.status === 403) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
        <ShieldAlertIcon className="size-10 text-base-content/30" />
        <h2 className="text-lg font-semibold">Admins only</h2>
        <p className="text-sm text-base-content/50 max-w-sm">
          Your account isn't on the admin list. Set <code>ADMIN_EMAILS</code> on the backend to
          include your email to access LLM stats.
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-error">Failed to load LLM stats. Please try again.</p>
      </div>
    );
  }

  const { totals, byFeatureModel, daily } = data;

  return (
    <div className="p-4 sm:p-6 lg:p-8 flex flex-col gap-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">LLM observability</h1>
        <p className="text-sm text-base-content/50 mt-0.5">
          Every model call, cache hit, and fallback — last 90 days.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile icon={ActivityIcon} label="Total calls" value={totals.calls} />
        <StatTile icon={CoinsIcon} label="Estimated cost" value={formatCost(totals.costUsd)} />
        <StatTile icon={DatabaseZapIcon} label="Cache-hit rate" value={formatPct(totals.cacheHitRate)} />
        <StatTile icon={ShieldAlertIcon} label="Fallbacks / failures" value={`${totals.fallbacks} / ${totals.failures}`} />
      </div>

      <div className="rounded-2xl bg-base-200 border border-base-300 p-5">
        <h2 className="text-sm font-semibold mb-3">By feature and model</h2>
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Feature</th>
                <th>Model</th>
                <th className="text-right">Calls</th>
                <th className="text-right">Success</th>
                <th className="text-right">Avg ms</th>
                <th className="text-right">p50 ms</th>
                <th className="text-right">p95 ms</th>
                <th className="text-right">Tokens in/out</th>
                <th className="text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {byFeatureModel.map((row) => (
                <tr key={`${row.feature}-${row.model}`}>
                  <td>{row.feature}</td>
                  <td className="font-mono text-xs">{row.model}</td>
                  <td className="text-right tabular-nums">{row.calls}</td>
                  <td className="text-right tabular-nums">{formatPct(row.successRate)}</td>
                  <td className="text-right tabular-nums">{row.avgLatencyMs}</td>
                  <td className="text-right tabular-nums">{row.p50LatencyMs}</td>
                  <td className="text-right tabular-nums">{row.p95LatencyMs}</td>
                  <td className="text-right tabular-nums">
                    {row.promptTokens}/{row.completionTokens}
                  </td>
                  <td className="text-right tabular-nums">{formatCost(row.costUsd)}</td>
                </tr>
              ))}
              {byFeatureModel.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center text-base-content/50 py-6">
                    No LLM calls recorded yet. Generate some flashcards first.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl bg-base-200 border border-base-300 p-5">
        <h2 className="text-sm font-semibold mb-3">Daily volume (last 14 days)</h2>
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Date</th>
                <th className="text-right">Calls</th>
                <th className="text-right">Failures</th>
                <th className="text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((day) => (
                <tr key={day.date}>
                  <td className="tabular-nums">{day.date}</td>
                  <td className="text-right tabular-nums">{day.calls}</td>
                  <td className="text-right tabular-nums">{day.failures}</td>
                  <td className="text-right tabular-nums">{formatCost(day.costUsd)}</td>
                </tr>
              ))}
              {daily.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-base-content/50 py-6">
                    Nothing in the last 14 days.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminStatsPage;
