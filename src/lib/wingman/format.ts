export function formatUsd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value >= 10_000_000 ? 1 : 2)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value.toFixed(2)}`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

export function formatPct(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

export function shortenAddress(address: string, lead = 4, tail = 4): string {
  if (address.length <= lead + tail + 3) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function tokenAge(iso: string, now: Date = new Date()): string {
  const ms = now.getTime() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function relativeTime(iso: string, now: Date = new Date()): string {
  const mins = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
