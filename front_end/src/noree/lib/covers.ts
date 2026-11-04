import cover1 from "../../assets/brand/cover-1.webp";
import cover2 from "../../assets/brand/cover-2.webp";
import cover3 from "../../assets/brand/cover-3.webp";
import cover4 from "../../assets/brand/cover-4.webp";
import cover5 from "../../assets/brand/cover-5.webp";
import cover6 from "../../assets/brand/cover-6.webp";
import cover7 from "../../assets/brand/cover-7.webp";

const COVERS = [cover1, cover2, cover3, cover4, cover5, cover6, cover7];

/** A board's picture, chosen from its id, so it's the same everywhere and never changes. */
export function coverFor(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return COVERS[Math.abs(hash) % COVERS.length];
}

export function relativeTime(timestamp: number, now = Date.now()): string {
  const minutes = Math.round((now - timestamp) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function greeting(hour = new Date().getHours()): string {
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
