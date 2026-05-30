export interface TrackingStep {
  label: string;
  completed: boolean;
  active: boolean;
}

export interface TrackingEvent {
  number: number | null;
  title: string;
  date: string | null;
  location: string | null;
  variant: string;
}

export interface TrackingResult {
  trackingNumber: string;
  status: string | null;
  carrier: string | null;
  sender: string | null;
  originWilaya: string | null;
  destinationWilaya: string | null;
  hub: { name: string | null; address: string | null };
  steps: TrackingStep[];
  events: TrackingEvent[];
  source: string;
}

export type TrackingStatusKind = "delivered" | "cancelled" | "inProgress";

export function getStatusKind(result: TrackingResult): TrackingStatusKind {
  const statusText = (result.status || "").toLowerCase();
  const lastStep = result.steps[result.steps.length - 1];
  if (lastStep?.completed && !lastStep.active) {
    return "delivered";
  }
  if (
    /(annul|cancel|retour|returned|ملغ|مرتج|إرجاع)/i.test(statusText)
  ) {
    return "cancelled";
  }
  if (/(livr[éee]|delivered|تم التسليم|تم التوصيل)/i.test(statusText) && !/non livr|undeliver/i.test(statusText)) {
    return "delivered";
  }
  return "inProgress";
}

export type TrackingErrorKind = "not_found" | "upstream_blocked" | "network";

export class TrackingFetchError extends Error {
  kind: TrackingErrorKind;
  fallbackUrl: string | null;
  constructor(kind: TrackingErrorKind, fallbackUrl: string | null = null) {
    super(`tracking_${kind}`);
    this.kind = kind;
    this.fallbackUrl = fallbackUrl;
  }
}

export function getEcotrackFallbackUrl(
  trackingNumber: string,
  lang: string = "fr",
): string {
  const safeLang = ["fr", "en", "ar"].includes(lang) ? lang : "fr";
  return `https://suivi.ecotrack.dz/${safeLang}/suivi/${encodeURIComponent(trackingNumber.trim())}`;
}

export async function getTrackingStatus(
  trackingNumber: string,
  lang: string = "fr",
): Promise<TrackingResult> {
  const number = trackingNumber.trim();
  if (!number) throw new TrackingFetchError("not_found");

  const safeLang = ["fr", "en", "ar"].includes(lang) ? lang : "fr";

  let response: Response;
  try {
    response = await fetch(
      `/api/track/${encodeURIComponent(number)}?lang=${safeLang}`,
      { headers: { Accept: "application/json" } },
    );
  } catch {
    throw new TrackingFetchError("network", getEcotrackFallbackUrl(number, safeLang));
  }

  if (response.status === 404) {
    throw new TrackingFetchError("not_found");
  }

  if (!response.ok) {
    let payload: { error?: string; fallbackUrl?: string } = {};
    try {
      payload = await response.json();
    } catch {
      // ignore
    }
    if (payload.error === "upstream_blocked" || payload.error === "upstream_error") {
      throw new TrackingFetchError(
        "upstream_blocked",
        payload.fallbackUrl || getEcotrackFallbackUrl(number, safeLang),
      );
    }
    throw new TrackingFetchError("network", getEcotrackFallbackUrl(number, safeLang));
  }

  return (await response.json()) as TrackingResult;
}
