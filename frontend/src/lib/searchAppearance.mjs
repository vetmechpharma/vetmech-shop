export const SITE_NAME = "VETMECH Pharmaceuticals";
export const SITE_ALTERNATE_NAMES = ["VETMECH", "VETMECH PHARMACEUTICALS PRIVATE LIMITED"];
const SAMPLE_ADDRESS = "Plot 42, Pharma Industrial Estate, Ahmedabad, Gujarat 382210, India";

export function companyAddress(address) {
  const value = String(address || "").trim();
  return value.toLowerCase() === SAMPLE_ADDRESS.toLowerCase() ? "" : value;
}

export function searchRobots(value = "index, follow") {
  if (/(?:\b(?:noindex|none|nosnippet|noimageindex)\b|max-image-preview\s*:)/i.test(value)) return value;
  return `${value}, max-image-preview:large`;
}
