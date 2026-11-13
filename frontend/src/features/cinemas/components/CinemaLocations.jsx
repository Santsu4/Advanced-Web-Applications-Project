import { useEffect, useState } from "react";
import { getCities } from "../services/cinemaService.js";

export default function CinemaLocations() {
  const [result, setResult] = useState({ status: "loading", cities: [] });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getCities({ signal: controller.signal })
      .then((cities) => {
        if (!controller.signal.aborted) setResult({ status: "ready", cities });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setResult({ status: "error", cities: [] });
      });
    return () => controller.abort();
  }, [attempt]);

  function retry() {
    setResult({ status: "loading", cities: [] });
    setAttempt((value) => value + 1);
  }

  return (
    <section
      id="cinemas"
      className="cinemas-section"
      aria-labelledby="cinemas-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Close to home</p>
          <h2 id="cinemas-title">Our cinemas</h2>
        </div>
        <p>Your next night at the movies starts here.</p>
      </div>
      {result.status === "loading" && (
        <p className="request-message" role="status">
          Finding our cinemas…
        </p>
      )}
      {result.status === "error" && (
        <div className="request-message">
          <p role="alert">We couldn’t load our cinemas. Please try again.</p>
          <button type="button" onClick={retry}>
            Try again
          </button>
        </div>
      )}
      {result.status === "ready" &&
        (result.cities.length ? (
          <ul className="cinema-list">
            {result.cities.map((city, index) => (
              <li className="cinema-card" key={city.id}>
                <span className="cinema-number" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3>{city.name}</h3>
                  <p>RIO cinema</p>
                </div>
                <span className="cinema-mark" aria-hidden="true">
                  ✳
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="request-message" role="status">
            No cinemas are listed yet.
          </p>
        ))}
    </section>
  );
}
