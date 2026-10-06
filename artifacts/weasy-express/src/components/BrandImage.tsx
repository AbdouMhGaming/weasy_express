import { useEffect, useState } from "react";

export function BrandImage({ src, alt = "Weasy Express", className }: {
  src: string; alt?: string; className?: string;
}) {
  const [attempt, setAttempt] = useState(0);
  useEffect(() => setAttempt(0), [src]);
  if (attempt > 1) return <span role="img" aria-label={alt} className={className} style={{ fontWeight: 800, textAlign: "center" }}>{alt}</span>;
  return <img src={attempt ? `${src}${src.includes("?") ? "&" : "?"}retry=1` : src} alt={alt} className={className} onError={() => setAttempt(value => value + 1)} />;
}
