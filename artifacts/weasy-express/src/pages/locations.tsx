import { useTranslation } from "react-i18next";
import { MapPin, Phone, ExternalLink, Star } from "lucide-react";
import { locations as staticLocations } from "@/lib/locations";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { API_BASE } from "@/lib/api";

interface ApiOffice {
  id: number;
  wilayaNumber: number;
  wilaya: string;
  commune: string | null;
  address: string;
  phone: string | null;
  mapsUrl: string;
  isPrincipal: boolean;
}

function buildSubIndex(wilayaNumber: number, allOffices: ApiOffice[], id: number): string {
  const siblings = allOffices.filter((l) => l.wilayaNumber === wilayaNumber);
  const num = String(wilayaNumber).padStart(2, "0");
  if (siblings.length <= 1) return num;
  const idx = siblings.findIndex((l) => l.id === id) + 1;
  return `${num}.${idx}`;
}

export default function LocationsPage() {
  const { t } = useTranslation();

  const fallback: ApiOffice[] = staticLocations.map((l, i) => ({
    id: i + 1,
    wilayaNumber: l.wilayaNumber,
    wilaya: l.wilaya,
    commune: l.commune ?? null,
    address: l.address,
    phone: l.phone ?? null,
    mapsUrl: l.mapsUrl,
    isPrincipal: l.isPrincipal ?? false,
  }));

  const [offices, setOffices] = useState<ApiOffice[]>(fallback);

  useEffect(() => {
    fetch(`${API_BASE}/api/locations`)
      .then((r) => r.json())
      .then((data: { ok: boolean; offices: ApiOffice[] }) => {
        if (data.ok && data.offices.length > 0) setOffices(data.offices);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col w-full bg-gray-50 min-h-screen">
      <div className="bg-[#1A1A1A] text-white pt-32 md:pt-36 pb-16 md:pb-20">
        <div className="container mx-auto px-4 max-w-6xl text-center flex flex-col items-center">
          <div className="h-16 w-16 bg-[#E10600] rounded-2xl flex items-center justify-center mb-6">
            <MapPin className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">{t("locations.title")}</h1>
          <p className="text-lg text-white/70 max-w-xl mx-auto">{t("locations.subtitle")}</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-16 max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {offices.map((loc, i) => {
            const code = buildSubIndex(loc.wilayaNumber, offices, loc.id);
            return (
              <motion.div key={loc.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                <Card className="h-full overflow-hidden flex flex-col bg-white border-transparent shadow-sm hover:shadow-md transition-shadow">
                  <div className="h-36 bg-[linear-gradient(135deg,#E10600,#B80500)] flex flex-col items-center justify-center gap-1.5 relative px-4">
                    <MapPin className="h-7 w-7 text-white/60" />
                    <div className="flex items-center gap-2 flex-wrap justify-center">
                      <span className="inline-flex items-center justify-center h-6 px-2 rounded bg-white/20 text-white text-xs font-bold tabular-nums tracking-wide shrink-0">{code}</span>
                      <h2 className="text-xl font-bold text-white">
                        {loc.commune && offices.filter((l) => l.wilayaNumber === loc.wilayaNumber).length > 1
                          ? <>{loc.commune}<span className="text-white/60">, </span>{loc.wilaya}</>
                          : loc.wilaya}
                      </h2>
                    </div>
                    {loc.isPrincipal && (
                      <Badge className="absolute top-3 right-3 bg-white text-[#E10600] hover:bg-white font-semibold">
                        <Star className="h-3 w-3 mr-1 fill-[#E10600]" /> {t("locations.principal")}
                      </Badge>
                    )}
                  </div>
                  <div className="p-6 flex-1 flex flex-col">
                    <div className="space-y-4 flex-1 mb-6">
                      <div className="flex items-start gap-3 text-muted-foreground">
                        <MapPin className="h-5 w-5 shrink-0 text-[#E10600] mt-0.5" />
                        <span className="leading-tight">{loc.address}</span>
                      </div>
                      {loc.phone && (
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <Phone className="h-5 w-5 shrink-0 text-[#E10600]" />
                          <a href={`tel:${loc.phone.replace(/\s+/g, "")}`} className="hover:text-foreground transition-colors font-medium" dir="ltr">{loc.phone}</a>
                        </div>
                      )}
                    </div>
                    <Button asChild variant="outline" className="w-full text-[#E10600] border-[#E10600]/20 hover:bg-red-50 hover:text-[#E10600] mt-auto">
                      <a href={loc.mapsUrl} target="_blank" rel="noopener noreferrer">
                        {t("locations.viewMaps")} <ExternalLink className="h-4 w-4 ml-2" />
                      </a>
                    </Button>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
