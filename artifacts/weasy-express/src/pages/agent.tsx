import { useState, type FormEvent, type ReactNode } from "react";
import { BriefcaseBusiness, CheckCircle2, Loader2, MapPin, Users } from "lucide-react";
import agentImg from "@assets/image_1788620637437.png";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@/lib/api";
import { WILAYA_LIST } from "@/lib/wilayas";

type FormState = {
  fullName: string;
  wilayaCode: string;
  commune: string;
  phone: string;
  email: string;
  previousExperience: string;
  experienceYears: string;
  hasCommercialSpace: string;
  startAvailability: string;
};

const EMPTY_FORM: FormState = {
  fullName: "",
  wilayaCode: "",
  commune: "",
  phone: "",
  email: "",
  previousExperience: "",
  experienceYears: "",
  hasCommercialSpace: "",
  startAvailability: "",
};

export default function AgentPage() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const isRtl = i18n.language === "ar";
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.fullName.trim()) next.fullName = t("agent.errors.required");
    if (!form.wilayaCode) next.wilayaCode = t("agent.errors.required");
    if (!form.commune.trim()) next.commune = t("agent.errors.required");
    if (!form.phone.trim()) next.phone = t("agent.errors.required");
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = t("agent.errors.email");
    if (!form.previousExperience) next.previousExperience = t("agent.errors.required");
    if (form.previousExperience === "yes" && (!form.experienceYears || Number(form.experienceYears) < 0)) {
      next.experienceYears = t("agent.errors.years");
    }
    if (!form.hasCommercialSpace) next.hasCommercialSpace = t("agent.errors.required");
    if (!form.startAvailability) next.startAvailability = t("agent.errors.required");
    return next;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    const nextErrors = validate();
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE}/api/agent-applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          wilayaName: WILAYA_LIST.find((wilaya) => wilaya.code === form.wilayaCode)?.name ?? "",
          previousExperience: form.previousExperience === "yes",
          experienceYears: form.previousExperience === "yes" ? Number(form.experienceYears) : null,
          hasCommercialSpace: form.hasCommercialSpace === "yes",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 409 || data.error === "duplicate_application") {
        toast({ title: t("agent.duplicateTitle"), description: t("agent.duplicateDescription"), variant: "destructive" });
        return;
      }
      if (!response.ok || !data.ok) throw new Error(data.error ?? "submit_failed");
      toast({ title: t("agent.successTitle"), description: t("agent.successDescription") });
      setForm(EMPTY_FORM);
      setErrors({});
    } catch {
      toast({ title: t("agent.errorTitle"), description: t("agent.errorDescription"), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const fieldError = (field: string) => errors[field] ? <p className="text-xs text-red-600 mt-1">{errors[field]}</p> : null;

  return (
    <div className="flex flex-col w-full">
      <section className="bg-[linear-gradient(135deg,#E10600,#980500)] text-white overflow-hidden">
        <div className="container mx-auto px-4 pt-32 md:pt-40 pb-16 md:pb-24 grid md:grid-cols-[1fr_380px] items-center gap-10">
          <div className="max-w-2xl">
            <div className="h-16 w-16 bg-white/15 rounded-2xl flex items-center justify-center mb-6">
              <Users className="h-8 w-8" />
            </div>
            <p className="uppercase tracking-[0.2em] text-white/70 text-sm font-bold mb-3">{t("agent.badge")}</p>
            <h1 className="text-4xl md:text-6xl font-black leading-tight mb-5">{t("agent.pageTitle")}</h1>
            <p className="text-lg md:text-xl text-white/85 max-w-xl">{t("agent.pageSubtitle")}</p>
            <div className="flex flex-wrap gap-3 mt-8 text-sm font-semibold">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/20 px-4 py-2"><MapPin className="h-4 w-4" />{t("agent.coverage")}</span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/20 px-4 py-2"><BriefcaseBusiness className="h-4 w-4" />{t("agent.opportunity")}</span>
            </div>
          </div>
          <div className="rounded-3xl overflow-hidden shadow-2xl rotate-2 border border-white/20">
            <img src={agentImg} alt={t("agent.imageAlt")} className="w-full aspect-[4/5] object-cover" />
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-14 md:py-20 max-w-4xl">
        <Card className="shadow-xl border-border/50 overflow-hidden">
          <div className="p-7 md:p-9 border-b bg-muted/20">
            <h2 className="text-2xl md:text-3xl font-bold">{t("agent.formTitle")}</h2>
            <p className="text-muted-foreground mt-2">{t("agent.formSubtitle")}</p>
          </div>
          <CardContent className="p-7 md:p-9">
            <form onSubmit={submit} className="space-y-6" dir={isRtl ? "rtl" : "ltr"} noValidate>
              <div className="grid md:grid-cols-2 gap-5">
                <Field label={t("agent.fields.fullName")} error={errors.fullName}>
                  <Input value={form.fullName} onChange={(event) => handleChange("fullName", event.target.value)} className="h-12" />
                </Field>
                <Field label={t("agent.fields.email")} error={errors.email}>
                  <Input type="email" dir="ltr" value={form.email} onChange={(event) => handleChange("email", event.target.value)} className="h-12" />
                </Field>
                <Field label={t("agent.fields.phone")} error={errors.phone}>
                  <Input type="tel" dir="ltr" value={form.phone} onChange={(event) => handleChange("phone", event.target.value)} className="h-12" />
                </Field>
                <Field label={t("agent.fields.wilaya")} error={errors.wilayaCode}>
                  <Select value={form.wilayaCode} onValueChange={(value) => handleChange("wilayaCode", value)}>
                    <SelectTrigger className="h-12"><SelectValue placeholder={t("agent.fields.wilayaPlaceholder")} /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {WILAYA_LIST.map((wilaya) => <SelectItem key={wilaya.code} value={wilaya.code}>{wilaya.code.replace("DZ", "")} — {wilaya.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t("agent.fields.commune")} error={errors.commune}>
                  <Input value={form.commune} onChange={(event) => handleChange("commune", event.target.value)} className="h-12" />
                </Field>
              </div>

              <div className="border-t pt-6 grid md:grid-cols-2 gap-5">
                <Field label={t("agent.fields.previousExperience")} error={errors.previousExperience}>
                  <Select value={form.previousExperience} onValueChange={(value) => handleChange("previousExperience", value)}>
                    <SelectTrigger className="h-12"><SelectValue placeholder={t("agent.fields.choose")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">{t("agent.yes")}</SelectItem>
                      <SelectItem value="no">{t("agent.no")}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {form.previousExperience === "yes" && (
                  <Field label={t("agent.fields.experienceYears")} error={errors.experienceYears}>
                    <Input type="number" min="0" max="80" value={form.experienceYears} onChange={(event) => handleChange("experienceYears", event.target.value)} className="h-12" />
                  </Field>
                )}
                <Field label={t("agent.fields.commercialSpace")} error={errors.hasCommercialSpace}>
                  <Select value={form.hasCommercialSpace} onValueChange={(value) => handleChange("hasCommercialSpace", value)}>
                    <SelectTrigger className="h-12"><SelectValue placeholder={t("agent.fields.choose")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">{t("agent.yes")}</SelectItem>
                      <SelectItem value="no">{t("agent.no")}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t("agent.fields.startAvailability")} error={errors.startAvailability}>
                  <Select value={form.startAvailability} onValueChange={(value) => handleChange("startAvailability", value)}>
                    <SelectTrigger className="h-12"><SelectValue placeholder={t("agent.fields.choose")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="immediately">{t("agent.start.immediately")}</SelectItem>
                      <SelectItem value="after_week">{t("agent.start.afterWeek")}</SelectItem>
                      <SelectItem value="after_month">{t("agent.start.afterMonth")}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Button type="submit" disabled={isSubmitting} className="w-full h-14 bg-[#E10600] hover:bg-[#B80500] text-white font-bold text-lg">
                {isSubmitting ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />{t("agent.submitting")}</> : <><CheckCircle2 className="mr-2 h-5 w-5" />{t("agent.submit")}</>}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <Label className="text-sm font-semibold text-slate-700 mb-2 block">{label}</Label>
      {children}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}