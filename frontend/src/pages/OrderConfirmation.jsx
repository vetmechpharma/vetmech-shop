import React from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { CheckCircle2, MessageCircle, Package } from "lucide-react";
import { statusMeta } from "@/lib/constants";

export default function OrderConfirmation() {
  const { id } = useParams();
  const location = useLocation();
  const passed = location.state?.order;
  const { data } = useQuery({
    queryKey: ["order", id],
    queryFn: async () => (await api.get(`/orders/${id}`)).data,
    enabled: !passed && !!localStorage.getItem("vm_customer_token"),
    initialData: passed,
  });
  const order = data || passed;

  if (!order) return <div className="vm-container py-20 text-center text-slate-400">Loading order...</div>;

  return (
    <div className="vm-container py-14 max-w-2xl">
      <SEO title="Order Received" />
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 grid place-items-center mx-auto">
          <CheckCircle2 className="w-9 h-9 text-green-600" />
        </div>
        <h1 className="font-heading text-3xl font-bold text-vm-ink mt-4 tracking-tight" data-testid="order-received-title">ORDER RECEIVED</h1>
        <p className="text-slate-500 mt-2">Your order has been submitted successfully. Our team will confirm shortly on WhatsApp.</p>
      </div>

      <div className="border border-[#E2E8F0] rounded-lg mt-8 overflow-hidden">
        <div className="bg-vm-bg px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500">Order Number</p>
            <p className="font-heading font-bold text-vm-green text-lg" data-testid="order-number">{order.order_number}</p>
          </div>
          <span className={`text-xs font-semibold px-3 py-1 rounded ${statusMeta(order.status).color}`}>{statusMeta(order.status).label}</span>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-slate-500">Customer</p>
          <p className="font-medium text-vm-ink">{order.customer_name}{order.company_name ? ` · ${order.company_name}` : ""}</p>

          <div className="mt-4 space-y-2">
            {order.items.map((l) => (
              <div key={l.variant_id} className="flex justify-between text-sm border-b border-slate-50 pb-2">
                <span className="text-slate-600"><Package className="w-3.5 h-3.5 inline mr-1 text-vm-accent" />{l.product_name} — {l.pack_size} {l.unit}</span>
                <span className="font-medium text-vm-ink">{l.qty}{l.free_qty ? <span className="text-vm-accent"> + {l.free_qty} FREE</span> : ""}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-6 mt-4 text-sm">
            <div><span className="text-slate-500">Ordered</span> <strong>{order.total_qty}</strong></div>
            <div><span className="text-slate-500">Free</span> <strong className="text-vm-accent">{order.total_free}</strong></div>
            <div><span className="text-slate-500">Dispatch</span> <strong className="text-vm-green">{order.total_dispatch}</strong></div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mt-8 justify-center">
        <Link to="/account"><Button variant="outline" className="border-vm-green text-vm-green">View My Orders</Button></Link>
        <Link to="/products"><Button className="bg-vm-green hover:bg-vm-greenhover">Continue Shopping</Button></Link>
      </div>
    </div>
  );
}
