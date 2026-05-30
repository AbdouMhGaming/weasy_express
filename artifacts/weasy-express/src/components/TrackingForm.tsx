import { useState, FormEvent, useEffect } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface TrackingFormProps {
  initialValue?: string;
  onSubmit?: (trackingNumber: string) => void;
  className?: string;
}

export function TrackingForm({ initialValue = "", onSubmit, className = "" }: TrackingFormProps) {
  const [trackingNumber, setTrackingNumber] = useState(initialValue);
  const [, setLocation] = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    if (initialValue) {
      setTrackingNumber(initialValue);
    }
  }, [initialValue]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const val = trackingNumber.trim();
    if (!val) return;
    
    if (onSubmit) {
      onSubmit(val);
    } else {
      setLocation(`/tracking?number=${encodeURIComponent(val)}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={`flex w-full gap-2 ${className}`}>
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          type="text"
          placeholder={t("tracking.placeholder")}
          value={trackingNumber}
          onChange={(e) => setTrackingNumber(e.target.value)}
          className="pl-10 h-12 text-base rounded-md border-muted/50 focus-visible:ring-[#E10600]"
        />
      </div>
      <Button type="submit" className="h-12 px-6 bg-[#E10600] hover:bg-[#B80500] text-white rounded-md text-base font-semibold">
        {t("tracking.track")}
      </Button>
    </form>
  );
}
