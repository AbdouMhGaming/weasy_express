import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { API_BASE, expediteurHeaders } from "@/lib/api";

const BASE = `${API_BASE}/api/expediteur/ecotrack`;

// Dashboard
export function useEcotrackDashboard() {
  return useQuery({
    queryKey: ["ecotrack", "dashboard"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/dashboard`, { headers: expediteurHeaders() });
      if (res.status === 401 || res.status === 403 || res.status === 409) throw new Error("disconnected");
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "load_failed");
      return body;
    },
  });
}

// Sync
export function useEcotrackSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/sync`, { method: "POST", headers: expediteurHeaders() });
      if (res.status === 401 || res.status === 403 || res.status === 409) throw new Error("disconnected");
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "actionFailed");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ecotrack"] });
    },
  });
}

// Orders
export function useEcotrackOrders(params: { page: number; search: string; status: string }) {
  return useQuery({
    queryKey: ["ecotrack", "orders", params],
    queryFn: async () => {
      const url = new URL(`${BASE}/orders`);
      url.searchParams.set("page", params.page.toString());
      if (params.search) url.searchParams.set("search", params.search);
      if (params.status && params.status !== "all") url.searchParams.set("status", params.status);

      const res = await fetch(url.toString(), { headers: expediteurHeaders() });
      if (res.status === 401 || res.status === 403 || res.status === 409) throw new Error("disconnected");
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "load_failed");
      return body;
    },
  });
}

// Order details
export function useEcotrackOrderDetail(tracking: string) {
  return useQuery({
    queryKey: ["ecotrack", "order", tracking],
    queryFn: async () => {
      const res = await fetch(`${BASE}/orders/${tracking}`, { headers: expediteurHeaders() });
      if (res.status === 401 || res.status === 403 || res.status === 409) throw new Error("disconnected");
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "load_failed");
      return body;
    },
    enabled: !!tracking,
  });
}

// References
export function useEcotrackWilayas() {
  return useQuery({
    queryKey: ["ecotrack", "wilayas"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/wilayas`, { headers: expediteurHeaders() });
      if (res.status === 401 || res.status === 403 || res.status === 409) throw new Error("disconnected");
      const body = await res.json();
      return body.data || [];
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
      const body = await res.json();
      // Ecotrack returns communes as an object keyed by string
      return Object.values(body.data || {});
    },
    enabled: !!wilaya_id,
  });
}

export function useEcotrackDesks() {
  return useQuery({
    queryKey: ["ecotrack", "desks"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/desks`, { headers: expediteurHeaders() });
      if (res.status === 401 || res.status === 403 || res.status === 409) throw new Error("disconnected");
      const body = await res.json();
      return body.data || { my_desk: [], other_desks: [] };
    }
  });
}

export function useEcotrackFees() {
  return useQuery({
    queryKey: ["ecotrack", "fees"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/fees`, { headers: expediteurHeaders() });
      if (res.status === 401 || res.status === 403 || res.status === 409) throw new Error("disconnected");
      const body = await res.json();
      return body.data || {};
    }
  });
}

export function useEcotrackProducts(page = 1) {
  return useQuery({
    queryKey: ["ecotrack", "products", page],
    queryFn: async () => {
      const res = await fetch(`${BASE}/products?page=${page}`, { headers: expediteurHeaders() });
      if (res.status === 401 || res.status === 403 || res.status === 409) throw new Error("disconnected");
      const body = await res.json();
      return body.data || { products: [], pagination: {} };
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
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "actionFailed");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ecotrack", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["ecotrack", "dashboard"] });
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
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "actionFailed");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ecotrack", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["ecotrack", "dashboard"] });
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
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "actionFailed");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ecotrack", "orders"] });
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
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "actionFailed");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ecotrack", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["ecotrack", "dashboard"] });
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
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "actionFailed");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ecotrack", "orders"] });
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
      const body = await res.json();
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
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "actionFailed");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ecotrack", "orders"] });
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
        try { const body = await res.json(); msg = body.error || msg; } catch {}
        throw new Error(msg);
      }
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    },
  });
}
