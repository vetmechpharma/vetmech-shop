export function passwordError(password = "") {
  if (typeof password !== "string" || password.trim().length < 8) return "Password must be at least 8 characters";
  if (new TextEncoder().encode(password).length > 72) return "Password must be no more than 72 UTF-8 bytes";
  return "";
}

export function safeReturnPath(value, fallback = "/shop") {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !/[\\\s]/.test(value)
    ? value : fallback;
}
