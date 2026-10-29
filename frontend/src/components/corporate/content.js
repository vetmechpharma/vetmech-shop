import { companyAddress } from "@/lib/searchAppearance.mjs";

export const CORPORATE_DEFAULTS = {
  hero: { eyebrow: "THE SCIENCE OF ANIMAL HEALTH", title: "For animals.\nFor a better\ntomorrow.", text: "Advancing animal health through purposeful science and a commitment to the lives that depend on us.", image: "/corporate/animal-care.webp" },
  intro: { eyebrow: "A SHARED PURPOSE", title: "Animal health.\nHuman commitment.", text: "Behind every healthy animal is a world of people who care. At VETMECH, we bring veterinary pharmaceuticals, product knowledge and professional partnerships together — with animal health at the centre of everything we do." },
  science: { title: "Science in focus.\nCare in practice.", text: "Thoughtful formulations. Clear product information. Close collaboration with veterinary professionals. Our approach connects the science of animal health with the realities of everyday care.", image: "/corporate/science.webp" },
};

export const SPECIES = [
  { id: "cattle", name: "Cattle & buffalo", short: "Dairy & livestock", description: "Supporting the care of the animals at the heart of our dairy communities." },
  { id: "sheep", name: "Sheep & goat", short: "Small ruminants", description: "A considered approach to the everyday needs of small ruminants." },
  { id: "poultry", name: "Poultry", short: "Flock health", description: "Product information and solutions for the world of poultry care." },
  { id: "companion", name: "Companion animals", short: "Care for companions", description: "Because the animals closest to us deserve thoughtful care." },
];

export function corporateContent(homepage) {
  return Object.fromEntries(Object.entries(CORPORATE_DEFAULTS).map(([key, value]) => [key, { ...value, ...homepage?.corporate?.[key] }]));
}

export function companyContact(company) {
  const email = company?.email && !/@example\.com$/.test(company.email) ? company.email : "info@vetmech.in";
  const address = companyAddress(company?.address);
  const displayedAddress = address && !address.includes("development demo") ? address : "Contact our team for our business address.";
  return { name: company?.name || "VETMECH PHARMACEUTICALS PRIVATE LIMITED", phone: company?.phone || "+91 99444 72488", email, address: displayedAddress, whatsapp: String(company?.whatsapp || company?.phone || "919944472488").replace(/\D/g, "") };
}
