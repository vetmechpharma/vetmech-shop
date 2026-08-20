import React, { useRef, useState } from "react";
import { api, mediaUrl, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Upload, X, Loader2, FileText } from "lucide-react";

export default function ImageUpload({ value, onChange, label = "Image", accept = "image/*", isPdf = false, testid, square = false }) {
  const ref = useRef();
  const [loading, setLoading] = useState(false);

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post(`/admin/upload${square ? "?square=true" : ""}`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      onChange(data.url);
      toast.success("Uploaded");
    } catch (err) { toast.error(apiError(err)); }
    setLoading(false);
  };

  return (
    <div>
      {label && <p className="text-sm font-medium text-vm-ink mb-1.5">{label}</p>}
      <div className="flex items-center gap-3">
        {value ? (
          <div className="relative w-16 h-16 rounded border border-[#E2E8F0] bg-[#F8FAF9] p-1 flex-shrink-0">
            {isPdf ? <div className="w-full h-full grid place-items-center text-vm-green"><FileText className="w-6 h-6" /></div>
              : <img src={mediaUrl(value)} alt="" className="w-full h-full object-contain" />}
            <button type="button" onClick={() => onChange("")} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 grid place-items-center"><X className="w-3 h-3" /></button>
          </div>
        ) : null}
        <div className="flex-1">
          <input ref={ref} type="file" accept={accept} className="hidden" onChange={upload} data-testid={testid} />
          <Button type="button" variant="outline" size="sm" onClick={() => ref.current?.click()} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />} Upload
          </Button>
          <Input className="mt-2" placeholder="or paste URL" value={value || ""} onChange={(e) => onChange(e.target.value)} />
        </div>
      </div>
    </div>
  );
}
