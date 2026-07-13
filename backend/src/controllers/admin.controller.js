import LlmCall from "../models/LlmCall.js";

// Percentile over a sorted array using nearest-rank on (n-1) interpolation
// points. Computed in JS rather than Mongo's $percentile so the aggregation
// runs on any MongoDB >= 6 (CI container, local dev, Atlas). At this
// project's volume (LlmCall is TTL'd at 90 days) the per-group latency
// arrays are small; at real scale this would move to $percentile (Mongo 7+).
function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1) + 0.5));
  return sorted[index];
}

export async function getLlmStats(req, res) {
  try {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const [result] = await LlmCall.aggregate([
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                calls: { $sum: 1 },
                costUsd: { $sum: "$costUsd" },
                cacheHits: { $sum: { $cond: ["$cacheHit", 1, 0] } },
                failures: { $sum: { $cond: ["$success", 0, 1] } },
                fallbacks: { $sum: { $cond: ["$fallbackUsed", 1, 0] } },
              },
            },
          ],
          byFeatureModel: [
            {
              $group: {
                _id: { feature: "$feature", model: "$model" },
                calls: { $sum: 1 },
                successRate: { $avg: { $cond: ["$success", 1, 0] } },
                avgLatencyMs: { $avg: "$latencyMs" },
                latencies: { $push: "$latencyMs" },
                costUsd: { $sum: "$costUsd" },
                promptTokens: { $sum: "$promptTokens" },
                completionTokens: { $sum: "$completionTokens" },
              },
            },
            { $sort: { calls: -1 } },
          ],
          daily: [
            { $match: { createdAt: { $gte: since } } },
            {
              $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                calls: { $sum: 1 },
                costUsd: { $sum: "$costUsd" },
                failures: { $sum: { $cond: ["$success", 0, 1] } },
              },
            },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]);

    const totals = result.totals[0] || { calls: 0, costUsd: 0, cacheHits: 0, failures: 0, fallbacks: 0 };

    res.status(200).json({
      totals: {
        calls: totals.calls,
        costUsd: totals.costUsd,
        cacheHits: totals.cacheHits,
        failures: totals.failures,
        fallbacks: totals.fallbacks,
        cacheHitRate: totals.calls > 0 ? totals.cacheHits / totals.calls : 0,
      },
      byFeatureModel: result.byFeatureModel.map((row) => {
        const sorted = [...row.latencies].sort((a, b) => a - b);
        return {
          feature: row._id.feature,
          model: row._id.model,
          calls: row.calls,
          successRate: row.successRate,
          avgLatencyMs: Math.round(row.avgLatencyMs),
          p50LatencyMs: percentile(sorted, 0.5),
          p95LatencyMs: percentile(sorted, 0.95),
          costUsd: row.costUsd,
          promptTokens: row.promptTokens,
          completionTokens: row.completionTokens,
        };
      }),
      daily: result.daily.map((day) => ({
        date: day._id,
        calls: day.calls,
        costUsd: day.costUsd,
        failures: day.failures,
      })),
    });
  } catch (error) {
    console.error("Error in getLlmStats controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
}
