import type { EcotrackRemark } from "@/hooks/use-ecotrack";

export type RemarkSource = "station" | "driver" | "sender";

export interface DisplayRemark {
  source: RemarkSource;
  author: string;
  text: string;
  createdAt: string;
}

/** Map Ecotrack's get/maj fields, not its order-activity status fields. */
export function displayEcotrackRemark(item: EcotrackRemark): DisplayRemark | null {
  const branch = String(item.station ?? "").trim();
  const driver = String(item.livreur ?? "").trim();
  const remark = String(item.remarque ?? "").trim();
  const comment = String(item.commentaires ?? "").trim();
  // Ecotrack stores this UI prompt as a remark on some station entries.
  const meaningfulRemark = /^écrire une remarque$/iu.test(remark) ? "" : remark;
  const text = meaningfulRemark && comment && meaningfulRemark !== comment
    ? `${meaningfulRemark} — ${comment}` : comment || meaningfulRemark;
  if (!text) return null;

  if (branch) {
    return {
      source: "station",
      author: "",
      text: driver ? `${driver} : ${text}` : text,
      createdAt: item.created_at,
    };
  }
  if (driver) {
    return { source: "driver", author: driver, text, createdAt: item.created_at };
  }
  // get/maj does not identify the author of historical sender remarks. Never
  // substitute the order owner or shipping account as the author of each note.
  return {
    source: "sender",
    author: String(item.auteur ?? item.author ?? "").trim(),
    text,
    createdAt: item.created_at,
  };
}