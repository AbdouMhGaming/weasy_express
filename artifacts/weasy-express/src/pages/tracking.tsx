import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Truck, Package, XCircle, Shield, Phone } from "lucide-react";
import { getTrackingStatus, TrackingResult as TrackingResultType, TrackingFetchError, getEcotrackFallbackUrl } from "@/lib/tracking";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TrackingForm } from "@/components/TrackingForm";
import { TrackingResult } from "@/components/TrackingResult";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";

export default function TrackingPage() {
  const { t, i18n } = useTranslation();
  const searchParams = new URLSearchParams(window.location.search);
  const numberParam = searchParams.get("number") || "";
  
  const [trackingNumber, setTrackingNumber] = useState(numberParam);
  const [result, setResult] = useState<TrackingResultType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<null | "not_found" | "blocked">(null);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    if (numberParam) {
      handleSearch(numberParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numberParam]);

  const handleSearch = async (num: string) => {
    setTrackingNumber(num);
    setLoading(true);
    setError(null);
    setHasSearched(true);
    setResult(null);

    try {
      const res = await getTrackingStatus(num, i18n.resolvedLanguage || i18n.language || "fr");
      setResult(res);
    } catch (e) {
      if (e instanceof TrackingFetchError && e.kind === "not_found") {
        setError("not_found");
      } else {
        setError("blocked");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-[#E10600] text-white pt-32 md:pt-36 pb-24 px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(0,0,0,0)_0%,rgba(0,0,0,0.2)_100%)]" />
        <div className="container mx-auto max-w-4xl relative z-10 text-center flex flex-col items-center">
          <div className="h-16 w-16 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm mb-6">
            <Truck className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">{t("tracking.title")}</h1>
          <p className="text-lg text-white/90 max-w-lg mx-auto">
            {t("tracking.subtitle")}
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 -mt-12 pb-24 max-w-4xl flex-1 flex flex-col">
        {/* Form */}
        <Card className="p-6 md:p-8 shadow-xl border-border/50 bg-white mb-8 relative z-20">
          <TrackingForm initialValue={trackingNumber} onSubmit={handleSearch} />
        </Card>

        {/* Content Area */}
        <div className="flex-1">
          <AnimatePresence mode="wait">
            {!hasSearched && !loading && (
              <motion.div 
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-16 text-center"
              >
                <div className="h-24 w-24 bg-red-50 rounded-full flex items-center justify-center mb-6">
                  <Package className="h-10 w-10 text-[#E10600]" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">{t("tracking.empty.title")}</h3>
                <p className="text-muted-foreground max-w-sm">
                  {t("tracking.empty.subtitle")}
                </p>
              </motion.div>
            )}

            {loading && (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full"
              >
                <Card className="w-full overflow-hidden">
                  <div className="p-6 border-b bg-muted/30">
                    <Skeleton className="h-8 w-1/3 mb-2" />
                    <Skeleton className="h-5 w-1/4" />
                  </div>
                  <div className="p-8">
                    <div className="space-y-8">
                      {[1,2,3].map(i => (
                        <div key={i} className="flex gap-4">
                          <Skeleton className="h-6 w-6 rounded-full shrink-0" />
                          <div className="space-y-2 flex-1">
                            <Skeleton className="h-5 w-1/4" />
                            <Skeleton className="h-4 w-1/6" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              </motion.div>
            )}

            {error && !loading && (
              <motion.div
                key="error"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-16 text-center"
              >
                <div className="h-20 w-20 bg-red-100 rounded-full flex items-center justify-center mb-6">
                  <XCircle className="h-10 w-10 text-[#E10600]" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">
                  {error === "blocked"
                    ? t("tracking.upstreamError.title")
                    : t("tracking.error.title")}
                </h3>
                <p className="text-muted-foreground max-w-sm mb-6">
                  {error === "blocked"
                    ? t("tracking.upstreamError.subtitle")
                    : t("tracking.error.subtitle")}
                </p>
                {error === "blocked" && trackingNumber && (
                  <Button
                    asChild
                    className="bg-[#E10600] hover:bg-[#C10500] text-white"
                    data-testid="btn-open-ecotrack"
                  >
                    <a
                      href={getEcotrackFallbackUrl(
                        trackingNumber,
                        i18n.resolvedLanguage || i18n.language || "fr",
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("tracking.upstreamError.openExternal")}
                      <ExternalLink className="h-4 w-4 ms-2" />
                    </a>
                  </Button>
                )}
              </motion.div>
            )}

            {result && !loading && (
              <motion.div key="result">
                <TrackingResult result={result} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Trust row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 pt-16 border-t">
          {[
            { icon: Shield, title: t("tracking.trustRow.secure.title"), desc: t("tracking.trustRow.secure.desc") },
            { icon: Phone, title: t("tracking.trustRow.support.title"), desc: t("tracking.trustRow.support.desc") },
            { icon: Truck, title: t("tracking.trustRow.fast.title"), desc: t("tracking.trustRow.fast.desc") }
          ].map((item, i) => (
            <div key={i} className="flex flex-col items-center text-center gap-3">
              <div className="h-12 w-12 rounded-full bg-white shadow-sm flex items-center justify-center border text-[#E10600]">
                <item.icon className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-semibold text-sm">{item.title}</h4>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
