import { getLocale } from "$lib/paraglide/runtime";

function formatKoreanDate(dateStr: string): string {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${mo}.${day}`;
}

/** Format date for list pages (short month: "Jan 15, 2026") */
export function formatDateShort(dateStr: string): string {
  if (getLocale() === "ko") return formatKoreanDate(dateStr);
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Format date for detail pages (long month: "January 15, 2026") */
export function formatDateLong(dateStr: string): string {
  if (getLocale() === "ko") return formatKoreanDate(dateStr);
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
