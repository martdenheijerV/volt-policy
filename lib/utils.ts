export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case "draft":
      return "bg-gray-200 text-gray-800";
    case "review":
      return "bg-amber-100 text-amber-900";
    case "approved":
      return "bg-green-100 text-green-900";
    case "archived":
      return "bg-slate-200 text-slate-700";
    default:
      return "bg-gray-100 text-gray-800";
  }
}
