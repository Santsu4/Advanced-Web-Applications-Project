import { useEffect, useReducer, useState } from "react";
import { useScreeningOptions } from "../hooks/useScreeningOptions.js";
import {
  formatShowtime,
  getSelectionOptions,
  initialSelection,
  selectionReducer,
} from "../utils/selection.js";

function RequestFeedback({ request, subject }) {
  const pending = request.status === "loading";
  const failed = request.status === "error";
  if (!pending && !failed && !request.hasRetried) return null;
  const message = failed
    ? `We couldn’t load ${subject}.`
    : pending
      ? `${request.hasRetried ? "Retrying" : "Loading"} ${subject}…`
      : `Updated ${subject}.`;
  return (
    <div className="field-feedback">
      <p role={failed ? "alert" : "status"}>{message}</p>
      {(failed || request.hasRetried) && (
        <button
          className="retry-button"
          type="button"
          aria-label={`${pending ? "Retrying" : failed ? "Retry" : "Refresh"} ${subject}`}
          aria-disabled={pending}
          onClick={() => {
            if (!pending) request.retry();
          }}
        >
          {pending ? "Retrying…" : failed ? "Try again" : "Refresh"}
        </button>
      )}
    </div>
  );
}

export default function ScreeningSelection() {
  const [selection, dispatch] = useReducer(selectionReducer, initialSelection);
  const [now, setNow] = useState(() => Date.now());
  const requests = useScreeningOptions(selection);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const options = getSelectionOptions({
    cities: requests.cities.data,
    screens: requests.screens.data,
    screenings: requests.screenings.data,
    selection,
    now,
  });
  function select(type, value) {
    const id = value ? Number(value) : null;
    const currentTime = Date.now();
    setNow(currentTime);
    if (
      type === "screening" &&
      id !== null &&
      !options.showtimes.some(
        (row) => row.id === id && Date.parse(row.screening_time) > currentTime,
      )
    ) {
      dispatch({ type, id: null });
      return;
    }
    dispatch({ type, id });
  }
  const hasScreenings = requests.screenings.status === "ready";
  const screeningValue = options.screening?.id ?? "";

  return (
    <section
      id="cinemas"
      className="cinemas-section"
      aria-labelledby="screening-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Your next visit</p>
          <h2 id="screening-title">Find your screening</h2>
        </div>
        <p>Choose your cinema, movie and time.</p>
      </div>
      <div className="selection-controls">
        <div className="selection-field">
          <label htmlFor="city">1. City</label>
          <select
            id="city"
            aria-busy={requests.cities.status === "loading"}
            value={selection.cityId ?? ""}
            disabled={
              requests.cities.status !== "ready" || !requests.cities.data.length
            }
            onChange={(event) => select("city", event.target.value)}
          >
            <option value="">Choose a city</option>
            {requests.cities.data.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
              </option>
            ))}
          </select>
          <RequestFeedback request={requests.cities} subject="cities" />
          {requests.cities.status === "ready" &&
            !requests.cities.data.length && (
              <p className="field-feedback" role="status">
                No cities are listed yet.
              </p>
            )}
        </div>
        <div className="selection-field">
          <label htmlFor="screen">2. Screen</label>
          <select
            id="screen"
            aria-busy={requests.screens.status === "loading"}
            value={options.screen?.id ?? ""}
            disabled={
              !options.city ||
              requests.screens.status !== "ready" ||
              !options.screens.length
            }
            onChange={(event) => select("screen", event.target.value)}
          >
            <option value="">
              {options.city ? "Choose a screen" : "Choose a city first"}
            </option>
            {options.screens.map((screen) => (
              <option key={screen.id} value={screen.id}>
                {screen.capacity}-seat screen
              </option>
            ))}
          </select>
          <RequestFeedback request={requests.screens} subject="screens" />
          {options.city &&
            requests.screens.status === "ready" &&
            !options.screens.length && (
              <p className="field-feedback" role="status">
                No screens are listed in this city.
              </p>
            )}
        </div>
        <div className="selection-field">
          <label htmlFor="film">3. Movie</label>
          <select
            id="film"
            aria-busy={requests.screenings.status === "loading"}
            value={options.film?.id ?? ""}
            disabled={
              !options.screen || !hasScreenings || !options.films.length
            }
            onChange={(event) => select("film", event.target.value)}
          >
            <option value="">
              {options.screen ? "Choose a movie" : "Choose a screen first"}
            </option>
            {options.films.map((film) => (
              <option key={film.id} value={film.id}>
                {film.title}
              </option>
            ))}
          </select>
          <RequestFeedback
            request={requests.screenings}
            subject="movies and showtimes"
          />
          {options.screen && hasScreenings && !options.films.length && (
            <p className="field-feedback" role="status">
              No upcoming screenings on this screen.
            </p>
          )}
        </div>
        <div className="selection-field">
          <label htmlFor="showtime">4. Showtime</label>
          <select
            id="showtime"
            value={screeningValue}
            disabled={!options.film || !options.showtimes.length}
            onChange={(event) => select("screening", event.target.value)}
            aria-describedby="showtime-zone"
          >
            <option value="">
              {options.film ? "Choose a showtime" : "Choose a movie first"}
            </option>
            {options.showtimes.map((screening) => (
              <option key={screening.id} value={screening.id}>
                {formatShowtime(screening.screening_time)}
              </option>
            ))}
          </select>
          <p id="showtime-zone" className="field-feedback">
            All showtimes are in Helsinki time.
          </p>
        </div>
      </div>
      <section
        className="selection-summary"
        aria-labelledby="summary-title"
        aria-live="polite"
      >
        <p className="eyebrow">Your visit</p>
        <h3 id="summary-title">Your screening</h3>
        {options.screening ? (
          <>
            <dl>
              <div>
                <dt>City</dt>
                <dd>{options.city.name}</dd>
              </div>
              <div>
                <dt>Screen</dt>
                <dd>{options.screen.capacity}-seat screen</dd>
              </div>
              <div>
                <dt>Movie</dt>
                <dd>{options.film.title}</dd>
              </div>
              <div>
                <dt>Showtime</dt>
                <dd>
                  {formatShowtime(options.screening.screening_time)}{" "}
                  <span className="timezone-label">(Helsinki time)</span>
                </dd>
              </div>
            </dl>
            <p className="selection-note">
              Screening selected. Seats have not been reserved.
            </p>
          </>
        ) : (
          <p className="selection-note">
            Choose a city, screen, movie and showtime to see your screening
            here.
          </p>
        )}
      </section>
    </section>
  );
}
