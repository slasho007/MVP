export function formatMoney(amount: string, currencyCode: string): string {
  const value = Number.parseFloat(amount);
  if (Number.isNaN(value)) return amount;
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currencyCode,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currencyCode}`;
  }
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}
