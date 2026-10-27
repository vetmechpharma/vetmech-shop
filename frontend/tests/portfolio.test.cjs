const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const priced = { id:"p1",name:"VETMECH Product",slug:"vetmech-product",composition:"Composition 100 mg/ml",short_description:"Veterinary formulation",image:"/product.png",product_code:"VM1",
  benefits:"Legacy benefits",precautions:"Legacy precautions",storage:"Legacy storage",additional_info:"Legacy additional information",
  brochure_url:"/old-brochure.pdf",visual_aid_url:"/old-visual-aid.pdf",pdf_url:"/old-literature.pdf",
  mrp:987654.32,selling_price:876543.21,your_price:765432.10,badges:{offer:true},category:{name:"Large Animal",slug:"large-animal",price:9999},
  variants:[{id:"v1",pack_size:"100 ml",sku:"VM-100",mrp:987654.32,your_price:765432.10,selling_price:876543.21,active_schemes:[{special_price:1234}]}],
  seo:{title:"Veterinary product",meta_description:"Composition information",faqs:[{q:"Packing?",a:"100 ml"}],offers:{price:1234}} };

test("corporate product projection omits commercial data even when the API returns signed-in prices",async()=>{
  const { portfolioProduct } = await import("../src/lib/portfolio.mjs");
  const result = portfolioProduct(priced), serialized=JSON.stringify(result);
  for(const value of ["mrp","selling_price","your_price","active_schemes","special_price","987654.32","765432.1","offers","product_code","sku","benefits","precautions","storage","additional_info","VM1","VM-100","brochure_url","visual_aid_url","pdf_url",".pdf"]){assert.equal(serialized.includes(value),false,value);}
  assert.equal(result.variants[0].pack_size,"100 ml");
  assert.equal(result.composition,"Composition 100 mg/ml");
  assert.deepEqual(portfolioProduct({seo:{seo_content:"Approved information",robots:"noindex, follow"}}).seo,
    {seo_content:"Approved information",robots:"noindex, follow"});
  assert.equal(priced.variants[0].mrp,987654.32);
});

test("public product structured data contains product information without offers or prices",async()=>{
  const { portfolioJsonLd } = await import("../src/lib/portfolio.mjs");
  const result=portfolioJsonLd(priced,"https://example.com/products/vetmech-product","/product.png");
  assert.equal(result.name,priced.name);
  assert.equal(result.url,"https://example.com/products/vetmech-product");
  assert.equal("offers" in result,false);
  assert.equal("sku" in result,false);
  assert.equal(JSON.stringify(result).includes("987654.32"),false);
});

test("corporate related products stay limited to four and omit commercial data",async()=>{
  const { portfolioProduct } = await import("../src/lib/portfolio.mjs");
  const result = portfolioProduct({ ...priced, related: [priced, ...Array.from({length:8},(_,i)=>({ ...priced,id:`related-${i}`,slug:`related-${i}` }))] });
  assert.equal(result.related.length,4);
  assert.equal(new Set(result.related.map(p=>p.id)).size,4);
  for(const value of ["mrp","selling_price","your_price","active_schemes","product_code","sku","987654.32"]){assert.equal(JSON.stringify(result.related).includes(value),false,value);}
  assert.equal(result.related[0].variants[0].pack_size,"100 ml");
});

test("a rendered portfolio card never shows MRP, currency, offers or cart actions",async()=>{
  const model=await import("../src/lib/portfolio.mjs");
  const compiled=babel.transformSync(fs.readFileSync(path.join(__dirname,"../src/components/corporate/PortfolioCard.jsx"),"utf8"),{babelrc:false,configFile:false,presets:[["@babel/preset-react",{runtime:"classic"}]],plugins:["@babel/plugin-transform-modules-commonjs"]}).code;
  const exports={};
  const context={exports,require:(name)=>{
    if(name==="react")return React;
    if(name==="react-router-dom")return {Link:({to,children,...props})=>React.createElement("a",{href:to,...props},children)};
    if(name==="lucide-react")return {ArrowUpRight:()=>null,Package:()=>null};
    if(name==="@/lib/api")return {mediaUrl:value=>value};
    if(name==="@/lib/portfolio.mjs")return model;
    throw new Error(`Unexpected dependency ${name}`);
  }};
  vm.runInNewContext(compiled,context);
  const html=renderToStaticMarkup(React.createElement(exports.default,{product:priced}));
  for(const value of ["MRP","₹","987654.32","765432.1","Add to Cart","Your Price"]){assert.equal(html.includes(value),false,value);}
  assert.ok(html.includes("100 ml"));
  assert.ok(html.includes('href="/products/vetmech-product"'));
});

test("portfolio text keeps composition units and removes executable HTML",async()=>{
  const { portfolioText }=await import("../src/lib/portfolio.mjs");
  assert.equal(portfolioText('<script>alert(1)</script><p>100 mg/ml &amp; 25 mcg/ml</p>'),"100 mg/ml & 25 mcg/ml");
});

test("species links resolve to existing category slugs without inventing a category",async()=>{
  const { speciesCategory }=await import("../src/lib/portfolio.mjs");
  const categories=[{name:"Large Animal",slug:"large-animal"},{name:"Poultry",slug:"poultry"}];
  assert.equal(speciesCategory("cattle",categories),"large-animal");
  assert.equal(speciesCategory("poultry",categories),"poultry");
  assert.equal(speciesCategory("companion",categories),null);
});
