import { FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Truck, Check, Search, Package, ArrowRight, Zap, Banknote, MapPinned, ShieldCheck, Lock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getTrackingStatus, TrackingResult, getStatusKind, TrackingFetchError } from "@/lib/tracking";
import HeroImage from "@assets/WhatsApp_Image_2026-04-25_at_12.54.22_PM_1777118737136.jpeg";
import ShieldImage from "@assets/WhatsApp_Image_2026-04-25_at_12.54.23_PM_1777118737137.jpeg";
import VanImage from "@assets/Picsart_26-04-25_15-16-41-467_1777128939021.png";
import AlgeriaMapSvg from "@/assets/algeria-map.svg?raw";
import { WILAYA_ZONES } from "@/lib/wilayas";

const algeriaMapMarkup = AlgeriaMapSvg
  .replace(/fill="#6f9c76"/g, 'fill="currentColor"')
  .replace(/stroke="#ffffff"/g, 'stroke="rgba(255,255,255,0.85)"');

const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.2 }
  }
};

function AnimatedNumber({ value, label }: { value: string, label: string }) {
  return (
    <motion.div variants={fadeInUp} className="flex flex-col items-center text-center p-6">
      <span className="text-4xl md:text-6xl font-bold text-[#E10600] mb-2" dir="ltr">{value}</span>
      <span className="text-white/80 font-medium text-lg">{label}</span>
    </motion.div>
  );
}

export default function HomePage() {
  const { t, i18n } = useTranslation();
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingState, setTrackingState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [trackingResult, setTrackingResult] = useState<TrackingResult | null>(null);
  const [trackingError, setTrackingError] = useState<string>("");

  const mapWrapperRef = useRef<HTMLDivElement | null>(null);
  const [hoveredWilaya, setHoveredWilaya] = useState<{ name: string; eta: string } | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    const wrapper = mapWrapperRef.current;
    if (!wrapper) return;

    const findWilayaPath = (target: EventTarget | null): SVGElement | null => {
      let el = target as Element | null;
      while (el && el !== wrapper) {
        if (el instanceof SVGElement && el.tagName.toLowerCase() === "path") {
          const id = el.getAttribute("id") || "";
          if (/^DZ\d{2}$/.test(id)) return el;
        }
        el = el.parentElement;
      }
      return null;
    };

    let activePath: SVGElement | null = null;

    const setActive = (path: SVGElement | null) => {
      if (activePath && activePath !== path) {
        activePath.style.removeProperty("filter");
        activePath.style.removeProperty("opacity");
      }
      activePath = path;
      if (path) {
        path.style.filter = "brightness(1.35) drop-shadow(0 0 6px rgba(255,255,255,0.45))";
        path.style.opacity = "1";
      }
    };

    const handleMove = (e: MouseEvent) => {
      const path = findWilayaPath(e.target);
      if (path) {
        const id = path.getAttribute("id") || "";
        const name = path.getAttribute("name") || id;
        const zone = WILAYA_ZONES[id] ?? 4;
        const eta = t(`home.coverageMap.zone${zone}`);
        setHoveredWilaya({ name, eta });
        setActive(path);
      } else {
        setActive(null);
        setHoveredWilaya(null);
      }
      const rect = wrapper.getBoundingClientRect();
      setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };

    const handleLeave = () => {
      setActive(null);
      setHoveredWilaya(null);
    };

    wrapper.addEventListener("mousemove", handleMove);
    wrapper.addEventListener("mouseleave", handleLeave);
    return () => {
      wrapper.removeEventListener("mousemove", handleMove);
      wrapper.removeEventListener("mouseleave", handleLeave);
      setActive(null);
    };
  }, [t]);

  const handleTrack = async (e: FormEvent) => {
    e.preventDefault();
    const val = trackingNumber.trim();
    if (!val) return;
    setTrackingState("loading");
    setTrackingError("");
    try {
      const result = await getTrackingStatus(val, i18n.resolvedLanguage || i18n.language || "fr");
      setTrackingResult(result);
      setTrackingState("success");
    } catch (err) {
      setTrackingState("error");
      setTrackingResult(null);
      if (err instanceof TrackingFetchError && err.kind === "not_found") {
        setTrackingError(t("home.quickTrack.notFound"));
      } else {
        setTrackingError(t("home.quickTrack.genericError"));
      }
    }
  };

  const services = [
    { icon: Zap, title: t("home.services.express.title"), desc: t("home.services.express.desc") },
    { icon: Banknote, title: t("home.services.cod.title"), desc: t("home.services.cod.desc") },
    { icon: Package, title: t("home.services.pickup.title"), desc: t("home.services.pickup.desc") },
    { icon: MapPinned, title: t("home.services.coverage.title"), desc: t("home.services.coverage.desc") },
  ];

  const ecommerceFeatures = [
    { title: t("home.ecommerce.fast.title"), desc: t("home.ecommerce.fast.desc") },
    { title: t("home.ecommerce.cod.title"), desc: t("home.ecommerce.cod.desc") },
    { title: t("home.ecommerce.tracking.title"), desc: t("home.ecommerce.tracking.desc") },
  ];

  const safetyItems = [
    { icon: ShieldCheck, title: t("home.safety.packaging.title"), desc: t("home.safety.packaging.desc") },
    { icon: Lock, title: t("home.safety.tracking.title"), desc: t("home.safety.tracking.desc") },
    { icon: Truck, title: t("home.safety.handling.title"), desc: t("home.safety.handling.desc") },
  ];

  const processSteps = [
    { icon: Package, title: t("home.process.order.title"), desc: t("home.process.order.desc") },
    { icon: Zap, title: t("home.process.pickup.title"), desc: t("home.process.pickup.desc") },
    { icon: MapPinned, title: t("home.process.transit.title"), desc: t("home.process.transit.desc") },
    { icon: CheckCircle2, title: t("home.process.delivered.title"), desc: t("home.process.delivered.desc") },
  ];

  return (
    <div className="flex flex-col w-full">
      {/* 2. Hero */}
      <section className="relative w-full text-white overflow-hidden pt-32 md:pt-40 pb-16 md:pb-24 bg-[#7A0300]">
        {/* Layered themed background */}
        <div className="absolute inset-0 -z-0" aria-hidden="true">
          {/* Base diagonal gradient */}
          <div className="absolute inset-0 bg-[linear-gradient(135deg,#E10600_0%,#B80500_55%,#7A0300_100%)]" />
          {/* Warm spotlight from top-left */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_55%_at_18%_18%,rgba(255,180,140,0.45),transparent_60%)]" />
          {/* Cool deep glow bottom-right for depth */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_55%_50%_at_85%_90%,rgba(60,0,0,0.55),transparent_60%)]" />
          {/* Subtle conic shimmer for premium feel */}
          <div className="absolute inset-0 opacity-40 mix-blend-overlay bg-[conic-gradient(from_220deg_at_70%_30%,rgba(255,255,255,0.15),transparent_30%,rgba(255,255,255,0.08)_60%,transparent_85%)]" />
          {/* Logistics route lines (SVG pattern) */}
          <svg
            className="absolute inset-0 h-full w-full opacity-[0.18]"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="none"
          >
            <defs>
              <pattern
                id="route-grid"
                width="80"
                height="80"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M0 40 H80 M40 0 V80"
                  fill="none"
                  stroke="rgba(255,255,255,0.35)"
                  strokeWidth="1"
                  strokeDasharray="2 6"
                />
                <circle cx="40" cy="40" r="1.6" fill="rgba(255,255,255,0.5)" />
              </pattern>
              <radialGradient id="route-fade" cx="50%" cy="50%" r="65%">
                <stop offset="0%" stopColor="white" stopOpacity="1" />
                <stop offset="100%" stopColor="white" stopOpacity="0" />
              </radialGradient>
              <mask id="route-mask">
                <rect width="100%" height="100%" fill="url(#route-fade)" />
              </mask>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="url(#route-grid)"
              mask="url(#route-mask)"
            />
          </svg>
          {/* Curved route path with moving dash — evokes a delivery route */}
          <svg
            className="absolute inset-0 h-full w-full"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="none"
            viewBox="0 0 1440 720"
          >
            <path
              d="M -50 560 C 250 480, 420 660, 720 540 S 1200 380, 1500 480"
              fill="none"
              stroke="rgba(255,255,255,0.28)"
              strokeWidth="2"
              strokeDasharray="10 14"
              style={{ animation: "weasy-route 14s linear infinite" }}
            />
            <path
              d="M -50 200 C 220 280, 460 120, 760 220 S 1200 320, 1500 220"
              fill="none"
              stroke="rgba(255,255,255,0.18)"
              strokeWidth="1.5"
              strokeDasharray="6 12"
              style={{ animation: "weasy-route 22s linear infinite reverse" }}
            />
          </svg>
          {/* Floating soft orbs for motion */}
          <div className="absolute top-[12%] left-[8%] h-40 w-40 rounded-full bg-white/5 blur-3xl" />
          <div className="absolute bottom-[10%] right-[12%] h-56 w-56 rounded-full bg-orange-300/10 blur-3xl" />
          {/* Bottom gradient fade into next section */}
          <div className="absolute bottom-0 left-0 right-0 h-24 bg-[linear-gradient(to_bottom,transparent,rgba(0,0,0,0.18))]" />
        </div>
        <style>{`
          @keyframes weasy-route {
            from { stroke-dashoffset: 0; }
            to   { stroke-dashoffset: -240; }
          }
        `}</style>

        <div className="container mx-auto px-4 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <motion.div 
              className="flex flex-col gap-6"
              initial="hidden"
              animate="visible"
              variants={staggerContainer}
            >
              <motion.div variants={fadeInUp}>
                <span className="inline-block px-4 py-1.5 bg-white/20 backdrop-blur-md rounded-full text-sm font-semibold text-white/90">
                  {t("home.badge")}
                </span>
              </motion.div>
              
              <motion.h1 variants={fadeInUp} className="text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.1] tracking-tight">
                {t("home.heroTitle")} <Truck className="inline-block h-12 w-12 ml-2 mb-2" />
              </motion.h1>
              
              <motion.p variants={fadeInUp} className="text-xl md:text-2xl text-white/90 max-w-xl">
                {t("home.heroSubtitle")}
              </motion.p>
              
              <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-4 mt-4">
                <Link href="/tracking">
                  <Button
                    size="lg"
                    className="bg-white text-primary hover:bg-gray-100 font-bold w-full sm:w-auto h-14 px-8 text-lg"
                    data-testid="btn-hero-suivre"
                  >
                    <Search className="mr-2 h-5 w-5" />
                    {t("nav.trackPackage")}
                  </Button>
                </Link>
                <Link href="/partner">
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-white text-white hover:bg-white/10 font-bold w-full sm:w-auto h-14 px-8 text-lg bg-transparent"
                    data-testid="btn-hero-contact"
                  >
                    {t("home.becomePartner")}
                  </Button>
                </Link>
              </motion.div>
              
              <motion.div variants={fadeInUp} className="flex flex-wrap items-center gap-2 text-sm text-white/80 font-medium mt-6">
                <span>{t("home.statsLine.wilayas")}</span>
                <span>·</span>
                <span>{t("home.statsLine.delivered")}</span>
                <span>·</span>
                <span>{t("home.statsLine.satisfaction")}</span>
              </motion.div>
            </motion.div>
            
            <motion.div
              className="relative hidden md:block"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
            >
              <div className="relative w-full aspect-[5/4] mx-auto">
                {/* Decorative dotted grid pattern */}
                <div
                  className="absolute inset-0 opacity-[0.18]"
                  style={{
                    backgroundImage:
                      "radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)",
                    backgroundSize: "22px 22px",
                    maskImage:
                      "radial-gradient(ellipse at 50% 50%, black 30%, transparent 75%)",
                    WebkitMaskImage:
                      "radial-gradient(ellipse at 50% 50%, black 30%, transparent 75%)",
                  }}
                  aria-hidden="true"
                />

                {/* Concentric ring backdrop — pro stage feel */}
                <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
                  <div className="h-[78%] aspect-square rounded-full border border-white/15" />
                  <div className="absolute h-[60%] aspect-square rounded-full border border-white/20" />
                  <div className="absolute h-[44%] aspect-square rounded-full bg-white/5 backdrop-blur-[1px] border border-white/15" />
                </div>

                {/* Soft warm halo behind van */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_55%_45%_at_50%_55%,rgba(255,200,180,0.35),transparent_70%)]" aria-hidden="true" />

                {/* Decorative corner accents */}
                <div className="absolute top-4 left-4 h-10 w-10 border-l-2 border-t-2 border-white/30 rounded-tl-lg" aria-hidden="true" />
                <div className="absolute top-4 right-4 h-10 w-10 border-r-2 border-t-2 border-white/30 rounded-tr-lg" aria-hidden="true" />
                <div className="absolute bottom-4 left-4 h-10 w-10 border-l-2 border-b-2 border-white/30 rounded-bl-lg" aria-hidden="true" />
                <div className="absolute bottom-4 right-4 h-10 w-10 border-r-2 border-b-2 border-white/30 rounded-br-lg" aria-hidden="true" />

                {/* Floating decorative badges */}
                <div className="absolute top-[12%] right-[10%] flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 shadow-lg">
                  <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-xs font-medium text-white/90">{t("home.statsLine.satisfaction")}</span>
                </div>
                <div className="absolute bottom-[18%] left-[6%] flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 shadow-lg">
                  <Truck className="h-3.5 w-3.5 text-white" />
                  <span className="text-xs font-medium text-white/90">24/7</span>
                </div>

                {/* Soft elliptical ground shadow */}
                <div className="absolute bottom-[8%] left-1/2 -translate-x-1/2 h-5 w-[68%] rounded-[50%] bg-black/55 blur-2xl" aria-hidden="true" />

                {/* The van — clean, static, hero-grade */}
                <img
                  src={VanImage}
                  alt="Weasy Express delivery van"
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[94%] h-auto object-contain drop-shadow-[0_30px_30px_rgba(0,0,0,0.45)]"
                />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Tracking Widget - Overlapping Hero */}
      <section className="relative z-20 -mt-16 container mx-auto px-4">
        <Card className="shadow-xl border-0 overflow-hidden">
          <CardContent className="p-6 md:p-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-center">
              <div className="lg:col-span-1">
                <h3 className="font-display font-bold text-xl mb-2 flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  {t("home.quickTrack.title")}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {t("home.quickTrack.subtitle")}
                </p>
              </div>
              <div className="lg:col-span-2">
                <form onSubmit={handleTrack} className="flex flex-col sm:flex-row gap-3">
                  <Input
                    type="text"
                    placeholder={t("home.quickTrack.placeholder")}
                    className="h-14 text-lg"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    data-testid="input-quick-track"
                  />
                  <Button
                    type="submit"
                    size="lg"
                    className="h-14 px-8 font-bold shrink-0"
                    disabled={trackingState === "loading"}
                    data-testid="btn-quick-track"
                  >
                    {trackingState === "loading" ? t("home.quickTrack.searching") : t("home.quickTrack.track")}
                  </Button>
                </form>

                {trackingState === "success" && trackingResult && (() => {
                  const kind = getStatusKind(trackingResult);
                  const badgeClass =
                    kind === "delivered"
                      ? "bg-green-600 hover:bg-green-700"
                      : kind === "cancelled"
                      ? "bg-gray-600 hover:bg-gray-700"
                      : "bg-blue-600 hover:bg-blue-700";
                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-6 p-4 bg-muted/50 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-border"
                    >
                      <div className="min-w-0">
                        <div className="text-sm text-muted-foreground mb-1">
                          {t("home.quickTrack.package")} <span className="font-mono" dir="ltr">{trackingResult.trackingNumber}</span>
                        </div>
                        {trackingResult.destinationWilaya && (
                          <div className="font-medium text-foreground flex items-center gap-2">
                            {t("home.quickTrack.destination")} <span className="font-bold">{trackingResult.destinationWilaya}</span>
                          </div>
                        )}
                      </div>
                      {trackingResult.status && (
                        <Badge
                          className={`text-sm px-3 py-1 text-white border-transparent ${badgeClass}`}
                          data-testid="badge-quick-status"
                        >
                          {trackingResult.status}
                        </Badge>
                      )}
                      <Link href={`/tracking?number=${trackingResult.trackingNumber}`}>
                        <Button
                          variant="link"
                          size="sm"
                          className="text-primary p-0 h-auto"
                          data-testid="link-quick-details"
                        >
                          {t("home.quickTrack.details")} <ArrowRight className="ml-1 h-4 w-4" />
                        </Button>
                      </Link>
                    </motion.div>
                  );
                })()}

                {trackingState === "error" && (
                  <div className="mt-4 text-destructive text-sm font-medium">
                    {trackingError}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 4. Services Grid */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">{t("home.services.title")}</h2>
            <p className="text-muted-foreground text-lg">
              {t("home.services.subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {services.map((service, i) => (
              <motion.div
                key={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  visible: { opacity: 1, y: 0, transition: { delay: i * 0.1 } }
                }}
              >
                <Card className="h-full border-none shadow-sm hover:shadow-md transition-shadow group">
                  <CardContent className="p-8">
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary group-hover:text-white transition-colors text-primary">
                      <service.icon className="h-6 w-6" />
                    </div>
                    <h3 className="font-display font-bold text-xl mb-3">{service.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">{service.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Stats */}
      <section className="py-24 bg-[#1A1A1A]">
        <div className="container mx-auto px-4">
          <motion.div 
            className="grid grid-cols-1 md:grid-cols-3 gap-8 divide-y md:divide-y-0 md:divide-x divide-white/10"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            <AnimatedNumber value="10 000+" label={t("home.stats.delivered")} />
            <AnimatedNumber value="69" label={t("home.stats.wilayas")} />
            <AnimatedNumber value="98%" label={t("home.stats.satisfaction")} />
          </motion.div>
        </div>
      </section>

      {/* Coverage Map */}
      <section className="py-24 bg-gradient-to-b from-[#1A1A1A] to-[#0d0d0d] text-white relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)",
            backgroundSize: "26px 26px",
          }}
          aria-hidden="true"
        />
        <div className="container mx-auto px-4 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <motion.div
              className="lg:col-span-5"
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <Badge className="bg-primary hover:bg-primary mb-6 text-sm px-4 py-1.5 font-bold">
                {t("home.coverageMap.badge")}
              </Badge>
              <h2 className="font-display text-3xl md:text-5xl font-bold mb-6 leading-tight">
                {t("home.coverageMap.title")}
              </h2>
              <p className="text-lg text-white/70 mb-8 leading-relaxed">
                {t("home.coverageMap.subtitle")}
              </p>
              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full bg-[#E10600] shadow-[0_0_12px_rgba(225,6,0,0.7)]" />
                  <span className="text-sm font-medium text-white/80">{t("home.coverageMap.legendCovered")}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="relative flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-60 animate-ping" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
                  </span>
                  <span className="text-sm font-medium text-white/80">{t("home.coverageMap.legendHub")}</span>
                </div>
              </div>
            </motion.div>

            <motion.div
              className="lg:col-span-7 relative"
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
            >
              <div className="absolute -inset-8 bg-[radial-gradient(ellipse_at_center,rgba(225,6,0,0.18),transparent_70%)] blur-2xl" aria-hidden="true" />
              <div
                ref={mapWrapperRef}
                dir="ltr"
                className="relative w-full aspect-square max-w-2xl mx-auto text-[#E10600] [&_svg]:w-full [&_svg]:h-full [&_svg]:drop-shadow-[0_8px_30px_rgba(225,6,0,0.25)] [&_path[id^='DZ']]:transition-[filter,opacity] [&_path[id^='DZ']]:duration-150 [&_path[id^='DZ']]:cursor-pointer"
              >
                <div
                  className="contents"
                  dangerouslySetInnerHTML={{ __html: algeriaMapMarkup }}
                  aria-label="Algeria coverage map"
                  role="img"
                />
                {hoveredWilaya && (
                  <div
                    className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-full"
                    style={{ left: tooltipPos.x, top: tooltipPos.y - 14 }}
                  >
                    <div className="rounded-xl bg-white text-[#1A1A1A] shadow-2xl ring-1 ring-black/10 px-4 py-3 min-w-[180px]">
                      <div className="flex items-center gap-2 mb-1.5">
                        <MapPinned className="h-4 w-4 text-[#E10600]" />
                        <div className="font-bold text-sm leading-tight">{hoveredWilaya.name}</div>
                      </div>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                        {t("home.coverageMap.etaLabel")}
                      </div>
                      <div className="text-base font-bold text-[#E10600]" dir="ltr">
                        {hoveredWilaya.eta}
                      </div>
                      <div className="absolute left-1/2 -bottom-1.5 -translate-x-1/2 h-3 w-3 rotate-45 bg-white ring-1 ring-black/10" />
                    </div>
                  </div>
                )}
              </div>
              <p className="mt-6 text-center text-sm text-white/50 italic">
                {t("home.coverageMap.hint")}
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* 6. E-commerce */}
      <section className="py-24 bg-white overflow-hidden">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center max-w-6xl mx-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
              className="relative order-2 lg:order-1"
            >
              <div className="absolute -inset-4 bg-gradient-to-tr from-[#E10600]/15 via-transparent to-transparent blur-3xl rounded-full" aria-hidden="true" />
              <div className="relative aspect-[4/5] max-w-md mx-auto w-full">
                <img
                  src={HeroImage}
                  alt="Weasy Express partenaire e-commerce"
                  className="w-full h-full object-cover rounded-3xl shadow-2xl ring-1 ring-black/5"
                />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="flex flex-col gap-8 order-1 lg:order-2"
            >
              <div>
                <h2 className="text-3xl md:text-4xl font-bold mb-4 tracking-tight">{t("home.ecommerce.title")}</h2>
                <p className="text-lg text-muted-foreground">
                  {t("home.ecommerce.subtitle")}
                </p>
              </div>

              <div className="flex flex-col gap-6">
                {ecommerceFeatures.map((feature, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="mt-1 flex-shrink-0 h-6 w-6 rounded-full bg-red-100 flex items-center justify-center">
                      <Check className="h-4 w-4 text-[#E10600]" />
                    </div>
                    <div>
                      <h4 className="font-bold text-lg">{feature.title}</h4>
                      <p className="text-muted-foreground">{feature.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <Link href="/partner">
                  <Button className="h-12 px-8 bg-[#E10600] hover:bg-[#B80500] text-white font-semibold text-base w-fit">
                    {t("home.ecommerce.cta")}
                  </Button>
                </Link>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* 7. Safety Guarantee */}
      <section className="py-24 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-foreground via-foreground to-[#2a0000]"></div>

        <div className="container mx-auto px-4 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={{
                hidden: { opacity: 0, x: -30 },
                visible: { opacity: 1, x: 0, transition: { duration: 0.6 } }
              }}
              className="order-2 lg:order-1"
            >
              <Badge className="bg-primary hover:bg-primary mb-6 text-sm px-4 py-1.5 font-bold">
                {t("home.safety.badge")}
              </Badge>
              <h2 className="font-display text-3xl md:text-5xl font-bold mb-6 leading-tight">
                {t("home.safety.titleA")}<br />
                <span className="text-primary">{t("home.safety.titleB")}</span>
              </h2>
              <p className="text-lg text-white/80 mb-10 leading-relaxed">
                {t("home.safety.desc")}
              </p>

              <div className="space-y-5">
                {safetyItems.map((item, i) => (
                  <div key={i} className="flex gap-4 items-start">
                    <div className="w-11 h-11 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center shrink-0">
                      <item.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-bold text-lg mb-1">{item.title}</h4>
                      <p className="text-white/70">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={{
                hidden: { opacity: 0, scale: 0.9 },
                visible: { opacity: 1, scale: 1, transition: { duration: 0.7 } }
              }}
              className="order-1 lg:order-2 relative"
            >
              <div className="absolute -inset-4 bg-gradient-to-tr from-primary/30 to-transparent blur-3xl rounded-full"></div>
              <div className="relative rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 bg-[#E10600]">
                <img
                  src={ShieldImage}
                  alt="Weasy Express"
                  className="w-full h-auto object-contain"
                  data-testid="img-safety-guarantee"
                />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
              {t("home.process.title")}
            </h2>
            <p className="text-muted-foreground text-lg">
              {t("home.process.subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative">
            <div className="hidden md:block absolute top-12 left-[12%] right-[12%] h-0.5 bg-border z-0"></div>

            {processSteps.map((step, i) => (
              <div key={i} className="relative z-10 text-center">
                <div className="w-24 h-24 mx-auto bg-white border-4 border-muted rounded-full flex items-center justify-center mb-6 shadow-sm">
                  <step.icon className="h-10 w-10 text-primary" />
                </div>
                <h4 className="font-display font-bold text-xl mb-3">
                  {i + 1}. {step.title}
                </h4>
                <p className="text-muted-foreground">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 8. CTA */}
      <section className="py-20 bg-[linear-gradient(135deg,#E10600,#B80500)] text-center">
        <div className="container mx-auto px-4">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-2xl mx-auto flex flex-col items-center gap-8"
          >
            <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight">{t("home.cta.title")}</h2>
            <p className="text-white/90 text-lg">{t("home.cta.subtitle")}</p>
            <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
              <Link href="/contact">
                <Button className="h-14 px-8 bg-white text-[#E10600] hover:bg-white/90 text-lg font-bold w-full sm:w-auto">
                  {t("home.cta.contact")}
                </Button>
              </Link>
              <Link href="/partner">
                <Button variant="outline" className="h-14 px-8 border-white text-foreground sm:text-white hover:bg-white hover:text-[#E10600] bg-transparent text-lg font-bold w-full sm:w-auto">
                  {t("home.cta.partner")}
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
