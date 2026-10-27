import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import PasswordInput from "@/components/PasswordInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ArrowRight } from "lucide-react";

export default function AuthDialog({ open, onOpenChange, onLoggedIn }) {
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const close = () => { onOpenChange(false); setPassword(""); setError(""); };
  const login = async (event) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true); setError("");
    try {
      const { data } = await api.post("/auth/login/password", { mobile, password });
      loginWithToken(data.token, data.customer);
      if (data.status === "pending") toast.info("Logged in. Your account is pending approval — special pricing unlocks once approved.");
      else toast.success(`Welcome back, ${data.customer?.name || ""}`);
      onLoggedIn?.(data.customer);
      close();
    } catch (e) { setError(apiError(e)); }
    finally { setLoading(false); }
  };

  return <Dialog open={open} onOpenChange={(value) => { if (!value) close(); else onOpenChange(true); }}>
    <DialogContent className="max-w-sm" data-testid="auth-dialog">
      <DialogHeader>
        <DialogTitle className="font-heading text-vm-ink">Welcome to Partner Shop</DialogTitle>
        <DialogDescription>Sign in with your registered mobile number and password.</DialogDescription>
      </DialogHeader>
      <form onSubmit={login} className="space-y-4 pt-2">
        <div className="space-y-2"><Label htmlFor="customer-login-mobile">Mobile number</Label>
          <Input id="customer-login-mobile" type="tel" inputMode="numeric" autoComplete="tel-national" value={mobile}
            onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))} required pattern="[0-9]{10}" maxLength={10}
            placeholder="10-digit mobile" data-testid="auth-pw-mobile" /></div>
        <div className="space-y-2"><Label htmlFor="customer-login-password">Password</Label>
          <PasswordInput id="customer-login-password" value={password} onChange={(e) => setPassword(e.target.value)} required
            autoComplete="current-password" placeholder="Your password" data-testid="auth-pw-password" /></div>
        {error && <p role="alert" className="text-sm text-red-700 bg-red-50 p-3 rounded-md">{error}</p>}
        <Button type="submit" disabled={loading} className="w-full bg-vm-green hover:bg-vm-greenhover" data-testid="auth-pw-login">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />} Sign in
        </Button>
      </form>
      <p className="text-sm text-slate-500">Need a password or forgot it? <button type="button" className="text-vm-green font-semibold hover:underline" onClick={() => { close(); navigate("/contact"); }}>Contact VETMECH</button> for a reset.</p>
      <p className="text-sm text-center text-slate-500 border-t pt-4">New customer? <button type="button" className="text-vm-green font-semibold hover:underline"
        onClick={() => { close(); navigate("/register"); }} data-testid="auth-goto-register">Create an account</button></p>
    </DialogContent>
  </Dialog>;
}
