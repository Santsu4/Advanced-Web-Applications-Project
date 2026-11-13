import {
  CITY_NAMES,
  SCREEN_CAPACITIES,
  DEMO_FILMS,
} from "../../../database/seeds/browsing.js";
import {
  assertIsolatedDevelopment,
  assertConnectedLocalTarget,
  createClient,
  DatabaseCommandError,
} from "./connection.js";

export async function seedBrowsing({ databaseUrl, mode }) {
  const database = assertIsolatedDevelopment(databaseUrl, mode);
  const client = createClient(databaseUrl);
  try {
    await client.connect();
    await assertConnectedLocalTarget(client, database);
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SET LOCAL search_path = public, pg_catalog");
    await client.query("SET LOCAL TIME ZONE 'Europe/Helsinki'");
    await client.query("SELECT pg_advisory_xact_lock(7420839)");
    const ledger = (
      await client.query(
        "SELECT to_regclass('public.rio_schema_migrations') AS name",
      )
    ).rows[0].name;
    if (
      !ledger ||
      !(
        await client.query(
          "SELECT 1 FROM public.rio_schema_migrations WHERE name = '0001_initial_schema.sql'",
        )
      ).rowCount
    ) {
      throw new DatabaseCommandError(
        "Apply db:migrate:dev before installing browsing fixtures",
      );
    }
    const clock = (
      await client.query(`
      SELECT to_char(localtimestamp, 'YYYY-MM-DD"T"HH24:MI:SS') AS local_now,
             to_char(current_date + 1, 'YYYY-MM-DD') AS tomorrow
    `)
    ).rows[0];
    const films = [];
    for (const demo of DEMO_FILMS) {
      let matches = (
        await client.query(
          "SELECT id, title FROM public.films WHERE metadata_api_id = $1 ORDER BY id",
          [demo.key],
        )
      ).rows;
      if (matches.length > 1)
        throw new DatabaseCommandError(
          "Duplicate demo film markers; inspect films before seeding",
        );
      if (!matches.length) {
        matches = (
          await client.query(
            "INSERT INTO public.films (title, metadata_api_id, description) VALUES ($1, $2, $3) RETURNING id, title",
            [
              demo.title,
              demo.key,
              "Synthetic RIO browsing fixture; not a real cinema listing.",
            ],
          )
        ).rows;
      }
      films.push({ ...matches[0], hour: demo.hour });
    }
    const cities = [];
    for (const name of CITY_NAMES) {
      await client.query(
        "INSERT INTO public.cities (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
        [name],
      );
      const city = (
        await client.query(
          "SELECT id, name FROM public.cities WHERE name = $1",
          [name],
        )
      ).rows[0];
      const screens = [];
      for (const capacity of SCREEN_CAPACITIES) {
        let matches = (
          await client.query(
            "SELECT id, capacity, wheelchair_capacity FROM public.screens WHERE city_id = $1 AND capacity = $2 ORDER BY id",
            [city.id, capacity],
          )
        ).rows;
        if (matches.length > 1)
          throw new DatabaseCommandError(
            "Ambiguous city/capacity screen inventory; inspect screens before seeding",
          );
        if (!matches.length) {
          matches = (
            await client.query(
              "INSERT INTO public.screens (city_id, capacity, wheelchair_capacity) VALUES ($1, $2, 10) RETURNING id, capacity, wheelchair_capacity",
              [city.id, capacity],
            )
          ).rows;
        }
        const screen = matches[0];
        if (screen.wheelchair_capacity !== 10)
          throw new DatabaseCommandError(
            "Existing screen wheelchair capacity differs from the fixture requirement; no inventory was changed",
          );
        const screenings = [];
        for (const film of films) {
          let shows = (
            await client.query(
              `
            SELECT id, to_char(screening_time, 'YYYY-MM-DD"T"HH24:MI:SS') AS screening_time
            FROM public.screenings WHERE screen_id = $1 AND film_id = $2 AND screening_time > $3::timestamp
            ORDER BY screening_time, id LIMIT 1
          `,
              [screen.id, film.id, clock.local_now],
            )
          ).rows;
          if (!shows.length) {
            const localTime = `${clock.tomorrow}T${film.hour}:00:00`;
            shows = (
              await client.query(
                `
              INSERT INTO public.screenings (film_id, screen_id, screening_time) VALUES ($1, $2, $3::timestamp)
              RETURNING id, to_char(screening_time, 'YYYY-MM-DD"T"HH24:MI:SS') AS screening_time
            `,
                [film.id, screen.id, localTime],
              )
            ).rows;
          }
          screenings.push({
            ...shows[0],
            film_id: film.id,
            film_title: film.title,
          });
        }
        screens.push({ ...screen, screenings });
      }
      cities.push({ ...city, screens });
    }
    await client.query("COMMIT");
    return { timezone: "Europe/Helsinki", cities };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}
