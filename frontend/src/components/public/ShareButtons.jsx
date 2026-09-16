import React, { useState } from "react";
import { Share2, Copy, Check, Facebook, Linkedin, Twitter, MessageCircle } from "lucide-react";
import { toast } from "sonner";

// Social share row for products/articles. `url` should be the absolute canonical URL.
export default function ShareButtons({ url, title, className = "" }) {
  const [copied, setCopied] = useState(false);
  const u = encodeURIComponent(url || (typeof window !== "undefined" ? window.location.href : ""));
  const t = encodeURIComponent(title || "");
  const links = [
    { key: "whatsapp", label: "WhatsApp", href: `https://wa.me/?text=${t}%20${u}`, Icon: MessageCircle, hover: "hover:bg-[#25D366] hover:text-white hover:border-[#25D366]" },
    { key: "facebook", label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}`, Icon: Facebook, hover: "hover:bg-[#1877F2] hover:text-white hover:border-[#1877F2]" },
    { key: "twitter", label: "X", href: `https://twitter.com/intent/tweet?url=${u}&text=${t}`, Icon: Twitter, hover: "hover:bg-black hover:text-white hover:border-black" },
    { key: "linkedin", label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`, Icon: Linkedin, hover: "hover:bg-[#0A66C2] hover:text-white hover:border-[#0A66C2]" },
  ];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Could not copy link");
    }
  };

  const nativeShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ title, url }); } catch { /* user cancelled */ }
    } else {
      copy();
    }
  };

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`} data-testid="share-buttons">
      <button onClick={nativeShare} className="text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-vm-green flex items-center gap-1" data-testid="share-native" aria-label="Share this product">
        <Share2 className="w-3.5 h-3.5" /> Share
      </button>
      {links.map(({ key, label, href, Icon, hover }) => (
        <a key={key} href={href} target="_blank" rel="noopener noreferrer" aria-label={`Share on ${label}`} title={label}
           className={`w-8 h-8 inline-flex items-center justify-center rounded-full border border-[#E2E8F0] text-slate-500 transition-colors ${hover}`}
           data-testid={`share-${key}`}>
          <Icon className="w-4 h-4" />
        </a>
      ))}
      <button onClick={copy} aria-label="Copy link" title="Copy link"
        className="w-8 h-8 inline-flex items-center justify-center rounded-full border border-[#E2E8F0] text-slate-500 hover:bg-vm-green hover:text-white hover:border-vm-green transition-colors" data-testid="share-copy">
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
}
