import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SUPPORTED_LANGUAGES, SupportedLanguage } from "@/lib/i18n";

const labelFor: Record<SupportedLanguage, string> = {
  fr: "FR",
  ar: "AR",
  en: "EN",
};

const fullLabelKey: Record<SupportedLanguage, string> = {
  fr: "language.fr",
  ar: "language.ar",
  en: "language.en",
};

interface LanguageSwitcherProps {
  variant?: "compact" | "full";
  className?: string;
}

export function LanguageSwitcher({ variant = "compact", className = "" }: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation();
  const current = (i18n.resolvedLanguage || i18n.language || "fr") as SupportedLanguage;

  const handleChange = (lng: SupportedLanguage) => {
    i18n.changeLanguage(lng);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={variant === "compact" ? "sm" : "default"}
          className={`gap-2 font-semibold ${className}`}
          aria-label={t("language.label")}
        >
          <Globe className="h-4 w-4" />
          <span>{labelFor[current]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {SUPPORTED_LANGUAGES.map((lng) => (
          <DropdownMenuItem
            key={lng}
            onClick={() => handleChange(lng)}
            className={current === lng ? "font-bold text-primary" : ""}
          >
            {t(fullLabelKey[lng])}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
