const MAX_DATABASE_ID = 2147483647;
const FILTER_NAMES = ["cityId", "screenId", "filmId"];

export class ScreeningFilterError extends Error {}

export function createScreeningsService(repository) {
  return {
    async listScreenings(query) {
      const filters = {};
      for (const name of FILTER_NAMES) {
        const value = query[name];
        const hasBracketNotation = Object.keys(query).some((key) =>
          key.startsWith(`${name}[`),
        );
        if (value === undefined && !hasBracketNotation) continue;
        if (
          hasBracketNotation ||
          typeof value !== "string" ||
          !/^\d+$/.test(value) ||
          !Number.isSafeInteger(Number(value)) ||
          Number(value) < 1 ||
          Number(value) > MAX_DATABASE_ID
        ) {
          throw new ScreeningFilterError(
            `${name} must be a positive integer between 1 and ${MAX_DATABASE_ID}`,
          );
        }
        filters[name] = Number(value);
      }
      return repository.findScreenings(filters);
    },
  };
}
