import test from "node:test";
import assert from "node:assert/strict";
import {
  formatShowtime,
  getSelectionOptions,
  initialSelection,
  selectionReducer,
} from "../src/features/screenings/utils/selection.js";

const now = Date.parse("2030-01-01T12:00:00Z");
const cities = [
  { id: 4, name: "Oulu" },
  { id: 8, name: "Tampere" },
];
const screens = [
  { id: 11, city_id: 4, capacity: 100 },
  { id: 12, city_id: 4, capacity: 200 },
  { id: 21, city_id: 8, capacity: 100 },
  { id: 22, city_id: 8, capacity: 200 },
];
const screenings = screens.flatMap((screen, index) => [
  {
    id: 101 + index * 2,
    city_id: screen.city_id,
    screen_id: screen.id,
    film_id: 31,
    film_title: "Northern Lights",
    screening_time: "2030-01-02T16:00:00Z",
  },
  {
    id: 102 + index * 2,
    city_id: screen.city_id,
    screen_id: screen.id,
    film_id: 32,
    film_title: "Lake Stories",
    screening_time: "2030-01-02T18:00:00Z",
  },
]);
function options(selection, data = screenings, clock = now) {
  return getSelectionOptions({
    cities,
    screens,
    screenings: data,
    selection,
    now: clock,
  });
}
const complete = { cityId: 4, screenId: 11, filmId: 31, screeningId: 101 };

test("the flow starts without selected or eligible dependent options", () => {
  const result = options(initialSelection);
  assert.equal(result.city, null);
  assert.deepEqual(result.screens, []);
  assert.deepEqual(result.films, []);
  assert.deepEqual(result.showtimes, []);
  assert.equal(result.screening, null);
});

test("a valid screening can be selected in both cities and both capacities", () => {
  for (const city of cities) {
    for (const screen of screens.filter((row) => row.city_id === city.id)) {
      for (const show of screenings.filter(
        (row) => row.screen_id === screen.id,
      )) {
        let state = selectionReducer(initialSelection, {
          type: "city",
          id: city.id,
        });
        state = selectionReducer(state, { type: "screen", id: screen.id });
        state = selectionReducer(state, { type: "film", id: show.film_id });
        state = selectionReducer(state, { type: "screening", id: show.id });
        const result = options(state);
        assert.equal(result.city.id, city.id);
        assert.equal(result.screen.id, screen.id);
        assert.equal(result.film.id, show.film_id);
        assert.equal(result.screening.id, show.id);
      }
    }
  }
});

test("changing city clears screen, film and showtime", () => {
  assert.deepEqual(selectionReducer(complete, { type: "city", id: 8 }), {
    cityId: 8,
    screenId: null,
    filmId: null,
    screeningId: null,
  });
});
test("changing screen retains the city and clears film and showtime", () => {
  assert.deepEqual(selectionReducer(complete, { type: "screen", id: 12 }), {
    cityId: 4,
    screenId: 12,
    filmId: null,
    screeningId: null,
  });
});
test("changing movie retains city/screen and clears the showtime", () => {
  assert.deepEqual(selectionReducer(complete, { type: "film", id: 32 }), {
    cityId: 4,
    screenId: 11,
    filmId: 32,
    screeningId: null,
  });
});
test("choosing the same parent does not discard a valid screening", () => {
  for (const [type, id] of [
    ["city", 4],
    ["screen", 11],
    ["film", 31],
  ]) {
    assert.equal(selectionReducer(complete, { type, id }), complete);
  }
});
test("clearing a city clears the complete selection", () => {
  assert.deepEqual(
    selectionReducer(complete, { type: "city", id: null }),
    initialSelection,
  );
});

test("eligible films are derived only from future screenings for the selected city/screen", () => {
  const data = [
    ...screenings,
    {
      ...screenings[0],
      id: 999,
      film_id: 99,
      film_title: "Past film",
      screening_time: "2029-01-01T00:00:00Z",
    },
    {
      ...screenings[0],
      id: 998,
      film_id: 98,
      film_title: "Invalid time",
      screening_time: "invalid",
    },
    {
      ...screenings[0],
      id: 997,
      film_id: 97,
      film_title: "Other screen",
      screen_id: 12,
    },
    {
      ...screenings[0],
      id: 996,
      film_id: 96,
      film_title: "Other city",
      city_id: 8,
    },
  ];
  const result = options(complete, data);
  assert.deepEqual(
    result.screens.map((row) => row.id),
    [11, 12],
  );
  assert.deepEqual(
    result.films.map((row) => row.id),
    [32, 31],
  );
  assert.deepEqual(
    result.showtimes.map((row) => row.id),
    [101],
  );
});

test("films deduplicate by ID rather than title, and showtimes sort chronologically", () => {
  const first = { ...screenings[0], film_title: "Same title" };
  const second = { ...screenings[1], film_title: "Same title" };
  const later = { ...first, id: 300, screening_time: "2030-01-03T16:00:00Z" };
  const earlier = { ...first, id: 200, screening_time: "2030-01-02T14:00:00Z" };
  const result = options(complete, [later, second, first, earlier]);
  assert.deepEqual(
    result.films.map((row) => row.id),
    [31, 32],
  );
  assert.deepEqual(
    result.showtimes.map((row) => row.id),
    [200, 101, 300],
  );
});

test("incompatible or expired selections never produce a completed summary", () => {
  for (const selection of [
    { ...complete, cityId: 8 },
    { ...complete, screenId: 12 },
    { ...complete, filmId: 32 },
    { ...complete, screeningId: 105 },
  ])
    assert.equal(options(selection).screening, null);
  assert.equal(
    options(complete, screenings, Date.parse("2030-01-02T16:00:00Z")).screening,
    null,
  );
  assert.deepEqual(options(complete, [], now).films, []);
});

test("revisiting a city cannot restore a previous completed selection", () => {
  const changed = selectionReducer(complete, { type: "city", id: 8 });
  const returned = selectionReducer(changed, { type: "city", id: 4 });
  assert.equal(options(returned).screening, null);
  assert.equal(returned.screenId, null);
});

test("showtime formatting uses Helsinki winter/summer time instead of machine timezone", () => {
  assert.match(formatShowtime("2030-01-15T16:00:00Z"), /18:00/);
  assert.match(formatShowtime("2030-07-15T15:00:00Z"), /18:00/);
  assert.match(formatShowtime("2030-01-01T23:30:00Z"), /2 Jan 2030/);
});
