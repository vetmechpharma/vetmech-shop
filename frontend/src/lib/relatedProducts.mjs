export const RELATED_PRODUCT_LIMIT = 4;

// Bound rendering even when an older API or saved demo returns a larger list.
export function relatedProductsFor(product) {
  const seen = new Set([product.id]);
  return (product.related || []).filter(item => {
    if (!item?.id || !item.slug || item.active === false || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).slice(0, RELATED_PRODUCT_LIMIT);
}

// Browser demo equivalent of the backend's category-first random sampling.
export function randomRelatedProducts(product, products, random = Math.random) {
  const categories = new Set([product.category_id, ...(product.category_ids || [])].filter(Boolean));
  const seen = new Set([product.id]);
  const candidates = products.filter(item => {
    if (!item.id || item.active !== true || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  const sameCategory = item => [item.category_id, ...(item.category_ids || [])].some(id => categories.has(id));
  const sample = (items, count) => {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const swap = Math.floor(random() * (index + 1));
      [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
    }
    return shuffled.slice(0, count);
  };
  const related = sample(candidates.filter(sameCategory), RELATED_PRODUCT_LIMIT);
  return related.concat(sample(candidates.filter(item => !sameCategory(item)), RELATED_PRODUCT_LIMIT - related.length));
}
