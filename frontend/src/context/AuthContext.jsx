import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const token = localStorage.getItem("vm_customer_token");
    if (!token) { setCustomer(null); setLoading(false); return; }
    try {
      const { data } = await api.get("/auth/customer/me");
      setCustomer(data);
    } catch {
      localStorage.removeItem("vm_customer_token");
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const loginWithToken = (token, cust) => {
    localStorage.setItem("vm_customer_token", token);
    setCustomer(cust);
  };

  const logout = () => {
    localStorage.removeItem("vm_customer_token");
    setCustomer(null);
  };

  return (
    <AuthContext.Provider value={{ customer, loading, loginWithToken, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}
