export function formatCurrency(value: number, showSign = false): string {
  const safe = Number.isFinite(value) ? value : 0;
  const absFormatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Math.abs(safe) >= 1000 ? 0 : 2,
    maximumFractionDigits: Math.abs(safe) >= 1000 ? 0 : 2,
  }).format(Math.abs(safe));

  if (safe < 0) return `-${absFormatted}`;
  if (showSign && safe > 0) return `+${absFormatted}`;
  return absFormatted;
}

export function formatCurrencyExact(value: number, showSign = false): string {
  const safe = Number.isFinite(value) ? value : 0;
  const absFormatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(safe));

  if (safe < 0) return `-${absFormatted}`;
  if (showSign && safe > 0) return `+${absFormatted}`;
  return absFormatted;
}

export function formatPct(value: number, showSign = true, decimals = 2): string {
  const safe = Number.isFinite(value) ? value : 0;
  const fixed = Math.abs(safe).toFixed(decimals);
  if (safe < 0) return `-${fixed}%`;
  if (showSign && safe > 0) return `+${fixed}%`;
  return `${fixed}%`;
}

export function formatRatio(value: number, decimals = 2): string {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toFixed(decimals);
}

export function formatShortDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatDateTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return (
    d.toISOString().replace("T", " ").slice(0, 16) + " UTC"
  );
}

export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "—";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = hours / 24;
  return `${days.toFixed(1)}d`;
}

export function formatPrice(price: number): string {
  if (!Number.isFinite(price) || price === 0) return "—";
  if (Math.abs(price) < 10) return price.toFixed(4);
  if (Math.abs(price) < 1000) return price.toFixed(2);
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}
