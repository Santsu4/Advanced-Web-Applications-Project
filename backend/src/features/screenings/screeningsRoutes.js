import { createScreeningsRepository } from "./screeningsRepository.js";
import { createScreeningsService } from "./screeningsService.js";
import { createScreeningsController } from "./screeningsController.js";

export function registerScreeningRoutes(app, pool) {
  const repository = createScreeningsRepository(pool);
  const service = createScreeningsService(repository);
  const controller = createScreeningsController(service);
  app.get("/api/screenings", controller.listScreenings);
}
