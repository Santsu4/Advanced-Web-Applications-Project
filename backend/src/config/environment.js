function readHttpOrigin(value) {
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      throw new Error();
    }
    return url.origin;
  } catch {
    throw new Error("FRONTEND_URL must be an HTTP(S) origin");
  }
}

export function readEnvironment(environment = process.env) {
  const databaseUrl = environment.DATABASE_URL;
  try {
    const url = new URL(databaseUrl);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname ||
      url.pathname.length < 2
    ) {
      throw new Error();
    }
  } catch {
    throw new Error(
      "DATABASE_URL must be a PostgreSQL connection URL with a database name",
    );
  }

  if (!environment.FRONTEND_URL) {
    throw new Error("FRONTEND_URL is required");
  }
  const portValue = environment.PORT ?? "3000";
  const port = Number(portValue);
  if (
    !/^\d+$/.test(String(portValue)) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return {
    databaseUrl,
    frontendUrl: readHttpOrigin(environment.FRONTEND_URL),
    port,
  };
}
