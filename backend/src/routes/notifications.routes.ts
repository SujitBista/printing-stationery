import { Router } from "express";
import {
  getNotificationUnreadCountHandler,
  listNotificationsHandler,
  markAllNotificationsReadHandler,
  markNotificationReadHandler,
} from "../controllers/notifications.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get("/", listNotificationsHandler);
notificationsRouter.get("/unread-count", getNotificationUnreadCountHandler);
notificationsRouter.post("/mark-all-read", markAllNotificationsReadHandler);
notificationsRouter.patch("/:id/read", markNotificationReadHandler);
