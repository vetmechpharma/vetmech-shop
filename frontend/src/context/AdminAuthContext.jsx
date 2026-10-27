import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

const AdminAuthContext = createContext(null);
export const useAdminAuth = () => useContext(AdminAuthContext);

export function AdminAuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const token = localStorage.getItem("vm_admin_token");
    if (!token) { setAdmin(null); setLoading(false); return; }
    try {
      const { data } = await api.get("/auth/admin/me");
      setAdmin(data);
    } catch {
      localStorage.removeItem("vm_admin_token");
      setAdmin(null);
    } finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  const login = (token, user) => {
    localStorage.setItem("vm_admin_token", token);
    queryClient.clear();
    setAdmin(user);
  };
  const logout = () => { localStorage.removeItem("vm_admin_token"); queryClient.clear(); setAdmin(null); };

  const can = (module) => {
    if (!admin) return false;
    if (admin.role === "super_admin") return true;
    const perms = admin.permissions || [];
    return perms.includes("*") || perms.includes(module);
  };

  return (
    <AdminAuthContext.Provider value={{ admin, loading, login, logout, refresh, can }}>
      {children}
    </AdminAuthContext.Provider>
  );
}
