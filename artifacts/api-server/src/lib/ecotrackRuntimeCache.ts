export const ecotrackReferenceCache = new Map<string, { until: number; value: unknown }>();
export const ecotrackResolvedCommuneCache = new Map<string, { until: number; value: string }>();

export function clearEcotrackRuntimeCache(expediteurId: number) {
  const prefix = `${expediteurId}:`;
  for (const key of ecotrackReferenceCache.keys()) {
    if (key.startsWith(prefix)) ecotrackReferenceCache.delete(key);
  }
  for (const key of ecotrackResolvedCommuneCache.keys()) {
    if (key.startsWith(prefix)) ecotrackResolvedCommuneCache.delete(key);
  }
}