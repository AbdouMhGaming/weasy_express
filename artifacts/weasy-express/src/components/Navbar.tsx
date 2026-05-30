import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, PackageOpen } from "lucide-react";
import { LanguageSwitcher } from "./LanguageSwitcher";
import logoPath from "@assets/logo-removebg-preview_1777142961208.png";
import logoWhitePath from "@assets/weasy_logo_white_no_bg.png";

export function Navbar() {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const routes = [
    { href: "/", label: t("nav.home") },
    { href: "/tracking", label: t("nav.tracking") },
    { href: "/locations", label: t("nav.locations") },
    { href: "/contact", label: t("nav.contact") },
    { href: "/partner", label: t("nav.partner") },
  ];

  const headerCls = scrolled
    ? "bg-white/95 backdrop-blur-md border-b border-border shadow-sm"
    : "bg-transparent border-b border-transparent";

  const linkBase = "text-sm font-medium transition-colors cursor-pointer";
  const linkActive = scrolled ? "text-primary" : "text-white";
  const linkInactive = scrolled
    ? "text-muted-foreground hover:text-primary"
    : "text-white/80 hover:text-white";

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 w-full transition-colors duration-300 ${headerCls}`}
    >
      <div className="container mx-auto flex h-20 md:h-24 items-center justify-between px-4">
        <Link href="/">
          <div className="relative flex items-center gap-2 cursor-pointer hover:opacity-90 transition-opacity h-16 md:h-20">
            <img
              src={logoWhitePath}
              alt="Weasy Express"
              className={`h-16 md:h-20 w-auto object-contain transition-opacity duration-300 ${
                scrolled ? "opacity-0" : "opacity-100"
              }`}
            />
            <img
              src={logoPath}
              alt=""
              aria-hidden="true"
              className={`absolute left-0 top-0 h-16 md:h-20 w-auto object-contain transition-opacity duration-300 ${
                scrolled ? "opacity-100" : "opacity-0"
              }`}
            />
          </div>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8">
          {routes.map((route) => (
            <Link key={route.href} href={route.href}>
              <div
                className={`${linkBase} ${
                  location === route.href ? linkActive : linkInactive
                }`}
              >
                {route.label}
              </div>
            </Link>
          ))}
          <Link href="/tracking">
            <Button
              className={`font-bold cursor-pointer ${
                scrolled
                  ? "bg-[#E10600] hover:bg-[#B80500] text-white"
                  : "bg-white text-[#E10600] hover:bg-white/90"
              }`}
            >
              <PackageOpen className="mr-2 h-4 w-4" />
              {t("nav.trackPackage")}
            </Button>
          </Link>
          <LanguageSwitcher />
        </nav>

        {/* Mobile Nav */}
        <div className="md:hidden flex items-center gap-1">
          <LanguageSwitcher />
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={
                  scrolled
                    ? "text-foreground hover:bg-black/5"
                    : "text-white hover:bg-white/10"
                }
              >
                <Menu className="h-6 w-6" />
                <span className="sr-only">{t("nav.menu")}</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] sm:w-[400px]">
              <nav className="flex flex-col gap-6 mt-10">
                {routes.map((route) => (
                  <Link key={route.href} href={route.href}>
                    <div
                      className={`text-lg font-medium cursor-pointer ${
                        location === route.href ? "text-primary" : "text-foreground"
                      }`}
                      onClick={() => setIsOpen(false)}
                    >
                      {route.label}
                    </div>
                  </Link>
                ))}
                <div className="mt-4">
                  <Link href="/tracking">
                    <Button
                      className="w-full font-bold cursor-pointer bg-[#E10600] hover:bg-[#B80500] text-white"
                      onClick={() => setIsOpen(false)}
                    >
                      <PackageOpen className="mr-2 h-4 w-4" />
                      {t("nav.trackPackage")}
                    </Button>
                  </Link>
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
