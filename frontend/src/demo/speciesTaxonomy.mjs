export const MAIN_GROUPS=[['ruminants','Ruminants',['ruminants','ruminant','large animal','large animals','cattle','livestock']],['companion-pets','Companion Pets',['companion pets','companion animals','pets','pet','small animal','small animals']],['poultry','Poultry',['poultry']],['pig','Pig',['pig','pigs','swine']],['horses','Horses',['horses','horse','equine','equines']],['exotic-birds','Exotic Birds',['exotic birds','exotic bird']]];
const allIds=(p,one,many)=>[...new Set([...(p[many]||[]),...(p[one]?[p[one]]:[])])];
export function ensureDemoTaxonomy(state){
 if(state.species_taxonomy_v1)return;
 const roots=state.categories.filter(c=>!c.parent_id||c.parent_id==='none'),mapping={},main=[];
 for(const [index,[slug,name,aliases]] of MAIN_GROUPS.entries()){
  const matches=roots.filter(c=>aliases.includes(c.name.trim().toLowerCase()));let row=matches.find(c=>c.fixed_main)||matches[0];
  if(!row){let url=slug;while(state.categories.some(c=>c.slug===url))url+='-species';row={id:'species-'+slug,slug:url,seo:{},description:'',image:''};state.categories.push(row)}
  Object.assign(row,{name,parent_id:null,fixed_main:true,legacy_main:false,active:true,order:index});main.push(row.id);for(const c of matches)mapping[c.id]=row.id;
 }
 for(const c of roots)if(!main.includes(c.id))Object.assign(c,{fixed_main:false,legacy_main:true,parent_id:null});
 for(const c of state.categories)if(mapping[c.parent_id])c.parent_id=mapping[c.parent_id];
 for(const p of state.products){const old=allIds(p,'category_id','category_ids'),subs=allIds(p,'subcategory_id','subcategory_ids');const mains=[...new Set(old.map(id=>mapping[id]||id).filter(id=>main.includes(id)))],kept=subs.filter(id=>state.categories.some(c=>c.id===id&&mains.includes(c.parent_id)));Object.assign(p,{category_ids:mains,category_id:mains[0]||null,subcategory_ids:kept,subcategory_id:kept[0]||null,legacy_category_ids:[...new Set([...(p.legacy_category_ids||[]),...old.filter(id=>!main.includes(mapping[id]||id))])],legacy_subcategory_ids:[...new Set([...(p.legacy_subcategory_ids||[]),...subs.filter(id=>!kept.includes(id))])]})}
 state.species_taxonomy_v1=true;
}
export function validateDemoAssignments(body,existing,categories,ErrorType){
 if(!['category_id','category_ids','subcategory_id','subcategory_ids'].some(k=>Object.hasOwn(body,k)))return body;
 const source={...existing,...body},mains=Object.hasOwn(body,'category_ids')?body.category_ids:allIds(source,'category_id','category_ids'),subs=Object.hasOwn(body,'subcategory_ids')?body.subcategory_ids:allIds(source,'subcategory_id','subcategory_ids');
 if(!Array.isArray(mains)||!Array.isArray(subs)||![...mains,...subs].every(id=>typeof id==='string'))throw new ErrorType(400,'Category selections must be lists of IDs');
 if(mains.some(id=>!categories.some(c=>c.id===id&&c.fixed_main))||subs.some(id=>!categories.some(c=>c.id===id&&!c.fixed_main&&!c.legacy_main&&mains.includes(c.parent_id))))throw new ErrorType(400,'Choose valid main categories and their subcategories');
 return {...body,category_ids:[...new Set(mains)],category_id:mains[0]||null,subcategory_ids:[...new Set(subs)],subcategory_id:subs[0]||null};
}
