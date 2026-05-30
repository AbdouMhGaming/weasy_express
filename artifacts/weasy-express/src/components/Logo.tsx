import { Link } from "wouter";
import logoPath from "@assets/logo-removebg-preview_1777142961208.png";

interface LogoProps {
  className?: string;
}

export function Logo({ className }: LogoProps) {
  void className;
  return (
    <Link href="/">
      <div
        className="flex items-center gap-2 cursor-pointer"
        data-testid="link-footer-logo"
      >
        <img
          src={logoPath}
          alt="Weasy Express"
          className="h-16 w-auto object-contain"
        />
      </div>
    </Link>
  );
}
