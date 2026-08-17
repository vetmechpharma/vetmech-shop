import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api, mediaUrl } from "@/lib/api";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";

export default function SearchModal({ open, onOpenChange }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!q || q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/search`, { params: { q } });
        setResults(data.results || []);
      } catch { setResults([]); }
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const go = (slug) => {
    onOpenChange(false);
    setQ("");
    navigate(`/products/${slug}`);
  };

  const submitAll = (e) => {
    e.preventDefault();
    onOpenChange(false);
    navigate(`/products?q=${encodeURIComponent(q)}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 gap-0 top-[15%] translate-y-0" data-testid="search-modal">
        <form onSubmit={submitAll} className="flex items-center gap-2 border-b px-4 py-3">
          <Search className="w-5 h-5 text-slate-400" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder="Search products, brands, composition, SKU..."
                 className="border-0 focus-visible:ring-0 shadow-none px-0"
                 data-testid="search-input" />
        </form>
        <div className="max-h-[50vh] overflow-y-auto">
          {loading && <p className="p-4 text-sm text-slate-400">Searching...</p>}
          {!loading && q.length >= 2 && results.length === 0 && (
            <p className="p-4 text-sm text-slate-400">No products found.</p>
          )}
          {results.map((r) => (
            <button key={r.id} onClick={() => go(r.slug)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-vm-bg text-left border-b border-slate-50"
                    data-testid={`search-result-${r.slug}`}>
              <div className="w-11 h-11 bg-[#F8FAF9] rounded flex-shrink-0 p-1">
                {r.image && <img src={mediaUrl(r.image)} alt={r.name} className="w-full h-full object-contain" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-vm-ink text-sm truncate">{r.name}</p>
                <p className="text-xs text-slate-400">{r.brand_name} · {r.pack_size}</p>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded ${r.stock_status === "out_of_stock" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                {r.stock_status === "out_of_stock" ? "Out" : "In stock"}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
