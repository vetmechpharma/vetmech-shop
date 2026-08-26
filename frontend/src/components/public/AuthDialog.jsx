import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { MessageCircle, Loader2, KeyRound } from "lucide-react";

/**
 * Reusable customer auth dialog with OTP and Password tabs.
 * onLoggedIn(customer) fires after successful login.
 */
export default function AuthDialog({ open, onOpenChange, onLoggedIn }) {
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState("mobile");
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => { setStep("mobile"); setOtp(""); setDevOtp(""); setPassword(""); };
  const close = () => { onOpenChange(false); reset(); };

  const finish = (data) => {
    loginWithToken(data.token, data.customer);
    if (data.status === "pending") toast.info("Logged in. Your account is pending approval — special pricing unlocks once approved.");
    else toast.success(`Welcome back, ${data.customer?.name || ""}`);
    onLoggedIn?.(data.customer);
    close();
  };

  const sendOtp = async () => {
    if (mobile.trim().length < 10) { toast.error("Enter a valid 10-digit mobile"); return; }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/otp/request", { mobile });
      setDevOtp(data.dev_otp || "");
      setStep("otp");
      toast.success("OTP sent via WhatsApp (simulated)");
    } catch (e) { toast.error(apiError(e)); }
    setLoading(false);
  };

  const verifyOtp = async () => {
    setLoading(true);
    try {
      const { data } = await api.post("/auth/otp/verify", { mobile, otp });
      if (data.registered && data.token) finish(data);
      else { toast.info("Mobile verified. Please register to continue."); close(); navigate("/register", { state: { mobile } }); }
    } catch (e) { toast.error(apiError(e)); }
    setLoading(false);
  };

  const loginPassword = async () => {
    if (mobile.trim().length < 10 || !password) { toast.error("Enter mobile and password"); return; }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login/password", { mobile, password });
      finish(data);
    } catch (e) { toast.error(apiError(e)); }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-sm" data-testid="auth-dialog">
        <DialogHeader><DialogTitle className="font-heading text-vm-ink">Login to view your price</DialogTitle>
          <DialogDescription>Use WhatsApp OTP or your password to access your special B2B pricing.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="otp" onValueChange={reset}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="otp" data-testid="auth-tab-otp"><MessageCircle className="w-4 h-4 mr-1" /> OTP</TabsTrigger>
            <TabsTrigger value="password" data-testid="auth-tab-password"><KeyRound className="w-4 h-4 mr-1" /> Password</TabsTrigger>
          </TabsList>

          <TabsContent value="otp" className="space-y-3 pt-3">
            {step === "mobile" ? (
              <>
                <Label>Mobile Number</Label>
                <Input value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))} maxLength={10} placeholder="10-digit mobile" data-testid="auth-otp-mobile" />
                <Button onClick={sendOtp} disabled={loading} className="w-full bg-vm-green hover:bg-vm-greenhover" data-testid="auth-send-otp">
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Send OTP
                </Button>
              </>
            ) : (
              <>
                <Label>Enter OTP sent to {mobile}</Label>
                <Input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} maxLength={6} placeholder="6-digit OTP" data-testid="auth-otp-input" />
                {devOtp && <p className="text-xs bg-vm-bg border border-vm-accent/30 rounded p-2 text-vm-green" data-testid="auth-dev-otp">Demo mode — your OTP is <strong>{devOtp}</strong></p>}
                <Button onClick={verifyOtp} disabled={loading || otp.length < 4} className="w-full bg-vm-green hover:bg-vm-greenhover" data-testid="auth-verify-otp">
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Verify & Login
                </Button>
                <button onClick={() => setStep("mobile")} className="text-xs text-slate-500 w-full text-center">Change number</button>
              </>
            )}
          </TabsContent>

          <TabsContent value="password" className="space-y-3 pt-3">
            <Label>Mobile Number</Label>
            <Input value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))} maxLength={10} placeholder="10-digit mobile" data-testid="auth-pw-mobile" />
            <Label>Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" data-testid="auth-pw-password" onKeyDown={(e) => e.key === "Enter" && loginPassword()} />
            <Button onClick={loginPassword} disabled={loading} className="w-full bg-vm-green hover:bg-vm-greenhover" data-testid="auth-pw-login">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Login
            </Button>
          </TabsContent>
        </Tabs>
        <p className="text-sm text-center text-slate-500 pt-1">New customer?{" "}
          <button className="text-vm-green font-semibold hover:underline" onClick={() => { close(); navigate("/register"); }} data-testid="auth-goto-register">Create an account</button>
        </p>
      </DialogContent>
    </Dialog>
  );
}
