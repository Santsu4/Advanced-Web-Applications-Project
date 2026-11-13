import { apiGet } from "../../../shared/services/apiClient.js";

export async function getScreenings(cityId, screenId, { signal } = {}) {
  const query = new URLSearchParams({
    cityId: String(cityId),
    screenId: String(screenId),
  });
  const screenings = await apiGet(`/screenings?${query}`, { signal });
  if (
    !Array.isArray(screenings) ||
    screenings.some(
      (row) =>
        !Number.isInteger(row.id) ||
        !Number.isInteger(row.city_id) ||
        !Number.isInteger(row.screen_id) ||
        !Number.isInteger(row.film_id) ||
        typeof row.film_title !== "string" ||
        !Number.isFinite(Date.parse(row.screening_time)),
    )
  )
    throw new Error("Unexpected screening data");
  return screenings;
}
