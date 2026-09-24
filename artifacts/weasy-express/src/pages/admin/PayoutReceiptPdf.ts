import QRCode from "qrcode";
import type { PayoutRequest } from "./PayoutsRequestView";

const RED = "#df101c";
const DARK = "#1c2635";
const MUTED = "#64748b";
const PALE = "#fff0f1";
const BORDER = "#dce3eb";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load receipt image: ${src}`));
    img.src = src;
  });
}

// Canvas gives the PDF correctly shaped Arabic without relying on jsPDF's
// Latin-only built-in fonts. Render at print resolution, then place on A4.
export async function renderPayoutReceipt(p: PayoutRequest): Promise<HTMLCanvasElement> {
  if (p.status !== "accepted" && p.status !== "paid") throw new Error("Receipt is not available yet");
  const JsBarcode = (await import("jsbarcode")).default;
  const logo = await loadImage("/logo.png");
  const S = 8;
  const canvas = document.createElement("canvas");
  canvas.width = 210 * S;
  canvas.height = 297 * S;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");
  ctx.scale(S, S);

  const box = (x: number, y: number, w: number, h: number, fill: string | CanvasGradient, radius = 2, stroke?: string) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 0.3; ctx.stroke(); }
  };
  const line = (x: number, y: number, x2: number, y2: number, color = BORDER, width = 0.25) => {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  };
  const text = (value: string, x: number, y: number, size = 3, color = DARK, weight = 500,
    align: CanvasTextAlign = "left", maxWidth?: number, rtl = false) => {
    ctx.save();
    ctx.font = `${weight} ${size}px Arial, "Noto Sans Arabic", sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.direction = rtl ? "rtl" : "ltr";
    const str = String(value || "—");
    if (maxWidth && ctx.measureText(str).width > maxWidth) {
      let clipped = str;
      while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) clipped = clipped.slice(0, -1);
      ctx.fillText(`${clipped}…`, x, y);
    } else ctx.fillText(str, x, y);
    ctx.restore();
  };
  const arabic = (value: string, x: number, y: number, size = 3, color = DARK, weight = 600) =>
    text(value, x, y, size, color, weight, "right", undefined, true);
  const title = (fr: string, ar: string, x: number, y: number, w: number) => {
    box(x, y, w, 13, RED, 2);
    text(fr, x + 4, y + 8.4, 4.3, "#ffffff", 700);
    arabic(ar, x + w - 4, y + 5.5, 3.4, "#ffffff", 700);
  };

  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 210, 297);
  // Cropped transparent wordmark from the same logo used in the portal.
  ctx.drawImage(logo, 50, 150, 450, 180, 13, 6, 57, 23);
  line(77, 9, 77, 29, BORDER, 0.4);
  arabic("أسرع .. أبعد .. دائما معك", 192, 15, 4.2, DARK, 700);
  text("Plus rapide · Plus loin · Toujours avec vous", 84, 24, 3.1, MUTED);
  ctx.fillStyle = RED; ctx.fillRect(0, 0, 2, 34);

  const heading = ctx.createLinearGradient(10, 36, 200, 62);
  heading.addColorStop(0, "#a90812"); heading.addColorStop(1, RED);
  box(10, 36, 190, 27, heading);
  text("DÉCHARGE DE PAIEMENT", 17, 55, 7.2, "#ffffff", 800);
  arabic("وصل استلام ودفع", 192, 44, 6, "#ffffff", 800);
  text("DOCUMENT OFFICIEL  ·  WEASY EXPRESS", 192, 55, 2.7, "#ffe5e7", 600, "right");

  const receiptNumber = p.receipt_number || `PV${String(p.id).padStart(8, "0")}`;
  box(10, 67, 190, 45, "#ffffff", 2, BORDER);
  box(14, 71, 89, 10, RED, 1);
  text(`PV N°  ${receiptNumber}`, 58.5, 76, 5.2, "#ffffff", 800, "center", 84);
  const barcode = document.createElement("canvas");
  JsBarcode(barcode, receiptNumber, { format: "CODE128", displayValue: false, margin: 0, width: 2, height: 50 });
  ctx.drawImage(barcode, 15, 84, 87, 15);
  text(receiptNumber, 58.5, 105, 3.5, DARK, 600, "center");
  line(107, 70, 107, 109);

  if (p.confirmation_token) {
    const url = `${window.location.origin}/expediteurs/payout-confirm/${p.id}?token=${encodeURIComponent(p.confirmation_token)}`;
    // No external QR service ever receives the one-time confirmation token.
    const qr = await loadImage(await QRCode.toDataURL(url, { width: 640, margin: 3, errorCorrectionLevel: "H" }));
    ctx.drawImage(qr, 113, 70, 38, 38);
    // White-backed brand mark; small enough to preserve the QR error correction.
    box(127, 85.1, 10, 7.8, "#ffffff", 1);
    ctx.drawImage(logo, 50, 150, 450, 180, 127.5, 86.1, 9, 5.8);
  } else {
    box(114, 72, 36, 34, "#f4f6f9", 2);
    text("QR déjà utilisé", 132, 89, 3, MUTED, 600, "center");
  }
  line(155, 70, 155, 109);
  arabic("امسح رمز QR للتأكيد", 195, 78, 3.2, DARK, 700);
  text("Scannez le QR code", 160, 87, 3.2, DARK, 700);
  text("pour confirmer la réception", 160, 93, 2.65, MUTED, 500, "left", 36);
  text("avant signature et cachet.", 160, 99, 2.65, MUTED);

  box(10, 116, 190, 27, "#f9fafc", 2, BORDER);
  line(105, 120, 105, 139);
  text("STATION / HUB", 15, 123, 2.8, RED, 800);
  arabic("المحطة / الوكالة", 98, 123, 3, MUTED);
  text(p.office_hub || "—", 15, 133, 4.2, DARK, 700, "left", 83);
  text("DATE ET HEURE", 110, 123, 2.8, RED, 800);
  arabic("التاريخ والوقت", 195, 123, 3, MUTED);
  text(new Date(p.approved_at || p.updated_at).toLocaleString("fr-DZ"), 110, 133, 4, DARK, 700);

  title("Informations client", "معلومات الزبون", 10, 148, 93);
  title("Détails du paiement", "تفاصيل الدفع", 107, 148, 93);
  box(10, 161, 93, 62, "#ffffff", 2, BORDER);
  box(107, 161, 93, 62, "#ffffff", 2, BORDER);

  const clientRow = (fr: string, ar: string, value: string, y: number) => {
    text(fr, 15, y, 2.7, MUTED, 600);
    arabic(ar, 99, y, 2.7, MUTED);
    text(value || "Non renseigné", 15, y + 5.4, 3.7, DARK, 700, "left", 83);
    if (y < 207) line(15, y + 9.4, 98, y + 9.4);
  };
  clientRow("ID client", "معرف الزبون", String(p.expediteur_id ?? "—"), 164);
  clientRow("Nom & prénom", "الاسم واللقب", p.expediteur_username, 178);
  clientRow("Adresse", "العنوان", p.client_address || "Non renseignée", 192);
  clientRow("Téléphone", "الهاتف", p.expediteur_phone || "Non renseigné", 206);

  box(111, 164, 85, 35, PALE, 2);
  text("MONTANT TOTAL", 115, 170, 3, RED, 800);
  arabic("المبلغ الإجمالي", 192, 170, 3.3, RED, 700);
  const amount = Math.round(Number(p.amount_dzd)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  text(`${amount} DZD`, 153.5, 187, 8.8, "#ae0912", 800, "center", 80);
  box(111, 203, 85, 16, "#f5f7fa", 2);
  text("MODE DE PAIEMENT", 115, 208, 2.7, MUTED, 700);
  arabic("طريقة الدفع", 192, 208, 2.9, MUTED);
  text("En espèces / نقدا", 115, 215, 3.8, DARK, 700);

  box(10, 228, 190, 47, "#ffffff", 2, BORDER);
  box(14, 231, 88, 10, RED, 1);
  text("Signature et cachet de l'agence", 18, 237, 3.5, "#ffffff", 700);
  arabic("التوقيع وختم الوكالة", 98, 234, 2.8, "#ffffff");
  ctx.setLineDash([1, 1]);
  ctx.strokeStyle = "#c5ccd6"; ctx.lineWidth = 0.3;
  ctx.strokeRect(15, 244, 85, 26);
  ctx.setLineDash([]);
  line(105, 233, 105, 270);
  text("WEASY EXPRESS", 152, 237, 3.2, RED, 800, "center");
  arabic("شكرا لثقتكم بـ Weasy Express", 152, 248, 4, DARK, 700);
  arabic("هذا الوصل إثبات رسمي للدفع", 152, 255, 3.1, MUTED);
  line(136, 261, 168, 261, RED, 0.45);
  text("Merci pour votre confiance chez Weasy Express", 152, 267, 2.8, DARK, 600, "center");

  text("www.weasyexpress.com", 14, 283, 2.8, DARK, 600);
  text("+213 (0) 654 970 662", 105, 283, 2.8, DARK, 600, "center");
  text("contact@weasyexpress.com", 196, 283, 2.8, DARK, 600, "right");
  ctx.fillStyle = "#a90812"; ctx.fillRect(0, 288, 210, 9);
  ctx.fillStyle = RED; ctx.beginPath(); ctx.moveTo(0, 288); ctx.lineTo(210, 288); ctx.lineTo(210, 293); ctx.lineTo(0, 297); ctx.fill();
  text("WEASY EXPRESS  ·  TOUJOURS À VOS CÔTÉS", 196, 293, 2.7, "#ffffff", 700, "right");

  return canvas;
}

export async function generatePayoutPDF(p: PayoutRequest) {
  const canvas = await renderPayoutReceipt(p);
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  doc.addImage(canvas.toDataURL("image/jpeg", 0.94), "JPEG", 0, 0, 210, 297);
  doc.save(`Paiement_${p.receipt_number || `PV${String(p.id).padStart(8, "0")}`}.pdf`);
}