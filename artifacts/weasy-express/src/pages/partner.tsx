import { useState, ChangeEvent, FormEvent } from "react";
import { UserPlus, Loader2 } from "lucide-react";
import partnerImg from "@assets/became_partner_1777743436178.jpeg";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

function getPasswordStrength(password: string): { score: number } {
  let score = 0;
  if (password.length >= 6) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score++;
  return { score };
}

export default function PartnerPage() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const isRtl = i18n.language === "ar";

  const strengthLabel = (score: number) => {
    if (score <= 2) return t("partner.strengthWeak");
    if (score <= 3) return t("partner.strengthMedium");
    return t("partner.strengthStrong");
  };
  const strengthColor = (score: number) => {
    if (score <= 2) return "bg-red-500";
    if (score <= 3) return "bg-yellow-500";
    return "bg-green-500";
  };
  const strengthTextColor = (score: number) => {
    if (score <= 2) return "text-red-500";
    if (score <= 3) return "text-yellow-600";
    return "text-green-600";
  };

  const [form, setForm] = useState({
    lastName: "",
    firstName: "",
    email: "",
    password: "",
    confirmPassword: "",
    phone: "",
    address: "",
    city: "",
    parcelsPerMonth: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { score } = getPasswordStrength(form.password);

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!form.lastName.trim()) newErrors.lastName = t("partner.errors.lastName");
    if (!form.firstName.trim()) newErrors.firstName = t("partner.errors.firstName");
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      newErrors.email = t("partner.errors.email");
    const { score: s } = getPasswordStrength(form.password);
    if (form.password.length < 6) newErrors.password = t("partner.errors.passwordShort");
    else if (s < 3) newErrors.password = t("partner.errors.passwordWeak");
    if (form.password !== form.confirmPassword) newErrors.confirmPassword = t("partner.errors.passwordMatch");
    if (!form.phone.trim()) newErrors.phone = t("partner.errors.phone");
    if (!form.address.trim()) newErrors.address = t("partner.errors.address");
    if (!form.city.trim()) newErrors.city = t("partner.errors.city");
    if (!form.parcelsPerMonth) newErrors.parcelsPerMonth = t("partner.errors.parcels");
    return newErrors;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const newErrors = validate();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/partner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          password: form.password,
          phone: form.phone,
          address: form.address,
          city: form.city,
          parcelsPerMonth: form.parcelsPerMonth,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !data.ok) {
        throw new Error("send_failed");
      }
      toast({ title: t("partner.successTitle"), description: t("partner.successDesc") });
      setForm({ lastName: "", firstName: "", email: "", password: "", confirmPassword: "", phone: "", address: "", city: "", parcelsPerMonth: "" });
    } catch {
      toast({
        title: t("partner.errorTitle"),
        description: t("partner.errorDesc"),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col w-full">
      <div className="bg-[linear-gradient(135deg,#E10600,#B80500)] text-white relative overflow-hidden">
        <div className="container mx-auto px-4 pt-32 md:pt-40 pb-16 md:pb-24 relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="max-w-xl">
            <div className="h-16 w-16 bg-white/20 rounded-2xl flex items-center justify-center mb-6">
              <UserPlus className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">{t("partner.pageTitle")}</h1>
            <p className="text-lg text-white/90">{t("partner.pageSubtitle")}</p>
          </div>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl rotate-3 transform-gpu shrink-0">
            <img src={partnerImg} alt="Become a Partner" className="w-full h-auto object-cover" />
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <Card className="shadow-xl border-border/50 overflow-hidden">
          <div className="p-8 border-b bg-muted/20">
            <h2 className="text-2xl font-bold">{t("partner.cardTitle")}</h2>
            <p className="text-muted-foreground mt-1">{t("partner.cardSubtitle")}</p>
          </div>
          <CardContent className="p-8">
            <form onSubmit={handleSubmit} className="space-y-6" dir={isRtl ? "rtl" : "ltr"} noValidate>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Field label={t("partner.lastName")} error={errors.lastName}>
                  <Input placeholder={t("partner.lastNamePh")} value={form.lastName} onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange("lastName", e.target.value)} className="h-12" />
                </Field>
                <Field label={t("partner.firstName")} error={errors.firstName}>
                  <Input placeholder={t("partner.firstNamePh")} value={form.firstName} onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange("firstName", e.target.value)} className="h-12" />
                </Field>
              </div>

              <Field label={t("partner.email")} error={errors.email}>
                <Input type="email" placeholder="you@email.com" dir="ltr" value={form.email} onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange("email", e.target.value)} className="h-12" />
              </Field>

              <Field label={t("partner.password")} error={errors.password}>
                <Input
                  type="password"
                  placeholder={t("partner.passwordPh")}
                  dir="ltr"
                  value={form.password}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange("password", e.target.value)}
                  className="h-12"
                />
                {form.password.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i <= score ? strengthColor(score) : "bg-muted"}`} />
                      ))}
                    </div>
                    <p className={`text-xs font-medium ${strengthTextColor(score)}`}>
                      {t("partner.strengthLabel")} {strengthLabel(score)}
                    </p>
                  </div>
                )}
              </Field>

              <Field label={t("partner.confirmPassword")} error={errors.confirmPassword}>
                <Input
                  type="password"
                  placeholder={t("partner.confirmPasswordPh")}
                  dir="ltr"
                  value={form.confirmPassword}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange("confirmPassword", e.target.value)}
                  className="h-12"
                />
                {form.confirmPassword.length > 0 && form.password === form.confirmPassword && form.password.length >= 6 && (
                  <p className="text-xs text-green-600 mt-1">{t("partner.matchOk")}</p>
                )}
              </Field>

              <div className="border-t pt-6">
                <h3 className="font-bold text-lg mb-4">{t("partner.additionalInfo")}</h3>
                <div className="space-y-6">
                  <Field label={t("partner.phone")} error={errors.phone}>
                    <Input type="tel" placeholder="05XX XX XX XX" dir="ltr" value={form.phone} onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange("phone", e.target.value)} className="h-12" />
                  </Field>
                  <Field label={t("partner.address")} error={errors.address}>
                    <Input placeholder={t("partner.address")} value={form.address} onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange("address", e.target.value)} className="h-12" />
                  </Field>
                  <Field label={t("partner.city")} error={errors.city}>
                    <Input placeholder={t("partner.city")} value={form.city} onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange("city", e.target.value)} className="h-12" />
                  </Field>
                  <Field label={t("partner.parcelsPerMonth")} error={errors.parcelsPerMonth}>
                    <Select onValueChange={(v) => handleChange("parcelsPerMonth", v)} value={form.parcelsPerMonth}>
                      <SelectTrigger className="h-12">
                        <SelectValue placeholder={t("partner.parcelsPh")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0-10">0 - 10</SelectItem>
                        <SelectItem value="10-50">10 - 50</SelectItem>
                        <SelectItem value="50-100">50 - 100</SelectItem>
                        <SelectItem value="100+">100+</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </div>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-14 bg-[#E10600] hover:bg-[#B80500] text-white font-bold text-lg disabled:opacity-70"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    {t("partner.submitting")}
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-2 h-5 w-5" />
                    {t("partner.submit")}
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="font-medium">{label}</Label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
