import { StrictMode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ScreeningSelection from "../src/features/screenings/components/ScreeningSelection.jsx";

const nextShowtime = Date.now() + 86400000;
const cities = [
  { id: 1, name: "Oulu" },
  { id: 2, name: "Tampere" },
];
const screens = [
  { id: 11, city_id: 1, capacity: 100 },
  { id: 12, city_id: 1, capacity: 200 },
  { id: 21, city_id: 2, capacity: 100 },
  { id: 22, city_id: 2, capacity: 200 },
];
function shows(screenId) {
  const cityId = screens.find((row) => row.id === screenId).city_id;
  return [
    {
      id: screenId * 10 + 1,
      city_id: cityId,
      screen_id: screenId,
      film_id: 31,
      film_title: "Northern Lights",
      screening_time: new Date(nextShowtime).toISOString(),
    },
    {
      id: screenId * 10 + 2,
      city_id: cityId,
      screen_id: screenId,
      film_id: 32,
      film_title: "Lake Stories",
      screening_time: new Date(nextShowtime + 7200000).toISOString(),
    },
  ];
}
function response(data, status = 200, error) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () =>
      error ? { success: false, error } : { success: true, data },
  };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function installApi(overrides = {}) {
  const mock = vi.fn(async (input, options) => {
    const url = new URL(input, "http://localhost");
    if (url.pathname === "/api/cities")
      return overrides.cities ? overrides.cities(options) : response(cities);
    if (url.pathname === "/api/screens") {
      const cityId = Number(url.searchParams.get("cityId"));
      return overrides.screens
        ? overrides.screens(cityId, options)
        : response(screens.filter((row) => row.city_id === cityId));
    }
    if (url.pathname === "/api/screenings") {
      const screenId = Number(url.searchParams.get("screenId"));
      return overrides.screenings
        ? overrides.screenings(screenId, options)
        : response(shows(screenId));
    }
    throw new Error(`Unexpected test request: ${url.pathname}`);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}
const field = (label) => screen.getByLabelText(label, { exact: true });
async function chooseCity(user, id = 1) {
  await screen.findByRole("option", { name: "Oulu" });
  await user.selectOptions(field("1. City"), String(id));
}
async function chooseScreen(user, id = 11) {
  await waitFor(() => expect(field("2. Screen").disabled).toBe(false));
  await user.selectOptions(field("2. Screen"), String(id));
}
async function chooseFilm(user, id = 31) {
  await waitFor(() => expect(field("3. Movie").disabled).toBe(false));
  await user.selectOptions(field("3. Movie"), String(id));
}
async function chooseTime(user, id = 111) {
  await user.selectOptions(field("4. Showtime"), String(id));
}
function summary() {
  return document.querySelector(".selection-summary");
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("a pending city request announces loading and disables all dependent controls", () => {
  const slow = deferred();
  installApi({ cities: () => slow.promise });
  render(<ScreeningSelection />);
  expect(screen.getByRole("status").textContent).toContain("Loading cities");
  for (const label of ["1. City", "2. Screen", "3. Movie", "4. Showtime"])
    expect(field(label).disabled).toBe(true);
  expect(field("1. City").getAttribute("aria-busy")).toBe("true");
  expect(summary().querySelector("dl")).toBe(null);
});

test("pending screen and screening requests keep their dependents disabled", async () => {
  const cityScreens = deferred();
  const screenShows = deferred();
  installApi({
    screens: () => cityScreens.promise,
    screenings: () => screenShows.promise,
  });
  const user = userEvent.setup();
  render(<ScreeningSelection />);
  await chooseCity(user);
  expect(screen.getByRole("status").textContent).toContain("Loading screens");
  expect(field("1. City").disabled).toBe(false);
  expect(field("2. Screen").disabled).toBe(true);
  expect(field("3. Movie").disabled).toBe(true);
  await act(async () =>
    cityScreens.resolve(response(screens.filter((row) => row.city_id === 1))),
  );
  await chooseScreen(user);
  expect(screen.getByRole("status").textContent).toContain(
    "Loading movies and showtimes",
  );
  expect(field("2. Screen").disabled).toBe(false);
  expect(field("3. Movie").disabled).toBe(true);
  expect(field("4. Showtime").disabled).toBe(true);
});

test.each(["empty array", "documented 404"])(
  "empty cities (%s) are distinct from failure",
  async (kind) => {
    installApi({
      cities: () =>
        kind === "empty array"
          ? response([])
          : response(null, 404, "No cities found"),
    });
    render(<ScreeningSelection />);
    expect(
      (await screen.findByText("No cities are listed yet.")).textContent,
    ).toContain("No cities are listed yet");
    expect(screen.queryByRole("alert")).toBe(null);
    expect(screen.queryByRole("button", { name: "Retry cities" })).toBe(null);
    expect(field("1. City").disabled).toBe(true);
  },
);

test("an unrelated 404 remains a failure with retry", async () => {
  installApi({ cities: () => response(null, 404, "Route not found") });
  render(<ScreeningSelection />);
  expect((await screen.findByRole("alert")).textContent).toContain(
    "We couldn’t load cities",
  );
  expect(screen.getByRole("button", { name: "Retry cities" })).toBeTruthy();
  expect(screen.queryByText("No cities are listed yet.")).toBe(null);
});

test("empty screens keep the city choice and offer a usable empty message", async () => {
  installApi({ screens: () => response([]) });
  const user = userEvent.setup();
  render(<ScreeningSelection />);
  await chooseCity(user);
  expect(
    (await screen.findByText("No screens are listed in this city."))
      .textContent,
  ).toBeTruthy();
  expect(field("1. City").value).toBe("1");
  expect(field("2. Screen").disabled).toBe(true);
  expect(screen.queryByRole("alert")).toBe(null);
});

test.each(["empty", "past-only"])(
  "%s screenings show no upcoming movies instead of an error",
  async (kind) => {
    installApi({
      screenings: () =>
        response(
          kind === "empty"
            ? []
            : shows(11).map((row) => ({
                ...row,
                screening_time: "2020-01-01T00:00:00Z",
              })),
        ),
    });
    const user = userEvent.setup();
    render(<ScreeningSelection />);
    await chooseCity(user);
    await chooseScreen(user);
    await screen.findByText("No upcoming screenings on this screen.");
    expect(field("3. Movie").disabled).toBe(true);
    expect(field("4. Showtime").disabled).toBe(true);
    expect(screen.queryByRole("alert")).toBe(null);
  },
);

test("screen retry preserves focus, blocks duplicate retry and does not select a screen", async () => {
  const retry = deferred();
  let count = 0;
  const fetch = installApi({
    screens: () =>
      ++count === 1 ? response(null, 500, "Unavailable") : retry.promise,
  });
  const user = userEvent.setup();
  render(<ScreeningSelection />);
  await chooseCity(user);
  const button = await screen.findByRole("button", { name: "Retry screens" });
  await user.click(button);
  expect(document.activeElement).toBe(button);
  expect(button.getAttribute("aria-disabled")).toBe("true");
  expect(button.textContent).toContain("Retrying");
  expect(field("2. Screen").disabled).toBe(true);
  await user.click(button);
  expect(
    fetch.mock.calls.filter(([path]) => path.startsWith("/api/screens?"))
      .length,
  ).toBe(2);
  await act(async () =>
    retry.resolve(response(screens.filter((row) => row.city_id === 1))),
  );
  await waitFor(() => expect(field("2. Screen").disabled).toBe(false));
  expect(field("1. City").value).toBe("1");
  expect(field("2. Screen").value).toBe("");
  expect(field("3. Movie").value).toBe("");
  expect(summary().querySelector("dl")).toBe(null);
  expect(document.activeElement).toBe(button);
  expect(button).toBe(screen.getByRole("button", { name: "Refresh screens" }));
  await user.tab({ shift: true });
  expect(document.activeElement).toBe(field("2. Screen"));
});

test("failed movie reads retry without silently choosing a replacement film/showtime", async () => {
  let count = 0;
  installApi({
    screenings: () =>
      ++count === 1
        ? response(null, 500, "Unavailable")
        : response([shows(11)[1]]),
  });
  const user = userEvent.setup();
  render(<ScreeningSelection />);
  await chooseCity(user);
  await chooseScreen(user);
  await user.click(
    await screen.findByRole("button", { name: "Retry movies and showtimes" }),
  );
  await waitFor(() => expect(field("3. Movie").disabled).toBe(false));
  expect(field("2. Screen").value).toBe("11");
  expect(field("3. Movie").value).toBe("");
  expect(field("4. Showtime").value).toBe("");
  expect(summary().querySelector("dl")).toBe(null);
});

test("a slow old city response arriving after the current response cannot replace the chosen screening", async () => {
  const old = deferred();
  let oldSignal;
  installApi({
    screens: (cityId, options) => {
      if (cityId === 1) {
        oldSignal = options.signal;
        return old.promise;
      }
      return response(screens.filter((row) => row.city_id === cityId));
    },
  });
  const user = userEvent.setup();
  render(<ScreeningSelection />);
  await chooseCity(user, 1);
  await user.selectOptions(field("1. City"), "2");
  await chooseScreen(user, 21);
  await chooseFilm(user);
  await chooseTime(user, 211);
  const before = summary().textContent;
  expect(oldSignal.aborted).toBe(true);
  // Deliberately ignore AbortSignal in the transport and resolve it late.
  await act(async () =>
    old.resolve(response(screens.filter((row) => row.city_id === 1))),
  );
  expect(field("1. City").value).toBe("2");
  expect(field("2. Screen").value).toBe("21");
  expect(field("4. Showtime").value).toBe("211");
  expect(summary().textContent).toBe(before);
  expect(
    Array.from(field("2. Screen").options).map((row) => row.value),
  ).toEqual(["", "21", "22"]);
});

test("a slow old screen response cannot overwrite the newer movie/showtime selection", async () => {
  const old = deferred();
  let oldSignal;
  installApi({
    screenings: (screenId, options) => {
      if (screenId === 11) {
        oldSignal = options.signal;
        return old.promise;
      }
      return response(shows(screenId));
    },
  });
  const user = userEvent.setup();
  render(<ScreeningSelection />);
  await chooseCity(user);
  await chooseScreen(user, 11);
  await user.selectOptions(field("2. Screen"), "12");
  await chooseFilm(user, 32);
  await chooseTime(user, 122);
  const before = summary().textContent;
  expect(oldSignal.aborted).toBe(true);
  await act(async () => old.resolve(response(shows(11))));
  expect(field("2. Screen").value).toBe("12");
  expect(field("3. Movie").value).toBe("32");
  expect(field("4. Showtime").value).toBe("122");
  expect(summary().textContent).toBe(before);
});

test("a stale failure cannot replace the current city's successful options", async () => {
  const old = deferred();
  installApi({
    screens: (cityId) =>
      cityId === 1
        ? old.promise
        : response(screens.filter((row) => row.city_id === cityId)),
  });
  const user = userEvent.setup();
  render(<ScreeningSelection />);
  await chooseCity(user);
  await user.selectOptions(field("1. City"), "2");
  await chooseScreen(user, 21);
  await act(async () => old.reject(new Error("Late old failure")));
  expect(screen.queryByRole("alert")).toBe(null);
  expect(field("2. Screen").value).toBe("21");
});

test("upstream changes clear dependent state and keep focus on the changed control", async () => {
  installApi();
  const user = userEvent.setup();
  render(<ScreeningSelection />);
  await chooseCity(user);
  await chooseScreen(user);
  await chooseFilm(user);
  await chooseTime(user);
  await user.selectOptions(field("3. Movie"), "32");
  expect(field("4. Showtime").value).toBe("");
  expect(document.activeElement).toBe(field("3. Movie"));
  await chooseTime(user, 112);
  await user.selectOptions(field("2. Screen"), "12");
  expect(field("3. Movie").value).toBe("");
  expect(field("4. Showtime").value).toBe("");
  expect(document.activeElement).toBe(field("2. Screen"));
  await chooseFilm(user);
  await chooseTime(user, 121);
  await user.selectOptions(field("1. City"), "2");
  expect(field("2. Screen").value).toBe("");
  expect(field("3. Movie").value).toBe("");
  expect(field("4. Showtime").value).toBe("");
  expect(summary().querySelector("dl")).toBe(null);
  expect(document.activeElement).toBe(field("1. City"));
});

test("unmount aborts an outstanding request and ignores its later completion", async () => {
  const old = deferred();
  let signal;
  installApi({
    cities: (options) => {
      signal = options.signal;
      return old.promise;
    },
  });
  const result = render(<ScreeningSelection />);
  result.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => old.resolve(response(cities)));
  expect(document.querySelector("#city")).toBe(null);
});

test("StrictMode's discarded city request cannot replace the current successful request", async () => {
  const old = deferred();
  let count = 0;
  let oldSignal;
  installApi({
    cities: (options) => {
      if (++count === 1) {
        oldSignal = options.signal;
        return old.promise;
      }
      return response(cities);
    },
  });
  render(
    <StrictMode>
      <ScreeningSelection />
    </StrictMode>,
  );
  await screen.findByRole("option", { name: "Oulu" });
  expect(oldSignal.aborted).toBe(true);
  await act(async () => old.resolve(response([])));
  expect(field("1. City").disabled).toBe(false);
  expect(screen.queryByText("No cities are listed yet.")).toBe(null);
});

test("a failed retry remains focused and can be retried again", async () => {
  let count = 0;
  installApi({
    cities: () =>
      ++count < 3 ? response(null, 500, "Unavailable") : response(cities),
  });
  const user = userEvent.setup();
  render(<ScreeningSelection />);
  const button = await screen.findByRole("button", { name: "Retry cities" });
  await user.click(button);
  await waitFor(() => expect(count).toBe(2));
  await waitFor(() =>
    expect(button.getAttribute("aria-disabled")).toBe("false"),
  );
  expect(document.activeElement).toBe(button);
  expect(screen.getByRole("alert").textContent).toContain(
    "We couldn’t load cities",
  );
  await user.click(button);
  await waitFor(() => expect(field("1. City").disabled).toBe(false));
  expect(field("1. City").value).toBe("");
  expect(document.activeElement).toBe(button);
});

test("refresh failure and retry cannot silently replace a previously selected screening", async () => {
  let count = 0;
  installApi({
    screenings: () => {
      count += 1;
      if (count === 1 || count === 3) return response(null, 500, "Unavailable");
      return response(count === 2 ? shows(11) : [shows(11)[1]]);
    },
  });
  const user = userEvent.setup();
  render(<ScreeningSelection />);
  await chooseCity(user);
  await chooseScreen(user);
  await user.click(
    await screen.findByRole("button", { name: "Retry movies and showtimes" }),
  );
  await chooseFilm(user);
  await chooseTime(user);
  expect(summary().querySelector("dl")).not.toBe(null);
  await user.click(
    screen.getByRole("button", { name: "Refresh movies and showtimes" }),
  );
  await screen.findByRole("alert");
  expect(summary().querySelector("dl")).toBe(null);
  await user.click(
    screen.getByRole("button", { name: "Retry movies and showtimes" }),
  );
  await waitFor(() => expect(field("3. Movie").disabled).toBe(false));
  expect(field("3. Movie").value).toBe("");
  expect(field("4. Showtime").value).toBe("");
  expect(summary().querySelector("dl")).toBe(null);
});

test("a fresh city request does not inherit the previous city's retry state", async () => {
  const nextCity = deferred();
  let count = 0;
  installApi({
    screens: (cityId) => {
      if (cityId === 2) return nextCity.promise;
      return ++count === 1
        ? response(null, 500, "Unavailable")
        : response(screens.filter((row) => row.city_id === 1));
    },
  });
  const user = userEvent.setup();
  render(<ScreeningSelection />);
  await chooseCity(user);
  await user.click(
    await screen.findByRole("button", { name: "Retry screens" }),
  );
  await screen.findByRole("button", { name: "Refresh screens" });
  await user.selectOptions(field("1. City"), "2");
  expect(screen.getByRole("status").textContent).toContain("Loading screens");
  expect(screen.queryByRole("button", { name: "Retrying screens" })).toBe(null);
  expect(screen.queryByRole("button", { name: "Refresh screens" })).toBe(null);
  await act(async () =>
    nextCity.resolve(response(screens.filter((row) => row.city_id === 2))),
  );
  await waitFor(() => expect(field("2. Screen").disabled).toBe(false));
  expect(field("2. Screen").value).toBe("");
  expect(screen.queryByRole("button", { name: "Refresh screens" })).toBe(null);
});
