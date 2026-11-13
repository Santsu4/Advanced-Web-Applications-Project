export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function createApiClient(baseUrl) {
  const base = baseUrl.replace(/\/+$/, "");
  return async function apiGet(path, { signal } = {}) {
    const response = await fetch(`${base}/${path.replace(/^\/+/, "")}`, {
      headers: { Accept: "application/json" },
      signal,
    });
    let body;
    try {
      body = await response.json();
    } catch (error) {
      if (error.name === "AbortError") throw error;
      throw new ApiError(
        "The cinema service returned an unexpected response.",
        response.status,
      );
    }
    if (!response.ok || body?.success !== true) {
      throw new ApiError(
        typeof body?.error === "string"
          ? body.error
          : "The cinema service could not complete the request.",
        response.status,
      );
    }
    if (!Object.hasOwn(body, "data")) {
      throw new ApiError(
        "The cinema service returned an unexpected response.",
        response.status,
      );
    }
    return body.data;
  };
}

export const apiGet = createApiClient(
  import.meta.env?.VITE_API_BASE_URL || "/api",
);
