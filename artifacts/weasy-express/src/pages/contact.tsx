import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Mail, Phone, Clock, MapPin, Send, Loader2, MessageCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ContactImage from "@assets/WhatsApp_Image_2026-04-25_at_12.54.22_PM_(1)_1777118737136.jpeg";

export default function ContactPage() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [subjectValue, setSubjectValue] = useState("");

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload = {
      name: String(fd.get("name") ?? ""),
      email: String(fd.get("email") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      subject: subjectValue,
      message: String(fd.get("message") ?? ""),
    };

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !data.ok) {
        throw new Error("send_failed");
      }
      toast({
        title: t("contact.sentTitle"),
        description: t("contact.sentDesc"),
      });
      form.reset();
      setSubjectValue("");
    } catch {
      toast({
        title: t("contact.errorTitle"),
        description: t("contact.errorDesc"),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col w-full">
      {/* Hero Strip */}
      <div className="bg-[linear-gradient(135deg,#E10600,#B80500)] text-white relative overflow-hidden">
        <div className="container mx-auto px-4 pt-32 md:pt-40 pb-16 md:pb-24 relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="max-w-xl">
            <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">{t("contact.title")}</h1>
            <p className="text-lg text-white/90">
              {t("contact.subtitle")}
            </p>
          </div>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl rotate-3 transform-gpu">
             <img src={ContactImage} alt="Service Client" className="w-full h-auto object-cover" />
          </div>
        </div>
      </div>

      {/* Main Section */}
      <div className="container mx-auto px-4 py-16 max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
          
          {/* Left Column - Info */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            <h2 className="text-2xl font-bold mb-2">{t("contact.coordinates")}</h2>
            
            <Card className="bg-white border-transparent shadow-sm">
              <CardContent className="p-6 flex items-start gap-4">
                <div className="h-12 w-12 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                  <Mail className="h-6 w-6 text-[#E10600]" />
                </div>
                <div className="flex flex-col gap-3 w-full">
                  <div>
                    <p className="text-sm text-muted-foreground font-medium mb-1">{t("contact.email")}</p>
                    <a href="mailto:support@weasyexpress.com" className="font-semibold hover:text-[#E10600] transition-colors" dir="ltr">
                      support@weasyexpress.com
                    </a>
                  </div>
                  <div className="border-t pt-3">
                    <p className="text-sm text-muted-foreground font-medium mb-1">WhatsApp</p>
                    <a
                      href="https://wa.me/213654970662"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 font-semibold text-[#25D366] hover:text-[#1db954] transition-colors"
                      dir="ltr"
                    >
                      <MessageCircle className="h-4 w-4" />
                      Discutez avec nous
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-transparent shadow-sm">
              <CardContent className="p-6 flex items-start gap-4">
                <div className="h-12 w-12 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                  <Phone className="h-6 w-6 text-[#E10600]" />
                </div>
                <div className="flex flex-col gap-3 w-full">
                  <div>
                    <p className="text-sm text-muted-foreground font-medium mb-1">Service client</p>
                    <div className="flex flex-col gap-0.5">
                      <a href="tel:0654970662" className="font-semibold hover:text-[#E10600] transition-colors" dir="ltr">0654 97 06 62</a>
                      <a href="tel:0671722736" className="font-semibold hover:text-[#E10600] transition-colors" dir="ltr">0671 72 27 36</a>
                    </div>
                  </div>
                  <div className="border-t pt-3">
                    <p className="text-sm text-muted-foreground font-medium mb-1">Service Commercial</p>
                    <a href="tel:0659067252" className="font-semibold hover:text-[#E10600] transition-colors" dir="ltr">0659 06 72 52</a>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-transparent shadow-sm">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                  <Clock className="h-6 w-6 text-[#E10600]" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-medium mb-1">{t("contact.hours")}</p>
                  <p className="font-semibold">{t("contact.hoursWeek")}</p>
                  <p className="text-sm text-muted-foreground">{t("contact.hoursFriday")}</p>
                  <p className="text-xs text-muted-foreground italic mt-1">{t("contact.hoursNote")}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Form */}
          <div className="lg:col-span-7">
            <Card className="bg-white border-border/50 shadow-xl overflow-hidden">
              <div className="p-8 border-b bg-muted/20">
                <h2 className="text-2xl font-bold">{t("contact.formTitle")}</h2>
                <p className="text-muted-foreground mt-2">{t("contact.formSubtitle")}</p>
              </div>
              <CardContent className="p-8">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="name">{t("contact.fullName")}</Label>
                      <Input id="name" name="name" required placeholder={t("contact.fullNamePh")} className="h-12" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">{t("contact.emailLabel")}</Label>
                      <Input id="email" name="email" type="email" required placeholder={t("contact.emailPh")} className="h-12" />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="phone">{t("contact.phoneLabel")}</Label>
                      <Input id="phone" name="phone" type="tel" placeholder={t("contact.phonePh")} className="h-12" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="subject">{t("contact.subject")}</Label>
                      <Select required value={subjectValue} onValueChange={setSubjectValue}>
                        <SelectTrigger className="h-12">
                          <SelectValue placeholder={t("contact.subjectPh")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="info">{t("contact.subjectInfo")}</SelectItem>
                          <SelectItem value="claim">{t("contact.subjectClaim")}</SelectItem>
                          <SelectItem value="partner">{t("contact.subjectPartner")}</SelectItem>
                          <SelectItem value="other">{t("contact.subjectOther")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message">{t("contact.message")}</Label>
                    <Textarea 
                      id="message" 
                      name="message"
                      required 
                      placeholder={t("contact.messagePh")} 
                      className="min-h-[150px] resize-y"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-14 bg-[#E10600] hover:bg-[#B80500] text-white font-bold text-lg disabled:opacity-70"
                  >
                    {isSubmitting ? (
                      <>
                        {t("contact.sending")}
                        <Loader2 className="ml-2 h-5 w-5 animate-spin" />
                      </>
                    ) : (
                      <>
                        {t("contact.send")} <Send className="ml-2 h-5 w-5" />
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

        </div>
      </div>
      
      {/* Quick Contact Strip */}
      <div className="bg-red-50 py-12 mt-8">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center divide-y md:divide-y-0 md:divide-x divide-red-200">
            <div className="flex flex-col items-center pt-4 md:pt-0">
              <Phone className="h-8 w-8 text-[#E10600] mb-3" />
              <h4 className="font-bold mb-1">{t("contact.quick.call.title")}</h4>
              <p className="text-muted-foreground text-sm">{t("contact.quick.call.desc")}</p>
            </div>
            <div className="flex flex-col items-center pt-4 md:pt-0">
              <Mail className="h-8 w-8 text-[#E10600] mb-3" />
              <h4 className="font-bold mb-1">{t("contact.quick.write.title")}</h4>
              <p className="text-muted-foreground text-sm">{t("contact.quick.write.desc")}</p>
            </div>
            <div className="flex flex-col items-center pt-4 md:pt-0">
              <MapPin className="h-8 w-8 text-[#E10600] mb-3" />
              <h4 className="font-bold mb-1">{t("contact.quick.visit.title")}</h4>
              <p className="text-muted-foreground text-sm">{t("contact.quick.visit.desc")}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
