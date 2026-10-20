import express from "express";
import MigrationTargetController from "../controllers/MigrationTargetController";

const router: express.Router = express.Router();

/**
 * Get the ontology operations each migration target generates, e.g. { pad: { name, operations } }
 */
router.get("/", MigrationTargetController.getMigrationTargets);

/**
 * Preview the Power Automate Desktop lines of a single step. Body: { step: { label, concept, mappingStatus?, source? } }
 */
router.post("/pad/preview", MigrationTargetController.previewPadStep);

export default router;
