import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Facebook, Instagram, Mail, MapPin, Phone } from "lucide-react";
import { Logo } from "./Logo";

export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="bg-foreground text-white border-t border-white/10">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
          
          <div className="flex flex-col gap-4">
            <Logo className="h-12 w-auto bg-white p-1 rounded-md self-start" />
            <p className="text-white/70 text-sm leading-relaxed max-w-sm">
              {t("footer.tagline")}
            </p>
            <div className="flex gap-4 mt-2">
              <a
                href="https://www.facebook.com/profile.php?id=61568263179688"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook"
                className="text-white/70 hover:text-white transition-colors"
              >
                <Facebook className="h-5 w-5" />
              </a>
              <a
                href="https://www.instagram.com/weasy.express/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="text-white/70 hover:text-white transition-colors"
              >
                <Instagram className="h-5 w-5" />
              </a>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold">{t("footer.quickLinks")}</h3>
            <nav className="flex flex-col gap-3 text-sm text-white/70">
              <Link href="/" className="hover:text-white transition-colors w-fit">{t("footer.home")}</Link>
              <Link href="/tracking" className="hover:text-white transition-colors w-fit">{t("footer.track")}</Link>
              <Link href="/locations" className="hover:text-white transition-colors w-fit">{t("footer.offices")}</Link>
              <Link href="/partner" className="hover:text-white transition-colors w-fit">{t("footer.becomePartner")}</Link>
              <Link href="/contact" className="hover:text-white transition-colors w-fit">{t("footer.contact")}</Link>
            </nav>
          </div>

          <div className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold">{t("footer.contact")}</h3>
            <ul className="flex flex-col gap-3 text-sm text-white/70">
              <li className="flex items-start gap-3">
                <MapPin className="h-5 w-5 shrink-0 text-[#E10600]" />
                <a
                  href="https://maps.app.goo.gl/MNmrymzbUCKvP6NU8"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                >
                  {t("footer.address1")}<br />{t("footer.address2")}
                </a>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="h-5 w-5 shrink-0 text-[#E10600]" />
                <a href="tel:0654970662" className="hover:text-white transition-colors" dir="ltr">0654 97 06 62</a>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="h-5 w-5 shrink-0 text-[#E10600]" />
                <a href="mailto:support@weasyexpress.com" className="hover:text-white transition-colors" dir="ltr">support@weasyexpress.com</a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-white/10 text-center text-sm text-white/50 flex flex-col md:flex-row justify-between items-center gap-4">
          <p>© {new Date().getFullYear()} Weasy Express. {t("footer.rights")}</p>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-white transition-colors">{t("footer.privacy")}</Link>
            <Link href="/terms" className="hover:text-white transition-colors">{t("footer.terms")}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
