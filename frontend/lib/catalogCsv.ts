export type CatalogCsvRow = {
  artworkId?: string;
  title: string;
  description?: string;
  productUrl: string;
  imageUrl?: string;
  price?: number | null;
  currency?: string;
  storeType?: string;
  storeName?: string;
  imageStatus?: "verified" | "pending";
};

function csvCell(value: unknown) {
  const text = String(value ?? "");

  return `"${text.replace(/"/g, '""')}"`;
}

export function buildCatalogCsv(
  rows: CatalogCsvRow[]
) {
  const headers = [
    "artwork_id",
    "title",
    "description",
    "product_url",
    "image_url",
    "price",
    "currency",
    "store_type",
    "store_name",
    "image_status",
  ];

  const body = rows.map((row) =>
    [
      row.artworkId || "",
      row.title || "",
      row.description || "",
      row.productUrl || "",
      row.imageUrl || "",
      row.price ?? "",
      row.currency || "USD",
      row.storeType || "",
      row.storeName || "",
      row.imageStatus ||
        (row.imageUrl
          ? "verified"
          : "pending"),
    ]
      .map(csvCell)
      .join(",")
  );

  return [
    headers.join(","),
    ...body,
  ].join("\n");
}