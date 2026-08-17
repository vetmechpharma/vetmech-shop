import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, mediaUrl } from "@/lib/api";
import SEO from "@/components/SEO";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export default function Gallery() {
  const { data } = useQuery({ queryKey: ["gallery"], queryFn: async () => (await api.get("/gallery")).data });
  const [active, setActive] = useState(null);
  const albums = [...new Set((data || []).map((g) => g.album))];

  return (
    <div>
      <SEO title="Gallery" description="Photo gallery of VETMECH facilities, team and field activities." />
      <section className="bg-vm-ink text-white"><div className="vm-container py-14"><h1 className="font-heading text-4xl font-bold tracking-tight">Gallery</h1><p className="text-slate-300 mt-2">Our facilities, team and field work</p></div></section>
      <div className="vm-container py-10">
        {albums.map((album) => (
          <div key={album} className="mb-10">
            <h2 className="font-heading text-xl font-bold text-vm-ink mb-4">{album}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(data || []).filter((g) => g.album === album).map((g) => (
                <button key={g.id} onClick={() => setActive(g)} className="group rounded-lg overflow-hidden border border-[#E2E8F0] aspect-video" data-testid={`gallery-item-${g.id}`}>
                  <img src={mediaUrl(g.image)} alt={g.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Dialog open={!!active} onOpenChange={(v) => !v && setActive(null)}>
        <DialogContent className="max-w-3xl p-2">
          {active && <><img src={mediaUrl(active.image)} alt={active.title} className="w-full rounded" /><p className="p-3 font-medium text-vm-ink">{active.title}</p></>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
