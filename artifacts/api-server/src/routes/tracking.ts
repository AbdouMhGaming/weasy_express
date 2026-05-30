import { Router, type IRouter } from "express";
import * as cheerio from "cheerio";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const ALLOWED_LANGS = new Set(["fr", "en", "ar"]);
const TRACKING_REGEX = /^[A-Za-z0-9_-]{4,40}$/;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface TimelineEvent {
  number: number | null;
  title: string;
  date: string | null;
  location: string | null;
  variant: string;
}

interface ProgressStep {
  label: string;
  completed: boolean;
  active: boolean;
}

interface TrackingPayload {
  trackingNumber: string;
  status: string | null;
  carrier: string | null;
  sender: string | null;
  originWilaya: string | null;
  destinationWilaya: string | null;
  hub: { name: string | null; address: string | null };
  steps: ProgressStep[];
  events: TimelineEvent[];
  source: "ecotrack";
}

const cleanText = (input: string | null | undefined): string =>
  (input ?? "")
    .replace(/\s+/g, " ")
    .replace(/&#039;/g, "'")
    .trim();

function parseEcotrackPage(
  html: string,
  trackingNumber: string,
): TrackingPayload | null {
  const $ = cheerio.load(html);

  const status = cleanText($(".logs-header").nextAll(".badge").first().text())
    || cleanText($(".badge.bg-primary, .badge.bg-success, .badge.bg-danger").first().text());

  const steps: ProgressStep[] = [];
  $(".steps-wrapper .step-item").each((_, el) => {
    const cls = ($(el).attr("class") || "").split(/\s+/);
    const label = cleanText($(el).find(".step-label").text());
    if (!label) return;
    steps.push({
      label,
      completed: cls.includes("completed"),
      active: cls.includes("active"),
    });
  });

  const events: TimelineEvent[] = [];
  $(".tracking-timeline .timeline-item").each((_, el) => {
    const $item = $(el);
    const titleHtml = $item.find(".timeline-content h5").first();
    const numberText = cleanText(titleHtml.find(".event-number").text()).replace(
      /\.$/,
      "",
    );
    titleHtml.find(".event-number").remove();
    const title = cleanText(titleHtml.text());
    const metaSpans = $item
      .find(".timeline-content .text-muted span")
      .map((_, s) => cleanText($(s).text()))
      .get()
      .filter((t) => t && t !== "•");
    const date = metaSpans[0] ?? null;
    const location = metaSpans[1] ?? null;
    const classes = ($item.attr("class") || "").split(/\s+/);
    const variantClass = classes.find(
      (c) => c.startsWith("timeline-") && c !== "timeline-item",
    );
    const variant = variantClass ? variantClass.replace("timeline-", "") : "info";
    events.push({
      number: numberText ? Number(numberText) : null,
      title,
      date,
      location,
      variant,
    });
  });

  if (!status && steps.length === 0 && events.length === 0) {
    return null;
  }

  const findValueByLabel = (label: string): string | null => {
    let value: string | null = null;
    $(".info-card .info-label").each((_, el) => {
      if (cleanText($(el).text()).toLowerCase() === label.toLowerCase()) {
        value = cleanText($(el).siblings(".info-value").first().text());
        return false;
      }
      return undefined;
    });
    return value;
  };

  const findLocationByLabel = (label: string): string | null => {
    let value: string | null = null;
    $(".info-card-location .location-label").each((_, el) => {
      if (cleanText($(el).text()).toLowerCase() === label.toLowerCase()) {
        value = cleanText($(el).siblings().find(".location-value").text())
          || cleanText($(el).parent().find(".location-value").text());
        return false;
      }
      return undefined;
    });
    return value;
  };

  const carrier =
    findValueByLabel("Société de livraison") ||
    findValueByLabel("Delivery company") ||
    findValueByLabel("شركة التوصيل");
  const sender =
    findValueByLabel("Expéditeur") ||
    findValueByLabel("Sender") ||
    findValueByLabel("المرسل");
  const originWilaya =
    findLocationByLabel("Wilaya d'expédition") ||
    findLocationByLabel("Shipping wilaya") ||
    findLocationByLabel("ولاية الإرسال");
  const destinationWilaya =
    findLocationByLabel("Wilaya de livraison") ||
    findLocationByLabel("Delivery wilaya") ||
    findLocationByLabel("ولاية التوصيل");

  let hubName: string | null = null;
  let hubAddress: string | null = null;
  $("#hub-info .info-card").each((_, el) => {
    const label = cleanText($(el).find(".info-label").text()).toLowerCase();
    if (
      label === "localisation" ||
      label === "location" ||
      label === "الموقع"
    ) {
      const ps = $(el).find(".info-value p");
      hubName = cleanText($(ps.get(0)).text());
      hubAddress = cleanText($(ps.get(1)).text());
    }
  });

  return {
    trackingNumber,
    status: status || null,
    carrier,
    sender,
    originWilaya,
    destinationWilaya,
    hub: { name: hubName, address: hubAddress },
    steps,
    events,
    source: "ecotrack",
  };
}

router.get("/track/:number", async (req, res) => {
  const number = String(req.params.number || "").trim();
  const langParam = String(req.query["lang"] || "fr").toLowerCase();
  const lang = ALLOWED_LANGS.has(langParam) ? langParam : "fr";

  if (!TRACKING_REGEX.test(number)) {
    res.status(400).json({ error: "invalid_tracking_number" });
    return;
  }

  const url = `https://suivi.ecotrack.dz/${lang}/suivi/${encodeURIComponent(number)}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);

    const upstream = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8,ar;q=0.7",
      },
    }).finally(() => clearTimeout(timer));

    if (upstream.status >= 300 && upstream.status < 400) {
      res.status(404).json({ error: "tracking_not_found" });
      return;
    }

    if (upstream.status === 403) {
      logger.warn(
        { status: upstream.status, number },
        "Ecotrack blocked our request (likely IP/geo restriction)",
      );
      res
        .status(502)
        .json({ error: "upstream_blocked", upstreamStatus: 403, fallbackUrl: url });
      return;
    }

    if (!upstream.ok) {
      logger.warn(
        { status: upstream.status, number },
        "Ecotrack upstream returned non-OK status",
      );
      res
        .status(502)
        .json({ error: "upstream_error", upstreamStatus: upstream.status, fallbackUrl: url });
      return;
    }

    const html = await upstream.text();
    const parsed = parseEcotrackPage(html, number);

    if (!parsed) {
      res.status(404).json({ error: "tracking_not_found" });
      return;
    }

    res.setHeader("Cache-Control", "public, max-age=60");
    res.json(parsed);
  } catch (err) {
    logger.error({ err, number }, "Failed to fetch tracking from Ecotrack");
    res.status(502).json({ error: "upstream_error" });
  }
});

export default router;
