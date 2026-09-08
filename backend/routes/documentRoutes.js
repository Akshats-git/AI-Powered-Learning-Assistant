import express from "express";
import {
  uploadDocument,
  listDocuments,
  getDocument,
  deleteDocument,
} from "../controllers/documentController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { upload } from "../middlewares/uploadMiddleware.js";
import { validate } from "../middlewares/validate.js";
import { idParamsSchema } from "../validators/requestSchema.js";

const router = express.Router();

const uploadSingle = (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      res.status(400);
      return next(err);
    }
    next();
  });
};

router.use(protect);

router.post("/upload", uploadSingle, uploadDocument);
router.get("/", listDocuments);
router.get("/:id", validate(idParamsSchema("id")), getDocument);
router.delete("/:id", validate(idParamsSchema("id")), deleteDocument);

export default router;
