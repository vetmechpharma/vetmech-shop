export function companyContacts(c = {}) {
  const phones = [["Sales", c?.phone || "+91 9944472488"], ["Support", c?.support_phone || "+91 9342704047"]].map(([role, number]) => ({
    role, number, label: role + ": " + number, href: "tel:" + number.replace(/[^+\d]/g, ""),
  }));
  const emails = [c?.email || "info@vetmech.in", c?.alternate_email || "vetmechpharma@gmail.com"].map(label => ({label, href: "mailto:" + label}));
  return {phones, emails};
}
