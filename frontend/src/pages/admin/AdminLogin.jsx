import React, { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShieldCheck, Loader2 } from "lucide-react";

export default function AdminLogin() {
  const { admin, login } = useAdminAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  if (admin) return <Navigate to="/admin" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/admin/login", { email, password });
      login(data.token, data.user);
      toast.success("Welcome back");
      navigate("/admin");
    } catch (err) { toast.error(apiError(err)); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen grid place-items-center bg-vm-ink px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8">
          <div className="w-10 h-10 rounded-md bg-vm-accent text-white grid place-items-center font-heading font-extrabold text-lg">V</div>
          <div className="text-white font-heading font-extrabold text-xl">VETMECH <span className="text-vm-accent text-sm">Admin</span></div>
        </div>
        <form onSubmit={submit} className="bg-white rounded-xl p-7 shadow-xl" data-testid="admin-login-form">
          <h1 className="font-heading text-xl font-bold text-vm-ink flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-vm-accent" /> Admin Login</h1>
          <p className="text-sm text-slate-500 mt-1 mb-5">Sign in to manage VETMECH</p>
          <div className="space-y-4">
            <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="admin-email" /></div>
            <div><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="admin-password" /></div>
            <Button type="submit" className="w-full bg-vm-green hover:bg-vm-greenhover" disabled={loading} data-testid="admin-login-submit">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Sign In
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
