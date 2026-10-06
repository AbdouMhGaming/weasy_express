import i18n from "./i18n";

const resources = {
  en: {
    assistance: "Assistance", allParcels: "All parcels", receivedPayments: "Received payments history",
    receivedReturns: "Received returns history", returnsReady: "Returns ready",
    otpSend: "Send confirmation code", otpEnter: "Enter confirmation code", otpTitle: "Confirm payout with a code",
    otpInstructions: "Send a code to the sender's notification center. Enter the code they give you only after handing over the payout.",
    otpSent: "Code sent to the sender's notification center. It expires in 10 minutes.",
    otpConfirm: "Confirm payout", otpCode: "6-digit code", otpCancel: "Cancel", otpResend: "Send a new code",
    otpInvalid: "Incorrect code. Check the code and try again.",
    otpExpired: "This code has expired, was used, or exceeded 5 attempts. Send a new code.",
    otpRateLimited: "Please wait before sending another code (maximum 10 codes per hour).",
    otpError: "The payout could not be updated. Please try again.",
    otpPaid: "Payout confirmed.", otpNotification: "Payout confirmation code",
    otpNotice: "Give this code to the authorized agent only when collecting your payout.",
    otpAmount: "Amount", otpExpires: "Expires", otpExpiredNotice: "Expired. Ask the agent for a new code.",
    loadError: "Could not load the data.", retry: "Try again", close: "Close",
  },
  fr: {
    assistance: "Assistance", allParcels: "Tous les colis", receivedPayments: "Historique paiements reçus",
    receivedReturns: "Historique retours reçus", returnsReady: "Retours prêts",
    otpSend: "Envoyer un code de confirmation", otpEnter: "Saisir le code de confirmation", otpTitle: "Confirmer le paiement par code",
    otpInstructions: "Envoyez un code au centre de notifications de l'expéditeur. Saisissez le code qu'il vous communique uniquement après lui avoir remis le paiement.",
    otpSent: "Code envoyé au centre de notifications de l'expéditeur. Il expire dans 10 minutes.",
    otpConfirm: "Confirmer le paiement", otpCode: "Code à 6 chiffres", otpCancel: "Annuler", otpResend: "Envoyer un nouveau code",
    otpInvalid: "Code incorrect. Vérifiez le code et réessayez.",
    otpExpired: "Ce code a expiré, a été utilisé ou a dépassé 5 tentatives. Envoyez un nouveau code.",
    otpRateLimited: "Veuillez patienter avant de renvoyer un code (10 codes maximum par heure).",
    otpError: "Le paiement n'a pas pu être mis à jour. Veuillez réessayer.",
    otpPaid: "Paiement confirmé.", otpNotification: "Code de confirmation du paiement",
    otpNotice: "Communiquez ce code à l'agent autorisé uniquement lors du retrait de votre paiement.",
    otpAmount: "Montant", otpExpires: "Expire le", otpExpiredNotice: "Expiré. Demandez un nouveau code à l'agent.",
    loadError: "Impossible de charger les données.", retry: "Réessayer", close: "Fermer",
  },
  ar: {
    assistance: "المساعدة", allParcels: "جميع الطرود", receivedPayments: "سجل المدفوعات المستلمة",
    receivedReturns: "سجل المرتجعات المستلمة", returnsReady: "مرتجعات جاهزة",
    otpSend: "إرسال رمز التأكيد", otpEnter: "إدخال رمز التأكيد", otpTitle: "تأكيد الدفع بواسطة رمز",
    otpInstructions: "أرسل رمزًا إلى مركز إشعارات المرسل. أدخل الرمز الذي يقدمه لك فقط بعد تسليمه المبلغ.",
    otpSent: "تم إرسال الرمز إلى مركز إشعارات المرسل. تنتهي صلاحيته خلال 10 دقائق.",
    otpConfirm: "تأكيد الدفع", otpCode: "رمز من 6 أرقام", otpCancel: "إلغاء", otpResend: "إرسال رمز جديد",
    otpInvalid: "الرمز غير صحيح. تحقق من الرمز وحاول مجددًا.",
    otpExpired: "انتهت صلاحية الرمز أو تم استخدامه أو تجاوز 5 محاولات. أرسل رمزًا جديدًا.",
    otpRateLimited: "يرجى الانتظار قبل إرسال رمز آخر (10 رموز كحد أقصى في الساعة).",
    otpError: "تعذر تحديث الدفع. يرجى المحاولة مجددًا.",
    otpPaid: "تم تأكيد الدفع.", otpNotification: "رمز تأكيد الدفع",
    otpNotice: "شارك هذا الرمز مع الموظف المخول فقط عند استلام دفعتك.",
    otpAmount: "المبلغ", otpExpires: "تنتهي الصلاحية", otpExpiredNotice: "منتهي الصلاحية. اطلب رمزًا جديدًا من الموظف.",
    loadError: "تعذر تحميل البيانات.", retry: "إعادة المحاولة", close: "إغلاق",
  },
};
for (const [language, portalUpdates] of Object.entries(resources)) {
  i18n.addResourceBundle(language, "translation", { portalUpdates }, true, true);
  i18n.addResource(language, "translation", "admin.sidebar.queue", portalUpdates.assistance);
  i18n.addResource(language, "translation", "admin.queue.title", portalUpdates.assistance);
  i18n.addResource(language, "translation", "admin.team.sections.queue", portalUpdates.assistance);
}
