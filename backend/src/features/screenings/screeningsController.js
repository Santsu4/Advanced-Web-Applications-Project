import { ScreeningFilterError } from "./screeningsService.js";

export function createScreeningsController(service) {
  return {
    async listScreenings(req, res) {
      try {
        const screenings = await service.listScreenings(req.query);
        res.status(200).json({ success: true, data: screenings });
      } catch (error) {
        if (error instanceof ScreeningFilterError) {
          return res.status(400).json({ success: false, error: error.message });
        }
        console.error("There was an error while fetching screenings");
        res.status(500).json({
          success: false,
          error: "There was an inside error while fetching screenings",
        });
      }
    },
  };
}
