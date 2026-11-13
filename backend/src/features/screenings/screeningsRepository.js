export function createScreeningsRepository(pool) {
  return {
    async findScreenings({ filmId, cityId, screenId }) {
      const conditions = [];
      const parameters = [];
      for (const [column, value] of [
        ["screenings.film_id", filmId],
        ["screens.city_id", cityId],
        ["screenings.screen_id", screenId],
      ]) {
        if (value !== undefined) {
          parameters.push(value);
          conditions.push(`${column} = $${parameters.length}`);
        }
      }
      const result = await pool.query(
        `
        SELECT screenings.id,
               screenings.screening_time,
               screenings.film_id,
               films.title AS film_title,
               screens.id AS screen_id,
               screens.city_id,
               cities.name AS city_name
        FROM screenings
        JOIN films ON screenings.film_id = films.id
        JOIN screens ON screenings.screen_id = screens.id
        JOIN cities ON screens.city_id = cities.id
        ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
        ORDER BY screenings.screening_time ASC, screenings.id ASC
      `,
        parameters,
      );
      return result.rows;
    },
  };
}
