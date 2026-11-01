export function buildProductPath(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new RangeError("Código de produto inválido");
  }
  return `/produto/${id}/`;
}
