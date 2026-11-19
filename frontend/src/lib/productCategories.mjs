export const assignedIds=(row,plural,singular)=>Array.from(new Set([...(row[plural]||[]),...(row[singular]?[row[singular]]:[])]));
export function productSelection(row,categories){
  const mains=assignedIds(row,'category_ids','category_id').filter(id=>categories.some(c=>c.id===id&&c.fixed_main));
  const subs=assignedIds(row,'subcategory_ids','subcategory_id').filter(id=>categories.some(c=>c.id===id&&!c.legacy_main&&mains.includes(c.parent_id)));
  return {...row,category_ids:mains,category_id:mains[0]||null,subcategory_ids:subs,subcategory_id:subs[0]||null};
}
export function toggleProductCategory(row,categories,id,sub=false){
  const value=productSelection(row,categories),key=sub?'subcategory_ids':'category_ids',selected=new Set(value[key]);
  selected.has(id)?selected.delete(id):selected.add(id);
  const next={...value,[key]:[...selected],[sub?'subcategory_id':'category_id']:null};
  return productSelection(next,categories);
}
