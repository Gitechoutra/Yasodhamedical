import api from "./api";

/** Counter dashboard figures for the caller's own branch. */
export async function fetchPharmacySummary() {
  const res = await api.get("/pharmacy/summary");
  return res.data.data;
}

export async function fetchBranches() {
  const res = await api.get("/pharmacy/branches");
  return res.data.data;
}

/** The catalogue, each row carrying this branch's quantity. */
export async function fetchBrands(params = {}) {
  const res = await api.get("/pharmacy/brands", { params });
  return res.data.data;
}

export async function createBrand(payload) {
  const res = await api.post("/pharmacy/brands", payload);
  return res.data.data;
}

export async function updateBrand(brandId, payload) {
  const res = await api.patch(`/pharmacy/brands/${brandId}`, payload);
  return res.data.data;
}

export async function fetchCategories() {
  const res = await api.get("/pharmacy/categories");
  return res.data.data;
}

/**
 * Returns `{ in_branch, other_branches }`. Anything this counter cannot
 * dispense is looked up across the other branches so it can be transferred in.
 */
export async function searchMedicines(q) {
  const res = await api.get("/pharmacy/search", { params: { q } });
  return res.data.data;
}

export async function fetchInventory(params = {}) {
  const res = await api.get("/pharmacy/inventory", { params });
  return res.data.data;
}

/** Receives stock. Always lands in the caller's own branch. */
export async function addStock(payload) {
  const res = await api.post("/pharmacy/stock", payload);
  return res.data.data;
}

export async function fetchLowStock() {
  const res = await api.get("/pharmacy/low-stock");
  return res.data.data;
}

export async function fetchExpiring() {
  const res = await api.get("/pharmacy/expired");
  return res.data.data;
}
