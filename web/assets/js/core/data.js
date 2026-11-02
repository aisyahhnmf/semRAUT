let cache = null;

export async function loadRoles() {
  if (!cache) {
    const root = document.body.dataset.root || "";
    const res = await fetch(`${root}data/roles.json`);
    if (!res.ok) throw new Error("data/roles.json tidak ditemukan");
    cache = (await res.json()).posisi;
  }
  return cache;
}

export const findRole = async (id) => (await loadRoles()).find((r) => r.id === id);