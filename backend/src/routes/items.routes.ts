import { Router } from "express";
import {
  createItemHandler,
  getItemHandler,
  listItemsHandler,
  updateItemHandler,
  updateItemStatusHandler,
} from "../controllers/items.controller.js";

export const itemsRouter = Router();

// TODO: Restrict Item Setup to an administrative permission once authentication is implemented.
itemsRouter.get("/", listItemsHandler);
itemsRouter.post("/", createItemHandler);
itemsRouter.patch("/:id/status", updateItemStatusHandler);
itemsRouter.get("/:id", getItemHandler);
itemsRouter.patch("/:id", updateItemHandler);
