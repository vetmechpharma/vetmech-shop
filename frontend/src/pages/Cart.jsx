import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "@/context/CartContext";
import { mediaUrl } from "@/lib/api";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Minus, Plus, Trash2, ShoppingCart, ArrowRight } from "lucide-react";

export default function Cart() {
  const { calc, setQty, removeItem, clear } = useCart();
  const navigate = useNavigate();
  const lines = calc.items || [];

  if (lines.length === 0) {
    return (
      <div className="vm-container py-20 text-center">
        <SEO title="Cart" />
        <ShoppingCart className="w-14 h-14 mx-auto text-slate-300 mb-4" />
        <h1 className="font-heading text-2xl font-bold text-vm-ink">Your cart is empty</h1>
        <p className="text-slate-500 mt-2">Browse our catalog and add products to order.</p>
        <Link to="/products"><Button className="mt-6 bg-vm-green hover:bg-vm-greenhover">Browse Products</Button></Link>
      </div>
    );
  }

  return (
    <div className="vm-container py-10">
      <SEO title="Cart" />
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-3xl font-bold text-vm-ink tracking-tight">Your Order Cart</h1>
        <Button variant="ghost" className="text-slate-500" onClick={clear} data-testid="clear-cart">Clear cart</Button>
      </div>

      <div className="mt-6 border border-[#E2E8F0] rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-vm-bg">
              <TableHead className="text-vm-ink">Product</TableHead>
              <TableHead className="text-vm-ink">Pack</TableHead>
              <TableHead className="text-vm-ink text-center">Qty</TableHead>
              <TableHead className="text-vm-ink text-center">Scheme</TableHead>
              <TableHead className="text-vm-ink text-center">Free</TableHead>
              <TableHead className="text-vm-ink text-center">Dispatch</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => (
              <TableRow key={l.variant_id} data-testid={`cart-row-${l.sku}`}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-[#F8FAF9] rounded p-1 flex-shrink-0">
                      {l.image && <img src={mediaUrl(l.image)} alt={l.product_name} className="w-full h-full object-contain" />}
                    </div>
                    <div>
                      <Link to={`/products/${l.slug}`} className="font-medium text-vm-ink hover:text-vm-green">{l.product_name}</Link>
                      <p className="text-xs text-slate-400">{l.brand_name}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-slate-600">{l.pack_size} {l.unit}{l.units_per_case > 0 && <span className="block text-[11px] text-slate-400">Case of {l.units_per_case}</span>}</TableCell>
                <TableCell>
                  <div className="flex items-center border border-[#E2E8F0] rounded-md w-fit mx-auto">
                    <button className="px-2 py-1.5 text-slate-500" onClick={() => setQty(l.variant_id, l.qty - 1)} data-testid={`cart-minus-${l.sku}`}><Minus className="w-3.5 h-3.5" /></button>
                    <span className="w-10 text-center text-sm" data-testid={`cart-qty-${l.sku}`}>{l.qty}</span>
                    <button className="px-2 py-1.5 text-slate-500" onClick={() => setQty(l.variant_id, l.qty + 1)} data-testid={`cart-plus-${l.sku}`}><Plus className="w-3.5 h-3.5" /></button>
                  </div>
                </TableCell>
                <TableCell className="text-center text-sm">
                  {l.scheme_label ? <span className="text-vm-accent font-medium">{l.scheme_label}</span> : <span className="text-slate-300">—</span>}
                  {l.upsell && <span className="block text-[11px] text-vm-green mt-1" data-testid={`cart-upsell-${l.sku}`}>{l.upsell.message}</span>}
                  {l.case_suggestion && <span className="block text-[11px] text-vm-accent mt-0.5" data-testid={`cart-case-${l.sku}`}>{l.case_suggestion.message}</span>}
                </TableCell>
                <TableCell className="text-center font-medium text-vm-accent" data-testid={`cart-free-${l.sku}`}>{l.free_qty || 0}</TableCell>
                <TableCell className="text-center font-semibold text-vm-ink">{l.dispatch_qty}</TableCell>
                <TableCell>
                  <button onClick={() => removeItem(l.variant_id)} className="text-slate-400 hover:text-red-500" data-testid={`cart-remove-${l.sku}`}><Trash2 className="w-4 h-4" /></button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="bg-vm-bg rounded-lg px-5 py-4 text-sm flex gap-6">
          <div><span className="text-slate-500">Items</span><p className="font-heading text-lg font-bold text-vm-ink">{calc.line_count}</p></div>
          <div><span className="text-slate-500">Ordered Qty</span><p className="font-heading text-lg font-bold text-vm-ink">{calc.total_qty}</p></div>
          <div><span className="text-slate-500">Free Qty</span><p className="font-heading text-lg font-bold text-vm-accent">{calc.total_free}</p></div>
          <div><span className="text-slate-500">Dispatch Qty</span><p className="font-heading text-lg font-bold text-vm-green">{calc.total_dispatch}</p></div>
        </div>
        <Button size="lg" className="bg-vm-green hover:bg-vm-greenhover w-full sm:w-auto" onClick={() => navigate("/checkout")} data-testid="proceed-checkout">
          Proceed to Checkout <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
      <p className="text-xs text-slate-400 mt-3">No online payment required. Confirm your order and our team will contact you on WhatsApp.</p>
    </div>
  );
}
