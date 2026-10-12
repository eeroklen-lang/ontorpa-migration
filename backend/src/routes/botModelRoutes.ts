import express from "express";
import BotModelController from "../controllers/BotModelController";

const router: express.Router = express.Router();

/**
 * Get all BotModels
 */
router.get("/", BotModelController.getBotModels);

/**
 * Import a UiPath project as a new BotModel. Body: { files: { path: content }, name? }
 */
router.post("/import/uipath", BotModelController.importUiPath);

/**
 * Get the migration report of a BotModel. Query: target=pad (default) or none
 */
router.get("/:BotModelId/migrationReport", BotModelController.getMigrationReport);

/**
 * Get a BotModel
 */
router.get("/:BotModelId", BotModelController.getBotModel);

/**
 * Create a new BotModel
 */
router.post("/", BotModelController.createBotModel);

/**
 * Update a BotModel
 */
router.patch("/:BotModelId", BotModelController.updateBotModel);

/**
 * Delete a BotModel
 */
router.delete("/:BotModelId", BotModelController.deleteBotModel);

export default router;
