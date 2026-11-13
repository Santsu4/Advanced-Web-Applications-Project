import { apiGet } from "../../../shared/services/apiClient.js";

export async function getCities({ signal } = {}) {
  const cities = await apiGet("/cities", { signal });
  if (
    !Array.isArray(cities) ||
    cities.some(
      (city) => !Number.isInteger(city.id) || typeof city.name !== "string",
    )
  ) {
    throw new Error("Unexpected cinema data");
  }
  return cities;
}
