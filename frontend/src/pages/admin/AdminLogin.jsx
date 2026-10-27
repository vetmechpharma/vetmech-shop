import React, { useState } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { Input } from "@/components/ui/input";
import PasswordInput from "@/components/PasswordInput";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import Brand from "@/components/corporate/Brand";
import SEO from "@/components/SEO";
import { ArrowRight, ArrowLeft, Loader2 } from "lucide-react";
import "@/components/admin/admin.css";

export default function AdminLogin() {
  const { admin, login } = useAdminAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  if (admin) return <Navigate to="/admin" replace />;
  const submit = async (event) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true); setError("");
    try {
      localStorage.removeItem("vm_admin_token");
      const { data } = await api.post("/auth/admin/login", { email: email.trim(), password });
      login(data.token, data.user); setPassword(""); navigate("/admin");
    } catch (e) { setError(apiError(e)); }
    finally { setLoading(false); }
  };
  return <div className="vm-admin-login">
    <SEO title="Admin sign in" noindex />
    <div className="vm-admin-login-story">
      <Brand light />
      <div><div className="vm-admin-eyebrow">VETMECH ADMINISTRATION</div><h2>One workspace.<br />A shared purpose.</h2><p>Manage the products, partnerships and everyday work behind animal health.</p></div>
      <small>THE SCIENCE OF ANIMAL HEALTH</small>
    </div>
    <div className="vm-admin-login-form-wrap"><form onSubmit={submit} className="vm-admin-login-form" data-testid="admin-login-form">
      <div className="vm-admin-eyebrow">YOUR WORKSPACE</div>
      <h1>Welcome back.</h1><p>Sign in to your VETMECH admin account.</p>
      <div className="space-y-5">
        <div className="space-y-2"><Label htmlFor="admin-email">Email address</Label><Input id="admin-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@vetmech.in" data-testid="admin-email" /></div>
        <div className="space-y-2"><Label htmlFor="admin-password">Password</Label><PasswordInput id="admin-password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" data-testid="admin-password" /></div>
        {error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-md p-3">{error}</p>}
        <Button type="submit" className="w-full bg-vm-green hover:bg-vm-greenhover h-12" disabled={loading} data-testid="admin-login-submit">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />} Sign in</Button>
      </div>
      <Link to="/" className="vm-admin-login-back"><ArrowLeft size={15} /> Back to corporate website</Link>
    </form></div>
  </div>;
}
