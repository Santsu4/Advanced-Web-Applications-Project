export const initialSelection = {
  cityId: null,
  screenId: null,
  filmId: null,
  screeningId: null,
};

export function selectionReducer(state, action) {
  switch (action.type) {
    case "city":
      return action.id === state.cityId
        ? state
        : { ...initialSelection, cityId: action.id };
    case "screen":
      return action.id === state.screenId
        ? state
        : { ...state, screenId: action.id, filmId: null, screeningId: null };
    case "film":
      return action.id === state.filmId
        ? state
        : { ...state, filmId: action.id, screeningId: null };
    case "screening":
      return { ...state, screeningId: action.id };
    default:
      return state;
  }
}

export function getSelectionOptions({
  cities,
  screens,
  screenings,
  selection,
  now,
}) {
  const city = cities.find((row) => row.id === selection.cityId) ?? null;
  const availableScreens = city
    ? screens.filter((row) => row.city_id === city.id)
    : [];
  const screen =
    availableScreens.find((row) => row.id === selection.screenId) ?? null;
  const eligibleScreenings =
    city && screen
      ? screenings
          .filter(
            (row) =>
              row.city_id === city.id &&
              row.screen_id === screen.id &&
              Number.isInteger(row.film_id) &&
              row.film_id > 0 &&
              Number.isInteger(row.id) &&
              row.id > 0 &&
              Date.parse(row.screening_time) > now,
          )
          .sort(
            (a, b) =>
              Date.parse(a.screening_time) - Date.parse(b.screening_time) ||
              a.id - b.id,
          )
      : [];
  const films = [
    ...new Map(
      eligibleScreenings.map((row) => [
        row.film_id,
        { id: row.film_id, title: row.film_title },
      ]),
    ).values(),
  ].sort((a, b) => a.title.localeCompare(b.title, "en") || a.id - b.id);
  const film = films.find((row) => row.id === selection.filmId) ?? null;
  const showtimes = film
    ? eligibleScreenings.filter((row) => row.film_id === film.id)
    : [];
  const screening =
    showtimes.find((row) => row.id === selection.screeningId) ?? null;
  return {
    city,
    screens: availableScreens,
    screen,
    films,
    film,
    showtimes,
    screening,
  };
}

export function formatShowtime(value) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Helsinki",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}
