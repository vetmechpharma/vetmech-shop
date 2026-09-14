import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { mediaUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useCart } from "@/context/CartContext";
import ProductBadges from "./ProductBadges";
import { ShoppingCart, Eye } from "lucide-react";

export default function ProductCard({ product }) {
  const navigate = useNavigate();
  const { addItem } = useCart();
  const v0 = (product.variants || [])[0] || {};
  const outOfStock = product.badges?.out_of_stock || v0.stock_status === "out_of_stock";
  const scheme = (v0.active_schemes || [])[0];

  return (
    <div
      className="group bg-white border border-[#E2E8F0] rounded-lg overflow-hidden transition-colors hover:border-vm-accent flex flex-col"
      data-testid={`product-card-${product.slug}`}
    >
      <Link to={`/products/${product.slug}`} className="block relative aspect-square bg-[#F8FAF9] p-4">
        <ProductBadges badges={product.badges} className="absolute top-2 left-2 z-10 max-w-[85%]" />
        {product.image ? (
          <img src={mediaUrl(product.image)} alt={product.name} loading="lazy"
               className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300 text-sm">No image</div>
        )}
      </Link>
      <div className="p-4 flex flex-col flex-1">
        <p className="text-[11px] uppercase tracking-wider text-vm-accent font-semibold">{product.brand_name}</p>
        <Link to={`/products/${product.slug}`} className="font-heading font-bold text-vm-ink mt-0.5 hover:text-vm-green line-clamp-1">
          {product.name}
        </Link>
        <p className="text-sm text-slate-500 mt-1 line-clamp-2 flex-1">{product.short_description}</p>

        <div className="mt-3 flex items-center justify-between text-sm">
          <div>
            {v0.your_price != null ? (
              <span className="font-semibold text-vm-green" data-testid={`card-your-price-${product.slug}`}>₹{v0.your_price} <span className="text-[10px] text-vm-accent font-bold uppercase">Your Price</span></span>
            ) : (
              <span className="text-sm"><span className="text-slate-400 text-xs uppercase mr-1">MRP</span><span className="font-semibold text-vm-ink">₹{v0.mrp}</span></span>
            )}
            {v0.pack_size && <span className="text-slate-400 ml-1 text-xs">/ {v0.pack_size}</span>}
          </div>
          {scheme && (
            <span className="text-[11px] font-semibold text-vm-accent bg-vm-accent/10 px-2 py-0.5 rounded">
              {scheme.type === "special_price" ? `${scheme.min} @ ₹${scheme.special_price}` : `${scheme.buy}+${scheme.free}`}
            </span>
          )}
        </div>

        <div className="mt-3 flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 border-vm-green text-vm-green hover:bg-vm-bg"
                  onClick={() => navigate(`/products/${product.slug}`)} data-testid={`view-product-${product.slug}`}>
            <Eye className="w-4 h-4 mr-1" /> View
          </Button>
          <Button size="sm" disabled={outOfStock} className="flex-1 bg-vm-green hover:bg-vm-greenhover"
                  onClick={() => addItem(v0.id, v0.min_order_qty || 1, { name: product.name, pack: v0.pack_size })}
                  data-testid={`add-to-cart-${product.slug}`}>
            <ShoppingCart className="w-4 h-4 mr-1" /> {outOfStock ? "N/A" : "Add"}
          </Button>
        </div>
      </div>
    </div>
  );
}
