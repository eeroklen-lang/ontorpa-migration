import { Request, Response } from "express";
import BaseController from "../controllers/BaseController";
import {
  MigrationRequestError,
  migrationTargetOperations,
  previewPadStep,
} from "../services/migrationService";

class MigrationTargetController extends BaseController {
  getMigrationTargets = async (req: Request, res: Response): Promise<void | any> => {
    try {
      res.send(migrationTargetOperations());
    } catch (error) {
      return BaseController.fail(res, error);
    }
  };

  previewPadStep = async (req: Request, res: Response): Promise<void | any> => {
    try {
      res.send({ lines: previewPadStep(req.body?.step) });
    } catch (error) {
      if (error instanceof MigrationRequestError) {
        return BaseController.clientError(res, error.message);
      }
      return BaseController.fail(res, error);
    }
  };
}

export default new MigrationTargetController();
