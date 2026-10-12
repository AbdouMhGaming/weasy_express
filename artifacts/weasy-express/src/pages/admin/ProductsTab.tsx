import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Edit2, ImagePlus, Loader2, Package, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateEcotrackProduct, useEcotrackProducts, useUpdateEcotrackProduct } from "@/hooks/use-ecotrack";
import { ProductPhoto, SelectedProductPhoto, validateProductPhoto } from "./products/ProductPhoto";
import "./products/productsI18n";

const fields = [
  ["name", "name", "text"], ["sku", "sku", "text"], ["purchase_price", "purchasePrice", "number"],
  ["sale_price", "salePrice", "number"], ["barcode", "barcode", "text"], ["external_id", "externalId", "text"],
  ["brand", "brand", "text"], ["alert_min_stock", "minimumStock", "number"], ["weight_kg", "weight", "number"],
  ["marketer_percentage", "percentage", "number"], ["page_url", "pageUrl", "url"],
] as const;

export default function ProductsTab() {
  const { t } = useTranslation();
  const { data, isLoading, error: listError, refetch, dataUpdatedAt } = useEcotrackProducts();
  const create = useCreateEcotrackProduct();
  const update = useUpdateEcotrackProduct();
  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [error, setError] = useState("");
  const [photoError, setPhotoError] = useState("");
  const photoInput = useRef<HTMLInputElement>(null);
  const busy = create.isPending || update.isPending;
  const f = (key: string) => t(`admin.ecotrackPortal.products.${key}`);
  const message = (code: string) => {
    if (code === "photo_too_large") return f("photoTooLarge");
    if (code === "invalid_photo" || code === "invalid_photo_upload") return f("photoInvalid");
    if (code === "name_required") return f("nameRequired");
    if (code.startsWith("invalid_")) return f("invalidFields");
    return f("saveFailed");
  };
  const close = () => {
    if (busy) return;
    setOpen(false); setEditing(null); setForm({}); setError(""); setPhotoError("");
  };
  const begin = (product?: any) => {
    setEditing(product ?? null); setForm(product ? { ...product } : {});
    setError(""); setPhotoError(""); setOpen(true);
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || photoError) return;
    setError("");
    try {
      const keys: string[] = [...fields.map(([key]) => key), "description", "photo"];
      const payload = Object.fromEntries(keys.filter(key => form[key] !== undefined).map(key => [key, form[key]]));
      if (!String(payload.name ?? "").trim()) throw new Error("name_required");
      for (const [key, , type] of fields) {
        if (type === "number" && payload[key] !== "" && payload[key] !== undefined &&
          (!Number.isFinite(Number(payload[key])) || Number(payload[key]) < 0)) throw new Error(`invalid_${key}`);
      }
      if (payload.page_url) {
        try { const url = new URL(payload.page_url); if (!["http:", "https:"].includes(url.protocol)) throw new Error(); }
        catch { throw new Error("invalid_page_url"); }
      }
      if (form.photo instanceof File) {
        const invalid = validateProductPhoto(form.photo);
        if (invalid) throw new Error(invalid);
      }
      if (editing) await update.mutateAsync({ id: editing.id, data: payload });
      else await create.mutateAsync(payload);
      setOpen(false); setEditing(null); setForm({});
    } catch (e) { setError(message(e instanceof Error ? e.message : "product_save_failed")); }
  };

  return <div className="flex h-full flex-col p-4 sm:p-6">
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold text-slate-900">{f("list")}</h2>
      <Button onClick={() => begin()}><Plus className="me-2 h-4 w-4" />{f("add")}</Button>
    </div>
    <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex-1 overflow-auto">
        {isLoading ? <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#E10600]" /></div>
          : listError ? <div role="alert" className="space-y-3 p-8 text-center text-red-600">
            <p>{f("loadFailed")}</p><Button variant="outline" onClick={() => void refetch()}>{f("retry")}</Button>
          </div> : !data?.products?.length ? <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <Package className="mb-3 h-12 w-12 text-slate-200" /><p className="font-medium text-slate-500">{f("empty")}</p>
          </div> : <table className="w-full text-start text-sm">
            <thead className="sticky top-0 bg-slate-50 shadow-[0_1px_0_0_#e2e8f0]"><tr>
              {["name", "reference", "sku", "salePrice", "stock", "actions"].map(key =>
                <th key={key} className="px-4 py-3 text-start font-semibold text-slate-700">{f(key)}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-slate-100">{data.products.map((product: any) =>
              <tr key={product.id} className="hover:bg-slate-50/70">
                <td className="px-4 py-3 font-medium text-slate-900"><div className="flex items-center gap-3">
                  {product.photo_url ? <ProductPhoto src={product.photo_url} alt={product.name} revision={dataUpdatedAt} />
                    : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-50"><Package className="h-5 w-5 text-slate-400" /></span>}
                  <span>{product.name || product.title}</span>
                </div></td>
                <td className="px-4 py-3 font-mono text-slate-700">{product.reference || product.barcode || "—"}</td>
                <td className="px-4 py-3 font-mono text-slate-700">{product.sku || product.reference || "—"}</td>
                <td className="px-4 py-3 text-slate-700">{product.sale_price ?? "—"}</td>
                <td className="px-4 py-3 text-slate-700">{product.stock_disponible ?? 0}</td>
                <td className="px-4 py-3"><Button variant="ghost" size="sm" aria-label={`${f("edit")} ${product.name}`} onClick={() => begin(product)}><Edit2 className="h-4 w-4" /></Button></td>
              </tr>)}</tbody>
          </table>}
      </div>
    </div>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
      <form role="dialog" aria-modal="true" aria-labelledby="product-dialog-title" onSubmit={save}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b p-4 sm:p-6">
          <h3 id="product-dialog-title" className="text-xl font-bold">{editing ? f("edit") : f("add")}</h3>
          <Button type="button" variant="ghost" disabled={busy} aria-label={f("cancel")} onClick={close}><X /></Button>
        </div>
        <div className="overflow-y-auto p-4 sm:p-6">
          {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {fields.map(([key, label, type]) => <label key={key} className="text-sm font-semibold text-slate-600">{f(label)}
              <Input required={key === "name"} type={type} min={type === "number" ? 0 : undefined}
                step={type === "number" ? "any" : undefined} maxLength={key === "name" ? 255 : undefined}
                disabled={busy} value={form[key] ?? ""} onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))} />
            </label>)}
            <div className="space-y-3 md:col-span-2">
              <label className="block text-sm font-semibold text-slate-600">{f("photo")}
                <input ref={photoInput} className="mt-2 block w-full text-sm"
                  type="file" disabled={busy} accept="image/jpeg,image/png,image/webp"
                  onChange={e => {
                    const photo = e.target.files?.[0];
                    if (!photo) return;
                    const invalid = validateProductPhoto(photo);
                    setPhotoError(invalid ? message(invalid) : "");
                    setForm(prev => ({ ...prev, photo: invalid ? undefined : photo }));
                    if (invalid) e.target.value = "";
                  }} />
              </label>
              <p className="text-xs text-slate-500">{f("photoHint")}</p>
              {photoError && <p role="alert" className="text-sm text-red-600">{photoError}</p>}
              {form.photo instanceof File ? <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <SelectedProductPhoto file={form.photo} alt={f("photoPreview")} onInvalid={() => setPhotoError(f("photoInvalid"))} />
                <Button type="button" variant="outline" disabled={busy} onClick={() => {
                  if (photoInput.current) photoInput.current.value = "";
                  setForm(prev => ({ ...prev, photo: undefined })); setPhotoError("");
                }}>{f("clearSelection")}</Button>
              </div> : editing?.photo_url ? <ProductPhoto src={editing.photo_url} alt={editing.name} revision={dataUpdatedAt} preview />
                : <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                  <ImagePlus className="h-5 w-5" />{f("noPhoto")}
                </div>}
            </div>
            <label className="text-sm font-semibold text-slate-600 md:col-span-2">{f("description")}
              <textarea disabled={busy} className="mt-1 min-h-24 w-full rounded-md border border-slate-200 p-2 text-sm"
                value={form.description ?? ""} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))} />
            </label>
          </div>
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t bg-white p-4">
          <Button type="button" variant="outline" disabled={busy} onClick={close}>{f("cancel")}</Button>
          <Button disabled={busy || !!photoError} type="submit">{busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}{f("save")}</Button>
        </div>
      </form>
    </div>}
  </div>;
}
