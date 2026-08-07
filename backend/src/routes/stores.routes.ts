import { Router } from "express";
import {
  createStoreHandler,
  getStoreHandler,
  listStoresHandler,
  updateStoreHandler,
  updateStoreStatusHandler,
} from "../controllers/stores.controller.js";

export const storesRouter = Router();

// TODO: Restrict Store Setup to an administrative permission once authentication is implemented.
storesRouter.get("/", listStoresHandler);
storesRouter.post("/", createStoreHandler);
storesRouter.patch("/:id/status", updateStoreStatusHandler);
storesRouter.get("/:id", getStoreHandler);
storesRouter.patch("/:id", updateStoreHandler);
