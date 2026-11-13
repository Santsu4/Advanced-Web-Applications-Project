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

export async function getScreens(cityId, { signal } = {}) {
  const screens = await apiGet(
    `/screens?${new URLSearchParams({ cityId: String(cityId) })}`,
    { signal },
  );
  if (
    !Array.isArray(screens) ||
    screens.some(
      (screen) =>
        !Number.isInteger(screen.id) ||
        !Number.isInteger(screen.city_id) ||
        !Number.isInteger(screen.capacity),
    )
  ) {
    throw new Error("Unexpected screen data");
  }
  return screens;
}
