import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { API_BASE, expediteurHeaders, readApiJson } from "@/lib/api";

const BASE = `${API_BASE}/api/expediteur/ecotrack`;

// Dashboard
export function useEcotrackReports(filters: { from?: string; to?: string; wilaya?: string }) {
  return useQuery({
    queryKey: ["ecotrack", "reports", filters],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (filters.from) searchParams.set("from", filters.from);
      if (filters.to) searchParams.set("to", filters.to);
      if (filters.wilaya) searchParams.set("wilaya", filters.wilaya);
      const suffix = searchParams.size ? `?${searchParams.toString()}` : "";
      const res = await fetch(`${BASE}/reports${suffix}`, { headers: expediteurHeaders() });
      if (res.status === 401 || res.status === 403 || res.status === 409) throw new Error("disconnected");
      const body = await readApiJson(res);
      if (!res.ok || !body.ok) throw new Error(body.error || "load_failed");
      return body;
    },
    refetchInterval: 30_000,
  });
}

export function useEcotrackDashboard(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["ecotrack", "dashboard"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/dashboard`, { headers: expediteurHeaders() });
      if (res.status === 401 || res.status === 403 || res.status === 409) throw new Error("disconnected");
      const body = await readApiJson(res);
      if (!res.ok || !body.ok) throw new Error(body.error || "load_failed");
      return body;
    },
    refetchInterval: (query) => query.state.data?.sync?.complete ? 30_000 : 2_000,
    enabled: options?.enabled,
  });
}

export type EcotrackAnalyticsFilters = {
  from?: string;
  to?: string;
  wilaya?: string;
  status?: string;
};

export function useEcotrackAnalytics(filters: EcotrackAnalyticsFilters) {
  return useQuery({
    queryKey: ["ecotrack", "analytics", filters],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (filters.from) searchParams.set("from", filters.from);
      if (filters.to) searchParams.set("to", filters.to);
      if (filters.wilaya) searchParams.set("wilaya", filters.wilaya);
      if (filters.status) searchParams.set("status", filters.status);
      const suffix = searchParams.size ? `?${searchParams.toString()}` : "";
      const res = await fetch(`${BASE}/analytics${suffix}`, { headers: expediteurHeaders() });
      if (res.status === 401 || res.status === 403 || res.status === 409) throw new Error("disconnected");
      const body = await readApiJson(res);
      if (!res.ok || !body.ok) throw new Error(body.error || "load_failed");
      return body;
    },
    refetchInterval: 30_000,
  });
}

// Sync
export function useEcotrackSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/sync`, { method: "POST", headers: expediteurHeaders() });
      if (res.status === 401 || res.status === 403 || res.status === 409) throw new Error("disconnected");
      const body = await readApiJson(res);
      if (!res.ok || !body.ok) throw new Error(body.error || "actionFailed");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ecotrack"] });
    },
  });
}

// Orders
export type EcotrackOrderSort = "created_desc" | "created_asc" | "updated_desc" | "updated_asc" | "amount_desc" | "amount_asc";

export type EcotrackOrderFilters = {
  from?: string;
  to?: string;
  wilaya?: string;
  commune?: string;
  type?: string;
  fragile?: string;
  stopDesk?: string;
};

export function useEcotrackOrders(
  params: { page: number; search: string; status: string; sort?: EcotrackOrderSort } & EcotrackOrderFilters,
  options?: { enabled?: boolean; refetchInterval?: number | false },
) {
  return useQuery({
    queryKey: ["ecotrack", "orders", params],
    queryFn: async () => {
      const searchParams = new URLSearchParams({ page: params.page.toString() });
      if (params.search) searchParams.set("search", params.search);
      if (params.status && params.status !== "all") searchParams.set("status", params.status);
      if (params.sort) searchParams.set("sort", params.sort);
      if (params.from) searchParams.set("from", params.from);
      if (params.to) searchParams.set("to", params.to);
      if (params.wilaya) searchParams.set("wilaya", params.wilaya);
      if (params.commune) searchParams.set("commune", params.commune);
      if (params.type) searchParams.set("type", params.type);
      if (params.fragile) searchParams.set("fragile", params.fragile);
      if (params.stopDesk) searchParams.set("stop_desk", params.stopDesk);

      const res = await fetch(`${BASE}/orders?${searchParams.toString()}`, { headers: expediteurHeaders() });
      if (res.status === 401 || res.status === 403 || res.status === 409) throw new Error("disconnected");
      const body = await readApiJson(res);
      if (!res.ok || !body.ok) throw new Error(body.error || "load_failed");
      return body;
    },
    refetchInterval: options?.refetchInterval ?? 5_000,
    enabled: options?.enabled ?? true,
  });
}

// Order details
export function useEcotrackOrderDetail(tracking: string) {
  return useQuery({
    queryKey: ["ecotrack", "order", tracking],
    queryFn: async () => {
      const res = await fetch(`${BASE}/orders/${tracking}`, { headers: expediteurHeaders() });
      if (res.status === 401 || res.status === 403 || res.status === 409) throw new Error("disconnected");
      const body = await readApiJson(res);
      if (!res.ok || !body.ok) throw new Error(body.error || "load_failed");
      const infoEnvelope = body.info?.data ?? body.info ?? {};
      const info = infoEnvelope[tracking] ?? infoEnvelope;
      const updatesEnvelope = body.updates?.data ?? body.updates ?? {};
      const updates = updatesEnvelope[tracking] ?? updatesEnvelope;
      const activity = [
        ...(Array.isArray(info?.activity) ? info.activity : []),
        ...(Array.isArray(updates?.activity) ? updates.activity : []),
      ];
      const updateRows = Array.isArray(updates)
        ? updates
        : Array.isArray(updates?.updates)
          ? updates.updates
          : Array.isArray(updates?.data)
            ? updates.data
            : [];
      const dateParts = (event: any) => {
        const createdAt = String(event?.created_at ?? event?.createdAt ?? "").trim();
        const [createdDate = "", createdTime = ""] = createdAt.split(/\s+/, 2);
        return {
          date: String(event?.date ?? createdDate).trim(),
          time: String(event?.time ?? createdTime).trim(),
        };
      };
      const timestampKey = (event: any) => {
        const { date, time } = dateParts(event);
        return `${date} ${time}`.trim();
      };
      const updatesByTimestamp = new Map<string, any[]>();
      updateRows.forEach((row: any) => {
        const key = timestampKey(row);
        const rows = updatesByTimestamp.get(key) ?? [];
        rows.push(row);
        updatesByTimestamp.set(key, rows);
      });
      const knownKeys = new Set([
        "status", "activity", "reason", "date", "time", "created_at", "createdAt",
        "station", "scanLocation", "details", "postponed_to", "livreur", "driver",
        "commentaires", "comments", "remarque", "remark", "tracking",
      ]);
      const normalizeEvent = (event: any, update: any = {}) => {
        const { date, time } = dateParts(event?.date || event?.created_at ? event : update);
        const metadata = Object.entries({ ...event, ...update })
          .filter(([key, value]) => !knownKeys.has(key) && value !== null && value !== undefined && value !== "")
          .map(([key, value]) => ({ key, value: typeof value === "object" ? JSON.stringify(value) : String(value) }));
        return {
          status: event?.status ?? event?.activity ?? event?.reason ?? update?.status ?? update?.activity ?? update?.reason ?? "",
          date,
          time,
          station: update?.station ?? event?.station ?? event?.scanLocation ?? "",
          scanLocation: update?.scanLocation ?? event?.scanLocation ?? "",
          reason: update?.reason ?? event?.reason ?? "",
          details: update?.details ?? event?.details ?? "",
          postponedTo: update?.postponed_to ?? event?.postponed_to ?? null,
          driver: update?.livreur ?? update?.driver ?? event?.livreur ?? event?.driver ?? "",
          comments: update?.commentaires ?? update?.comments ?? event?.commentaires ?? event?.comments ?? "",
          remark: update?.remarque ?? update?.remark ?? event?.remarque ?? event?.remark ?? "",
          metadata,
        };
      };
      const events = activity.map((event: any) => {
        const key = timestampKey(event);
        const matchingUpdates = updatesByTimestamp.get(key) ?? [];
        const update = matchingUpdates.shift() ?? {};
        if (matchingUpdates.length) updatesByTimestamp.set(key, matchingUpdates);
        else updatesByTimestamp.delete(key);
        return normalizeEvent(event, update);
      });
      for (const remainingRows of updatesByTimestamp.values()) {
        remainingRows.forEach((row: any) => events.push(normalizeEvent(row)));
      }
      events.sort((a: any, b: any) =>
        `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`),
      );
      return {
        ...body,
        info,
        updates,
        events,
      };
    },
    enabled: !!tracking,
    refetchInterval: 30_000,
  });
}

export function useEcotrackDelays(filters: { status?: string; wilaya?: string; search?: string }) {
  return useQuery({
    queryKey: ["ecotrack", "delays", filters],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (filters.status) searchParams.set("status", filters.status);
      if (filters.wilaya) searchParams.set("wilaya", filters.wilaya);
      if (filters.search) searchParams.set("search", filters.search);
      const suffix = searchParams.size ? `?${searchParams.toString()}` : "";
      const res = await fetch(`${BASE}/delays${suffix}`, { headers: expediteurHeaders() });
      if (res.status === 401 || res.status === 403 || res.status === 409) throw new Error("disconnected");
      const body = await readApiJson(res);
      if (!res.ok || !body.ok) throw new Error(body.error || "load_failed");
      return body;
    },
    refetchInterval: 30_000,
  });
}

export function useEcotrackDelayThresholds() {
  return useQuery({
    queryKey: ["ecotrack", "delay-thresholds"],
    queryFn: async () => {
      const token = localStorage.getItem("admin_token") || "";
      const res = await fetch(`${API_BASE}/api/admin/ecotrack/delay-thresholds`, { 
        headers: { "Authorization": `Bearer ${token}` } 
      });
      const body = await readApiJson(res);
      if (!res.ok || !body.ok) throw new Error(body.error || "load_failed");
      return body;
    },
  });
}

export function useUpdateEcotrackDelayThresholds() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rows: any[]) => {
      const token = localStorage.getItem("admin_token") || "";
      const res = await fetch(`${API_BASE}/api/admin/ecotrack/delay-thresholds`, {
        method: "PUT",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const body = await readApiJson(res);
      if (!res.ok || !body.ok) throw new Error(body.error || "actionFailed");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ecotrack", "delay-thresholds"] });
    },
  });
}

// References
export function useEcotrackWilayas() {
  return useQuery({
    queryKey: ["ecotrack", "wilayas"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/wilayas`, { headers: expediteurHeaders() });
      if (res.status === 401 || res.status === 403 || res.status === 409) throw new Error("disconnected");
      const body = await readApiJson(res);
      const raw = Array.isArray(body.data) ? body.data : body.data?.data;
      return (Array.isArray(raw) ? raw : []).map((wilaya: any) => ({
        ...wilaya,
        wilaya_id: wilaya.wilaya_id ?? wilaya.code ?? wilaya.id,
        wilaya_name: wilaya.wilaya_name ?? wilaya.nom ?? wilaya.name,
      }));
    }
  });
}

export function useEcotrackCommunes(wilaya_id?: string) {
  return useQuery({
    queryKey: ["ecotrack", "communes", wilaya_id],
    queryFn: async () => {
      if (!wilaya_id) return [];
      const res = await fetch(`${BASE}/communes?wilaya_id=${wilaya_id}`, { headers: expediteurHeaders() });
      if (res.status === 401 || res.status === 403 || res.status === 409) throw new Error("disconnected");
      const body = await readApiJson(res);
      // Ecotrack returns communes as an object keyed by string
      const raw = body.data?.data ?? body.data ?? {};
      return Object.values(raw).map((commune: any) => ({
        ...commune,
        nom: commune.nom ?? commune.commune_name ?? commune.name,
      }));
    },
    enabled: !!wilaya_id,
  });
}

export function useEcotrackOrderCommune(tracking?: string, wilayaId?: string) {
  return useQuery({
    queryKey: ["ecotrack", "order-commune", tracking, wilayaId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/orders/${encodeURIComponent(tracking!)}/commune?wilaya_id=${encodeURIComponent(wilayaId!)}`, { headers: expediteurHeaders() });
      if (res.status === 401 || res.status === 403 || res.status === 409) throw new Error("disconnected");
      const body = await readApiJson(res);
      if (!res.ok || !body.ok) throw new Error(body.error || "commune_lookup_failed");
      return String(body.commune);
    },
    enabled: Boolean(tracking && wilayaId),
    staleTime: 5 * 60_000,
  });
}

export function useEcotrackDesks() {
  return useQuery({
    queryKey: ["ecotrack", "desks"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/desks`, { headers: expediteurHeaders() });
      if (res.status === 401 || res.status === 403 || res.status === 409) throw new Error("disconnected");
      const body = await readApiJson(res);
      return body.data?.data ?? body.data ?? { my_desk: null, other_desks: [] };
    }
  });
}

export function useEcotrackFees() {
  return useQuery({
    queryKey: ["ecotrack", "fees"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/fees`, { headers: expediteurHeaders() });
      if (res.status === 401 || res.status === 403 || res.status === 409) throw new Error("disconnected");
      const body = await readApiJson(res);
      return body.data?.data ?? body.data ?? {};
    }
  });
}

export function useEcotrackProducts(page = 1) {
  return useQuery({
    queryKey: ["ecotrack", "products", page],
    queryFn: async () => {
      const res = await fetch(`${BASE}/products?page=${page}`, { headers: expediteurHeaders() });
      if (res.status === 401 || res.status === 403 || res.status === 409) throw new Error("disconnected");
      const body = await readApiJson(res);
      const raw = body.data?.data ?? body.data;
      return raw && typeof raw === "object" ? raw : { products: [], pagination: {} };
    }
  });
}

// Mutations
export function useCreateEcotrackOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`${BASE}/create/order`, {
        method: "POST",
        headers: expediteurHeaders(),
        body: JSON.stringify(data),
      });
      if (res.status === 401 || res.status === 403 || res.status === 409) throw new Error("disconnected");
      const body = await readApiJson(res);
      if (!res.ok || !body.ok) throw new Error(body.error || "actionFailed");
      return body;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ecotrack", "orders"] }),
        queryClient.invalidateQueries({ queryKey: ["ecotrack", "dashboard"] }),
      ]);
    },
  });
}

export function useBulkCreateEcotrackOrders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (orders: any[]) => {
      const res = await fetch(`${BASE}/create/orders`, {
        method: "POST",
        headers: expediteurHeaders(),
        body: JSON.stringify({ orders }),
      });
      if (res.status === 401 || res.status === 403 || res.status === 409) throw new Error("disconnected");
      const body = await readApiJson(res);
      // Ecotrack can accept some rows and reject others in one HTTP 200 response.
      // Return that response to the modal so it can remove successes and retain failures.
      if (!res.ok) throw new Error(body.error || "actionFailed");
      return body;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ecotrack", "orders"] }),
        queryClient.invalidateQueries({ queryKey: ["ecotrack", "dashboard"] }),
      ]);
    },
  });
}

export function useUpdateEcotrackOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`${BASE}/update/order`, {
        method: "PUT",
        headers: expediteurHeaders(),
        body: JSON.stringify(data),
      });
      if (res.status === 401 || res.status === 403 || res.status === 409) throw new Error("disconnected");
      const body = await readApiJson(res);
      if (!res.ok || !body.ok) throw new Error(body.error || "actionFailed");
      return body;
    },
    onSuccess: async (_, vars) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ecotrack", "orders"] }),
        queryClient.invalidateQueries({ queryKey: ["ecotrack", "dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["ecotrack", "order", vars.tracking] }),
      ]);
    },
  });
}

export function useDeleteEcotrackOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tracking: string) => {
      const res = await fetch(`${BASE}/order?tracking=${tracking}`, {
        method: "DELETE",
        headers: expediteurHeaders(),
      });
      if (res.status === 401 || res.status === 403 || res.status === 409) throw new Error("disconnected");
      const body = await readApiJson(res);
      if (!res.ok || !body.ok) throw new Error(body.error || "actionFailed");
      return body;
    },
    onSuccess: async (_, tracking) => {
      queryClient.removeQueries({ queryKey: ["ecotrack", "order", tracking] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ecotrack", "orders"] }),
        queryClient.invalidateQueries({ queryKey: ["ecotrack", "dashboard"] }),
      ]);
    },
  });
}

export function useValidateEcotrackOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ tracking, ask_collection }: { tracking: string; ask_collection: boolean }) => {
      const res = await fetch(`${BASE}/validate`, {
        method: "POST",
        headers: expediteurHeaders(),
        body: JSON.stringify({ tracking, ask_collection }),
      });
      if (res.status === 401 || res.status === 403 || res.status === 409) throw new Error("disconnected");
      const body = await readApiJson(res);
      if (!res.ok || !body.ok) throw new Error(body.error || "actionFailed");
      return body;
    },
    onSuccess: async (_, vars) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ecotrack", "orders"] }),
        queryClient.invalidateQueries({ queryKey: ["ecotrack", "dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["ecotrack", "order", vars.tracking] }),
      ]);
    },
  });
}

export function useAddEcotrackNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ tracking, content }: { tracking: string; content: string }) => {
      const res = await fetch(`${BASE}/note`, {
        method: "POST",
        headers: expediteurHeaders(),
        body: JSON.stringify({ tracking, content }),
      });
      if (res.status === 401 || res.status === 403 || res.status === 409) throw new Error("disconnected");
      const body = await readApiJson(res);
      if (!res.ok || !body.ok) throw new Error(body.error || "actionFailed");
      return body;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["ecotrack", "order", vars.tracking] });
    },
  });
}

export function useRequestReturnEcotrackOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tracking: string) => {
      const res = await fetch(`${BASE}/return-request`, {
        method: "POST",
        headers: expediteurHeaders(),
        body: JSON.stringify({ tracking }),
      });
      if (res.status === 401 || res.status === 403 || res.status === 409) throw new Error("disconnected");
      const body = await readApiJson(res);
      if (!res.ok || !body.ok) throw new Error(body.error || "actionFailed");
      return body;
    },
    onSuccess: async (_, tracking) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ecotrack", "orders"] }),
        queryClient.invalidateQueries({ queryKey: ["ecotrack", "dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["ecotrack", "order", tracking] }),
      ]);
    },
  });
}

export function useLabelEcotrackOrder() {
  return useMutation({
    mutationFn: async (tracking: string) => {
      const res = await fetch(`${BASE}/orders/${tracking}/label`, {
        headers: expediteurHeaders(),
      });
      if (res.status === 401 || res.status === 403 || res.status === 409) throw new Error("disconnected");
      if (!res.ok) {
        let msg = "actionFailed";
        try { const body = await readApiJson(res); msg = body.error || msg; } catch {}
        throw new Error(msg);
      }
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    },
  });
}
