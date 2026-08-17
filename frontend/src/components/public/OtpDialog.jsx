import React, { useState } from "react";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { MessageCircle, Loader2 } from "lucide-react";

/**
 * Reusable WhatsApp OTP dialog.
 * onVerified({ registered, token, customer, mobile }) called on success.
 */
export default function OtpDialog({ open, onOpenChange, onVerified }) {
  const [step, setStep] = useState("mobile");
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const { loginWithToken } = useAuth();

  const reset = () => { setStep("mobile"); setOtp(""); setDevOtp(""); };

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

  const verify = async () => {
    setLoading(true);
    try {
      const { data } = await api.post("/auth/otp/verify", { mobile, otp });
      if (data.registered && data.token) {
        loginWithToken(data.token, data.customer);
      }
      toast.success("Mobile verified");
      onVerified?.({ ...data, mobile });
      onOpenChange(false);
      reset();
    } catch (e) { toast.error(apiError(e)); }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-sm" data-testid="otp-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading">
            <MessageCircle className="w-5 h-5 text-vm-accent" /> WhatsApp Verification
          </DialogTitle>
        </DialogHeader>
        {step === "mobile" ? (
          <div className="space-y-3">
            <Label>Mobile Number</Label>
            <Input value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
                   maxLength={10} placeholder="10-digit mobile number" data-testid="otp-mobile-input" />
            <Button onClick={sendOtp} disabled={loading} className="w-full bg-vm-green hover:bg-vm-greenhover" data-testid="send-otp-btn">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Send OTP
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Label>Enter OTP sent to {mobile}</Label>
            <Input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                   maxLength={6} placeholder="6-digit OTP" data-testid="otp-input" />
            {devOtp && (
              <p className="text-xs bg-vm-bg border border-vm-accent/30 rounded p-2 text-vm-green" data-testid="dev-otp-hint">
                Demo mode — your OTP is <strong>{devOtp}</strong>
              </p>
            )}
            <Button onClick={verify} disabled={loading || otp.length < 4} className="w-full bg-vm-green hover:bg-vm-greenhover" data-testid="verify-otp-btn">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Verify
            </Button>
            <button onClick={() => setStep("mobile")} className="text-xs text-slate-500 w-full text-center">Change number</button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
