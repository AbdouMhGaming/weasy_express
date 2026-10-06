import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateEcotrackOrder, useUpdateEcotrackOrder, useEcotrackOrderCommune } from "@/hooks/use-ecotrack";
import { useToast } from "@/hooks/use-toast";
import { normalizeDzMobile } from "./orderUpdates";
import { CommunePicker, DestinationStatus, FeePreview, WilayaPicker, useDestination } from "./orderHelpers";
import "./orderUpdatesI18n";

const selectCls = "flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const labelCls = "text-xs font-semibold text-slate-600";

export function OrderFormModal({ isOpen, onClose, parcel, isEdit }: { isOpen: boolean; onClose: () => void; parcel: any; isEdit: boolean; }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const createMutation = useCreateEcotrackOrder();
  const updateMutation = useUpdateEcotrackOrder();
  const { data: savedCommuneName, isLoading: isLoadingSavedCommune } = useEcotrackOrderCommune(
    isEdit ? parcel?.tracking : undefined, isEdit ? String(parcel?.wilaya_id ?? "") : undefined,
  );

  const [formData, setFormData] = useState<any>(() => parcel ? {
    reference: parcel.reference ?? "", client: parcel.client ?? "", phone: parcel.phone ?? "", phone_2: parcel.phone_2 ?? "",
    adresse: parcel.adresse ?? "", wilaya_id: String(parcel.wilaya_id ?? ""),
    commune_name: parcel.commune_name || parcel.commune || (parcel.commune_id ? "__unchanged__" : ""),
    montant: parcel.montant ?? "", products: parcel.products ?? "", weight: parcel.weight ?? "", remarque: parcel.remarque ?? "",
    type: String(parcel.type_id ?? parcel.type ?? "1"), stop_desk: Boolean(parcel.stop_desk),
    fragile: parcel.fragile == null ? null : Boolean(parcel.fragile),
  } : {
    reference: "", client: "", phone: "", phone_2: "", adresse: "", wilaya_id: "", commune_name: "", montant: "",
    products: "", weight: "", stop_desk: false, fragile: false, remarque: "", type: "1",
  });
  const [errors, setErrors] = useState<{ phone?: boolean; phone2?: boolean; location?: boolean }>({});
  const [notice, setNotice] = useState("");

  const stopDesk = Boolean(formData.stop_desk);
  const dest = useDestination({
    wilayaId: formData.wilaya_id, commune: formData.commune_name, stopDesk, allowUnchanged: isEdit, autoClear: true,
    onClear: kind => {
      setFormData((c: any) => kind === "wilaya" ? { ...c, wilaya_id: "", commune_name: "" } : { ...c, commune_name: "" });
      setNotice(t("orderUpdates.deskCleared"));
    },
  });
  const { communeValid, wilaya: selectedWilaya } = dest;

  useEffect(() => {
    if (isEdit && formData.commune_name === "__unchanged__" && savedCommuneName) {
      setFormData((c: any) => ({ ...c, commune_name: savedCommuneName }));
    }
  }, [isEdit, formData.commune_name, savedCommuneName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const phone = normalizeDzMobile(formData.phone);
    const phone2Raw = String(formData.phone_2 ?? "").trim();
    const phone2 = phone2Raw ? normalizeDzMobile(phone2Raw) : "";
    const next = {
      phone: !phone, phone2: phone2Raw !== "" && !phone2,
      location: !selectedWilaya || !formData.commune_name || !communeValid || !dest.ready
        || (stopDesk && (dest.unchanged || !dest.deskOk)),
    };
    setErrors(next);
    if (next.phone || next.phone2 || next.location) return;

    const communeVal = formData.commune_name === "__unchanged__" ? undefined : dest.matched?.nom;
    const callbacks = {
      onSuccess: () => { toast({ title: t("admin.ecotrackPortal.common.success") }); onClose(); },
      onError: (err: Error) => toast({ title: t("admin.ecotrackPortal.common.error"), description: err.message, variant: "destructive" }),
    };
    if (isEdit && parcel) {
      updateMutation.mutate({
        tracking: parcel.tracking, client: formData.client, tel: phone, tel2: phone2 || "",
        adresse: formData.adresse, commune: communeVal, wilaya: formData.wilaya_id, montant: formData.montant,
        remarque: formData.remarque, product: formData.products, weight: formData.weight, type: Number(formData.type || 1),
        stop_desk: stopDesk ? 1 : 0, fragile: formData.fragile == null ? undefined : formData.fragile ? 1 : 0,
      }, callbacks);
    } else {
      createMutation.mutate({
        nom_client: formData.client, telephone: phone, telephone_2: phone2 || "",
        adresse: formData.adresse, commune: communeVal, code_wilaya: formData.wilaya_id, montant: formData.montant,
        type: Number(formData.type || 1), reference: formData.reference, remarque: formData.remarque,
        produit: formData.products, weight: formData.weight, stop_desk: stopDesk ? 1 : 0, fragile: formData.fragile ? 1 : 0,
      }, callbacks);
    }
  };

  if (!isOpen) return null;
  const set = (patch: Record<string, unknown>) => setFormData((c: any) => ({ ...c, ...patch }));
  const pending = createMutation.isPending || updateMutation.isPending;
  const errText = (k: string) => <p className="text-xs text-red-600">{t(k)}</p>;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92dvh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-4 sm:p-5 border-b border-slate-100">
          <h2 className="text-lg sm:text-xl font-bold">{isEdit ? t("admin.ecotrackPortal.orders.modify") : t("admin.ecotrackPortal.orders.addOne")}</h2>
          <Button type="button" variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
        </div>
        <div className="p-4 sm:p-5 overflow-auto flex-1">
          <form id="order-form" onSubmit={handleSubmit} noValidate className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="min-w-0 space-y-1">
              <label className={labelCls}>{t("admin.ecotrackPortal.forms.client")}</label>
              <Input required value={formData.client} onChange={e => set({ client: e.target.value })} />
            </div>
            <div className="min-w-0 space-y-1">
              <label className={labelCls}>{t("admin.ecotrackPortal.forms.reference")}</label>
              <Input value={formData.reference} onChange={e => set({ reference: e.target.value })} />
            </div>
            <div className="min-w-0 space-y-1">
              <label className={labelCls}>{t("admin.ecotrackPortal.forms.phone")}</label>
              <Input required inputMode="tel" className="min-w-0" value={formData.phone} onChange={e => set({ phone: e.target.value })} />
              {errors.phone && errText("orderUpdates.invalidPhone")}
            </div>
            <div className="min-w-0 space-y-1">
              <label className={labelCls}>{t("admin.ecotrackPortal.forms.phone2")}</label>
              <Input inputMode="tel" className="min-w-0" value={formData.phone_2} onChange={e => set({ phone_2: e.target.value })} />
              {errors.phone2 && errText("orderUpdates.invalidPhone2")}
            </div>
            <div className="min-w-0 space-y-1 sm:col-span-2">
              <label className={labelCls}>{t("admin.ecotrackPortal.forms.address")}</label>
              <Input required value={formData.adresse} onChange={e => set({ adresse: e.target.value })} />
            </div>
            <div className="min-w-0 space-y-1">
              <label className={labelCls}>{t("admin.ecotrackPortal.forms.operationType")}</label>
              <select required className={selectCls} value={formData.type} onChange={e => set({ type: e.target.value })}>
                <option value="1">{t("admin.ecotrackPortal.forms.delivery")}</option>
                <option value="2">{t("admin.ecotrackPortal.forms.exchange")}</option>
                <option value="3">{t("admin.ecotrackPortal.forms.pickup")}</option>
                <option value="4">{t("admin.ecotrackPortal.forms.collection")}</option>
              </select>
            </div>
            <div className="min-w-0 space-y-1">
              <label className={labelCls}>{t("orderUpdates.service")}</label>
              <select className={selectCls} value={stopDesk ? "desk" : "home"} onChange={e => { setNotice(""); set({ stop_desk: e.target.value === "desk" }); }}>
                <option value="home">{t("orderUpdates.serviceHome")}</option>
                <option value="desk">{t("orderUpdates.serviceDesk")}</option>
              </select>
              {stopDesk && <DestinationStatus dest={dest} stopDesk />}
            </div>
            {notice && <p className="sm:col-span-2 text-xs text-amber-700">{notice}</p>}
            <div className="min-w-0 space-y-1">
              <label className={labelCls}>{t("admin.ecotrackPortal.forms.wilaya")}</label>
              <WilayaPicker testId="picker-wilaya" dest={dest} value={String(formData.wilaya_id)} stopDesk={stopDesk}
                onChange={v => { setNotice(""); set({ wilaya_id: v, commune_name: "" }); }} />
            </div>
            <div className="min-w-0 space-y-1">
              <label className={labelCls}>{t("admin.ecotrackPortal.forms.commune")}</label>
              <CommunePicker testId="picker-commune" dest={dest} wilayaId={formData.wilaya_id} value={formData.commune_name}
                unchangedLabel={isLoadingSavedCommune ? t("admin.ecotrackPortal.common.loading") : t("orderUpdates.currentCommune")}
                onChange={v => { setNotice(""); set({ commune_name: v }); }} />
              {!stopDesk && <DestinationStatus dest={dest} stopDesk={false} />}
            </div>
            {errors.location && <p className="sm:col-span-2 text-xs text-red-600">{t("orderUpdates.invalidLocation")}</p>}
            <div className="min-w-0 space-y-1">
              <label className={labelCls}>{t("admin.ecotrackPortal.forms.amount")}</label>
              <Input required type="number" min="0" className="min-w-0" value={formData.montant} onChange={e => set({ montant: e.target.value })} />
            </div>
            <div className="min-w-0 space-y-1">
              <label className={labelCls}>{t("admin.ecotrackPortal.forms.weight")}</label>
              <Input type="number" min="0" step="0.01" className="min-w-0" value={formData.weight} onChange={e => set({ weight: e.target.value })} />
            </div>
            <FeePreview wilayaId={formData.wilaya_id} communeValid={communeValid && Boolean(formData.commune_name)} type={formData.type} stopDesk={stopDesk} weight={formData.weight} />
            <div className="min-w-0 space-y-1 sm:col-span-2">
              <label className={labelCls}>{t("admin.ecotrackPortal.forms.products")}</label>
              <Input value={formData.products} onChange={e => set({ products: e.target.value })} />
            </div>
            <div className="min-w-0 space-y-1 sm:col-span-2">
              <label className={labelCls}>{t("admin.ecotrackPortal.forms.remark")}</label>
              <Input value={formData.remarque} onChange={e => set({ remarque: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={Boolean(formData.fragile)} onChange={e => set({ fragile: e.target.checked })} />
                {t("admin.ecotrackPortal.forms.fragile")}
              </label>
            </div>
          </form>
        </div>
        <div className="p-4 sm:p-5 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
          <Button type="button" variant="ghost" onClick={onClose}>{t("admin.ecotrackPortal.common.cancel")}</Button>
          <Button type="submit" form="order-form" className="bg-[#E10600] text-white" disabled={pending}>
            {pending ? <Loader2 className="w-4 h-4 me-2 animate-spin" /> : null}
            {t("admin.ecotrackPortal.common.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
