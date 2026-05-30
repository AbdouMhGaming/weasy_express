import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";

function Items({ text }: { text: string }) {
  return (
    <ul className="list-disc space-y-1 mr-6 mt-2">
      {text.split("|").map((item, i) => (
        <li key={i}>{item.trim()}</li>
      ))}
    </ul>
  );
}

export default function TermsPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  return (
    <div className="flex flex-col w-full">
      <div className="bg-[#1A1A1A] text-white pt-32 md:pt-36 pb-16 md:pb-20">
        <div className="container mx-auto px-4 max-w-4xl text-center flex flex-col items-center">
          <div className="h-16 w-16 bg-[#E10600] rounded-2xl flex items-center justify-center mb-6">
            <FileText className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">{t("terms.pageTitle")}</h1>
          <p className="text-lg text-white/70">{t("terms.pageSubtitle")}</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-16 max-w-4xl" dir={isRtl ? "rtl" : "ltr"}>
        <div className="space-y-8" style={{ textAlign: isRtl ? "right" : "left" }}>

          <p className="text-lg text-muted-foreground leading-relaxed">
            {t("terms.intro")}
          </p>

          <Section number="1" title={t("terms.s1Title")} isRtl={isRtl}>
            <p>{t("terms.s1Intro")}</p>
            <Items text={t("terms.s1Items")} />
          </Section>

          <Section number="2" title={t("terms.s2Title")} isRtl={isRtl}>
            <Items text={t("terms.s2Items")} />
          </Section>

          <Section number="3" title={t("terms.s3Title")} isRtl={isRtl}>
            <p>{t("terms.s3Intro")}</p>
            <Items text={t("terms.s3Items")} />
          </Section>

          <Section number="4" title={t("terms.s4Title")} isRtl={isRtl}>
            <Items text={t("terms.s4Items")} />
          </Section>

          <Section number="5" title={t("terms.s5Title")} isRtl={isRtl}>
            <Items text={t("terms.s5Items")} />
          </Section>

          <Section number="6" title={t("terms.s6Title")} isRtl={isRtl}>
            <p>{t("terms.s6Intro")}</p>
            <Items text={t("terms.s6Items")} />
          </Section>

          <Section number="7" title={t("terms.s7Title")} isRtl={isRtl}>
            <Items text={t("terms.s7Items")} />
          </Section>

          <Section number="8" title={t("terms.s8Title")} isRtl={isRtl}>
            <Items text={t("terms.s8Items")} />
          </Section>

          <Section number="9" title={t("terms.s9Title")} isRtl={isRtl}>
            <p>{t("terms.s9Content")}</p>
          </Section>

          <Section number="10" title={t("terms.s10Title")} isRtl={isRtl}>
            <p>{t("terms.s10Intro")}</p>
            <ul className="list-none mt-2 space-y-1">
              <li><span className="font-semibold">{t("terms.s10Phone")}</span> <span dir="ltr">0654970662</span></li>
              <li><span className="font-semibold">{t("terms.s10Email")}</span> <span dir="ltr">contact@weasyexpress.com</span></li>
            </ul>
          </Section>

        </div>
      </div>
    </div>
  );
}

function Section({
  number,
  title,
  children,
  isRtl,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
  isRtl: boolean;
}) {
  return (
    <div className={`border-${isRtl ? "r" : "l"}-4 border-[#E10600] ${isRtl ? "pr-6" : "pl-6"}`}>
      <h2 className="text-2xl font-bold mb-3 text-foreground">
        <span className={`text-[#E10600] ${isRtl ? "ml-2" : "mr-2"}`}>{number}.</span>
        {title}
      </h2>
      <div className="text-muted-foreground leading-relaxed space-y-2">
        {children}
      </div>
    </div>
  );
}
