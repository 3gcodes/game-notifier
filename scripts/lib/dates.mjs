// Small UTC date helpers. All "day" values are ISO strings: YYYY-MM-DD.

export const isoDate = (d) => d.toISOString().slice(0, 10);

export const todayUTC = () => isoDate(new Date());

export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}
