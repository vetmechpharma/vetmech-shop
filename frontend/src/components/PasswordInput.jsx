import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default function PasswordInput({ className, label = "password", ...props }) {
  const [visible, setVisible] = useState(false);
  return <div className="relative">
    <Input {...props} type={visible ? "text" : "password"} className={cn("pr-11", className)} />
    <button type="button" className="absolute right-1 top-1/2 -translate-y-1/2 p-2 rounded text-slate-500 hover:text-vm-green focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      aria-label={`${visible ? "Hide" : "Show"} ${label}`} aria-pressed={visible} onClick={() => setVisible(!visible)}>
      {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  </div>;
}
