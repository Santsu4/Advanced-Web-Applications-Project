import { useCallback, useEffect, useState } from "react";
import { getCities, getScreens } from "../../cinemas/services/cinemaService.js";
import { getScreenings } from "../services/screeningService.js";

function useOptions(load, enabled = true) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    load({ signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted)
          setResult({ load, attempt, status: "ready", data });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setResult({ load, attempt, status: "error", data: [] });
      });
    return () => controller.abort();
  }, [load, enabled, attempt]);
  const current =
    enabled && result?.load === load && result?.attempt === attempt;
  return {
    status: !enabled ? "idle" : current ? result.status : "loading",
    data: current ? result.data : [],
    retry: () => setAttempt((value) => value + 1),
  };
}

export function useScreeningOptions({ cityId, screenId }) {
  const loadScreens = useCallback(
    (options) => getScreens(cityId, options),
    [cityId],
  );
  const loadScreenings = useCallback(
    (options) => getScreenings(cityId, screenId, options),
    [cityId, screenId],
  );
  const cities = useOptions(getCities);
  const screens = useOptions(loadScreens, cityId !== null);
  const screenings = useOptions(
    loadScreenings,
    cityId !== null && screenId !== null,
  );
  return { cities, screens, screenings };
}
