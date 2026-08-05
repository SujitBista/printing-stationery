import { Router } from "express";
import {
  createItemGroupHandler,
  getItemGroupHandler,
  listItemGroupsHandler,
  updateItemGroupHandler,
  updateItemGroupStatusHandler,
} from "../controllers/item-groups.controller.js";

export const itemGroupsRouter = Router();

// TODO: Restrict Item Group Setup to an administrative permission once authentication is implemented.
itemGroupsRouter.get("/", listItemGroupsHandler);
itemGroupsRouter.post("/", createItemGroupHandler);
itemGroupsRouter.patch("/:id/status", updateItemGroupStatusHandler);
itemGroupsRouter.get("/:id", getItemGroupHandler);
itemGroupsRouter.patch("/:id", updateItemGroupHandler);
