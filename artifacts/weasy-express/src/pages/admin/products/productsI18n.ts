import i18n from "@/lib/i18n";

const en = {
  add: "Add product", edit: "Edit product", name: "Name", sku: "SKU", purchasePrice: "Purchase price",
  salePrice: "Sale price", barcode: "Barcode", externalId: "External ID", brand: "Brand",
  minimumStock: "Minimum stock alert", weight: "Weight (kg)", percentage: "Marketer percentage (%)",
  pageUrl: "Page URL", description: "Description", photo: "Photo", stock: "Stock", actions: "Actions",
  cancel: "Cancel", save: "Save", retry: "Retry",
  photoHint: "JPEG, PNG or WebP — maximum 5 MB. Select a photo to preview it before saving.",
  photoTooLarge: "This photo exceeds 5 MB. Choose a smaller image.",
  photoInvalid: "Choose a valid JPEG, PNG or WebP image.",
  photoPreview: "Selected product photo", photoLoading: "Loading photo",
  photoRetry: "Photo could not be loaded. Click to retry.",
  clearSelection: "Clear selected photo", noPhoto: "No photo selected",
  nameRequired: "Enter a product name.", invalidFields: "Check the product fields and try again.",
  saveFailed: "The product could not be saved. Please try again.",
  loadFailed: "Products could not be loaded. Please retry.",
};
const fr: Record<keyof typeof en, string> = {
  add: "Ajouter un produit", edit: "Modifier le produit", name: "Nom", sku: "SKU", purchasePrice: "Prix d'achat",
  salePrice: "Prix de vente", barcode: "Code-barres", externalId: "ID externe", brand: "Marque",
  minimumStock: "Seuil d'alerte de stock", weight: "Poids (kg)", percentage: "Pourcentage du commercial (%)",
  pageUrl: "URL de la page", description: "Description", photo: "Photo", stock: "Stock", actions: "Actions",
  cancel: "Annuler", save: "Enregistrer", retry: "Réessayer",
  photoHint: "JPEG, PNG ou WebP — maximum 5 Mo. Sélectionnez une photo pour l'aperçu avant l'enregistrement.",
  photoTooLarge: "Cette photo dépasse 5 Mo. Choisissez une image plus petite.",
  photoInvalid: "Choisissez une image JPEG, PNG ou WebP valide.",
  photoPreview: "Aperçu de la photo du produit", photoLoading: "Chargement de la photo",
  photoRetry: "La photo n'a pas pu être chargée. Cliquez pour réessayer.",
  clearSelection: "Annuler la sélection de photo", noPhoto: "Aucune photo sélectionnée",
  nameRequired: "Saisissez le nom du produit.", invalidFields: "Vérifiez les champs du produit et réessayez.",
  saveFailed: "Le produit n'a pas pu être enregistré. Veuillez réessayer.",
  loadFailed: "Les produits n'ont pas pu être chargés. Réessayez.",
};
const ar: Record<keyof typeof en, string> = {
  add: "إضافة منتج", edit: "تعديل المنتج", name: "الاسم", sku: "SKU", purchasePrice: "سعر الشراء",
  salePrice: "سعر البيع", barcode: "الرمز الشريطي", externalId: "المعرّف الخارجي", brand: "العلامة التجارية",
  minimumStock: "حد التنبيه للمخزون", weight: "الوزن (كغ)", percentage: "نسبة المسوّق (%)",
  pageUrl: "رابط الصفحة", description: "الوصف", photo: "الصورة", stock: "المخزون", actions: "الإجراءات",
  cancel: "إلغاء", save: "حفظ", retry: "إعادة المحاولة",
  photoHint: "JPEG أو PNG أو WebP — بحد أقصى 5 ميغابايت. اختر صورة لمعاينتها قبل الحفظ.",
  photoTooLarge: "حجم هذه الصورة يتجاوز 5 ميغابايت. اختر صورة أصغر.",
  photoInvalid: "اختر صورة صالحة بصيغة JPEG أو PNG أو WebP.",
  photoPreview: "معاينة صورة المنتج المختارة", photoLoading: "جارٍ تحميل الصورة",
  photoRetry: "تعذّر تحميل الصورة. اضغط لإعادة المحاولة.",
  clearSelection: "إلغاء اختيار الصورة", noPhoto: "لم يتم اختيار صورة",
  nameRequired: "أدخل اسم المنتج.", invalidFields: "تحقّق من حقول المنتج وأعد المحاولة.",
  saveFailed: "تعذّر حفظ المنتج. يرجى إعادة المحاولة.",
  loadFailed: "تعذّر تحميل المنتجات. يرجى إعادة المحاولة.",
};

for (const [lng, values] of Object.entries({ en, fr, ar })) {
  i18n.addResourceBundle(lng, "translation", { admin: { ecotrackPortal: { products: values } } }, true, true);
}
