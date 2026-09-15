import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Star } from "lucide-react";

function Stars({ value, size = "w-4 h-4", onSelect }) {
  return (
    <div className="flex">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n}
          className={`${size} ${n <= value ? "fill-amber-400 text-amber-400" : "text-slate-300"} ${onSelect ? "cursor-pointer" : ""}`}
          onClick={onSelect ? () => onSelect(n) : undefined}
          data-testid={onSelect ? `rating-star-${n}` : undefined} />
      ))}
    </div>
  );
}

export default function ProductReviews({ productId }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["reviews", productId], queryFn: async () => (await api.get("/reviews", { params: { product_id: productId } })).data });
  const [form, setForm] = useState({ name: "", rating: 0, title: "", comment: "" });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async () => {
    if (!form.name.trim()) return toast.error("Please enter your name");
    if (!form.rating) return toast.error("Please select a star rating");
    setBusy(true);
    try {
      const { data: res } = await api.post("/reviews", { ...form, product_id: productId, kind: "product" });
      toast.success(res.message || "Thank you!");
      setForm({ name: "", rating: 0, title: "", comment: "" });
      qc.invalidateQueries({ queryKey: ["reviews", productId] });
    } catch (e) { toast.error(apiError(e)); }
    setBusy(false);
  };
  const items = data?.items || [];
  return (
    <div className="mt-14 border-t border-[#E2E8F0] pt-8" data-testid="product-reviews">
      <div className="flex items-center gap-3 mb-6">
        <h2 className="font-heading text-2xl font-bold text-vm-ink">Customer Reviews</h2>
        {data?.count > 0 && (
          <div className="flex items-center gap-2">
            <Stars value={Math.round(data.average)} />
            <span className="text-sm text-slate-500">{data.average} · {data.count} review{data.count > 1 ? "s" : ""}</span>
          </div>
        )}
      </div>
      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-4">
          {items.length === 0 && <p className="text-slate-400 text-sm">No reviews yet. Be the first to review this product!</p>}
          {items.map((r) => (
            <div key={r.id} className="border border-[#E2E8F0] rounded-lg p-4" data-testid={`review-item-${r.id}`}>
              <div className="flex items-center gap-2"><span className="font-medium text-vm-ink">{r.name}</span><Stars value={r.rating} size="w-3.5 h-3.5" /></div>
              {r.title && <p className="font-medium text-sm mt-1 text-vm-ink">{r.title}</p>}
              <p className="text-sm text-slate-600 mt-0.5 whitespace-pre-line">{r.comment}</p>
            </div>
          ))}
        </div>
        <div className="bg-vm-bg border border-[#E2E8F0] rounded-lg p-5 h-fit">
          <h3 className="font-heading font-bold text-vm-ink mb-3">Write a Review</h3>
          <div className="space-y-3">
            <div><label className="text-sm text-slate-600">Your rating</label><div className="mt-1"><Stars value={form.rating} size="w-6 h-6" onSelect={(n) => set("rating", n)} /></div></div>
            <Input placeholder="Your name" value={form.name} onChange={(e) => set("name", e.target.value)} data-testid="review-name" />
            <Input placeholder="Review title (optional)" value={form.title} onChange={(e) => set("title", e.target.value)} data-testid="review-title" />
            <Textarea placeholder="Share your experience" value={form.comment} onChange={(e) => set("comment", e.target.value)} data-testid="review-comment" />
            <Button className="w-full bg-vm-green hover:bg-vm-greenhover" onClick={submit} disabled={busy} data-testid="review-submit">Submit Review</Button>
            <p className="text-xs text-slate-400">Reviews appear after admin approval.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
