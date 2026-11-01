export function slugifyProductTitle(title: string) {
  const slug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/g, "");

  return slug || "produto";
}

export function buildProductPath(id: number, title: string) {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new RangeError("Código de produto inválido");
  }
  return `/produto/${id}/${slugifyProductTitle(title)}`;
}
