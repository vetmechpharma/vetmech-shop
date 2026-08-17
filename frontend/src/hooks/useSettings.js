import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useSettings(id) {
  return useQuery({
    queryKey: ["settings", id],
    queryFn: async () => (await api.get(`/settings/${id}`)).data,
  });
}
