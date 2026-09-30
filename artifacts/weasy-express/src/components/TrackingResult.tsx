import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  Check,
  Truck,
  Package,
  Building2,
  User,
  Hash,
  Warehouse,
  ArrowRight,
  Clock,
} from "lucide-react";
import {
  TrackingResult as TrackingResultType,
  getStatusKind,
} from "@/lib/tracking";
import { motion } from "framer-motion";

const variantColor: Record<string, string> = {
  primary: "bg-blue-500 border-blue-500 text-white",
  success: "bg-green-500 border-green-500 text-white",
  danger: "bg-red-500 border-red-500 text-white",
  warning: "bg-amber-500 border-amber-500 text-white",
  info: "bg-sky-500 border-sky-500 text-white",
  secondary: "bg-slate-400 border-slate-400 text-white",
};

export function TrackingResult({ result }: { result: TrackingResultType }) {
  const { t } = useTranslation();
  const kind = getStatusKind(result);

  const badgeColor =
    kind === "delivered"
      ? "bg-green-600 hover:bg-green-700"
      : kind === "cancelled"
      ? "bg-gray-600 hover:bg-gray-700"
      : "bg-blue-600 hover:bg-blue-700";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="grid grid-cols-1 lg:grid-cols-3 gap-6"
    >
      {/* Left: timeline */}
      <Card className="lg:col-span-2 overflow-hidden shadow-sm border-border/50">
        <CardHeader className="bg-muted/30 border-b pb-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <p className="text-sm text-muted-foreground font-medium mb-1">
                {t("tracking.result.number")}
              </p>
              <h3
                className="text-xl font-mono font-bold tracking-tight"
                dir="ltr"
              >
                {result.trackingNumber}
              </h3>
            </div>
            {result.status && (
              <Badge
                className={`${badgeColor} text-white border-transparent text-sm px-3 py-1.5`}
              >
                {result.status}
              </Badge>
            )}
          </div>
        </CardHeader>

        {/* Progress steps */}
        {result.steps.length > 0 && (
          <div className="px-6 pt-6">
            <div className="flex items-start justify-between gap-2 relative">
              <div className="absolute top-4 left-4 right-4 h-0.5 bg-muted -z-10" />
              {result.steps.map((step, i) => (
                <div
                  key={i}
                  className="flex flex-col items-center text-center gap-2 flex-1"
                >
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all ${
                      step.completed
                        ? "bg-[#E10600] border-[#E10600] text-white shadow-md shadow-red-500/30"
                        : "bg-background border-muted text-muted-foreground"
                    } ${step.active ? "ring-4 ring-red-200" : ""}`}
                  >
                    {step.completed ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <span className="text-xs font-bold">{i + 1}</span>
                    )}
                  </div>
                  <p
                    className={`text-xs font-medium leading-tight max-w-[110px] ${
                      step.completed
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {step.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <CardContent className="pt-6 pb-8 px-6 sm:px-8">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4" /> {t("tracking.result.history")}
          </h4>
          <div className="relative ps-6 border-s-2 border-muted">
            {result.events.map((ev, index) => {
              const isLast = index === result.events.length - 1;
              const dotClass =
                variantColor[ev.variant] ?? variantColor["info"];
              return (
                <div
                  key={index}
                  className={`relative ${!isLast ? "mb-6" : ""}`}
                >
                  <div
                    className={`absolute -start-[35px] top-0.5 h-6 w-6 rounded-full flex items-center justify-center border-2 ${dotClass}`}
                  >
                    {ev.number ?? "•"}
                  </div>
                  <p className="font-semibold text-base text-foreground leading-snug">
                    {ev.title}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground mt-1">
                    {ev.date && (
                      <span className="inline-flex items-center gap-1.5" dir="ltr">
                        <Clock className="h-3.5 w-3.5" />
                        {ev.date}
                      </span>
                    )}
                    {ev.location && (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-[#E10600]" />
                        {ev.location}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {result.events.length === 0 && (
              <p className="text-sm text-muted-foreground italic">
                {t("tracking.result.noEvents")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Right: parcel info */}
      <div className="lg:col-span-1 space-y-4">
        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-3">
            <h4 className="font-bold text-base flex items-center gap-2 text-[#1A1A1A]">
              <Package className="h-5 w-5 text-[#E10600]" />
              {t("tracking.result.parcelInfo")}
            </h4>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <InfoRow
              icon={<Hash className="h-4 w-4 text-emerald-600" />}
              label={t("tracking.result.number")}
              value={result.trackingNumber}
              mono
            />
            {result.carrier && (
              <InfoRow
                icon={<Building2 className="h-4 w-4 text-slate-600" />}
                label={t("tracking.result.carrier")}
                value={result.carrier}
              />
            )}
            {result.sender && (
              <InfoRow
                icon={<User className="h-4 w-4 text-sky-600" />}
                label={t("tracking.result.sender")}
                value={result.sender}
              />
            )}
            {(result.originWilaya || result.destinationWilaya) && (
              <div className="grid grid-cols-2 gap-3 pt-2">
                {result.originWilaya && (
                  <RouteCard
                    label={t("tracking.result.from")}
                    value={result.originWilaya}
                    color="emerald"
                  />
                )}
                {result.destinationWilaya && (
                  <RouteCard
                    label={t("tracking.result.to")}
                    value={result.destinationWilaya}
                    color="red"
                  />
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {(result.hub.name || result.hub.address) && (
          <Card className="shadow-sm border-border/50">
            <CardHeader className="pb-3">
              <h4 className="font-bold text-base flex items-center gap-2 text-[#1A1A1A]">
                <Warehouse className="h-5 w-5 text-[#E10600]" />
                {t("tracking.result.hub")}
              </h4>
            </CardHeader>
            <CardContent className="pt-0 space-y-1.5">
              {result.hub.name && (
                <p className="font-semibold text-sm flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-[#E10600] shrink-0" />
                  {result.hub.name}
                </p>
              )}
              {result.hub.address && (
                <p className="text-sm text-muted-foreground leading-relaxed ps-6">
                  {result.hub.address}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </motion.div>
  );
}

function InfoRow({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p
          className={`font-semibold text-sm break-words ${
            mono ? "font-mono" : ""
          }`}
          dir={mono ? "ltr" : undefined}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function RouteCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: "emerald" | "red";
}) {
  const colorMap = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    red: "bg-red-50 text-[#E10600] border-red-100",
  };
  return (
    <div className={`rounded-lg border p-3 ${colorMap[color]}`}>
      <p className="text-[10px] uppercase tracking-wide font-semibold opacity-80">
        {label}
      </p>
      <p className="font-bold text-sm mt-1 flex items-center gap-1.5">
        <MapPin className="h-3.5 w-3.5" />
        {value}
      </p>
    </div>
  );
}
