import { Router, type IRouter } from "express";
import healthRouter from "./health";
import trackingRouter from "./tracking";
import contactRouter from "./contact";
import partnerRouter from "./partner";
import adminRouter from "./admin";
import officeRouter from "./office";
import publicLocationsRouter from "./public-locations";
import ticketsRouter from "./tickets";
import expediteursRouter from "./expediteurs";
import ecotrackRouter from "./ecotrack";
import analyticsRouter from "./analytics";
import pushRouter from "./push";
import agentRouter from "./agent";

const router: IRouter = Router();

router.use(healthRouter);
router.use(trackingRouter);
router.use(contactRouter);
router.use(partnerRouter);
router.use(adminRouter);
router.use(officeRouter);
router.use(publicLocationsRouter);
router.use(ticketsRouter);
router.use(expediteursRouter);
router.use(ecotrackRouter);
router.use(analyticsRouter);
router.use(pushRouter);
router.use(agentRouter);

export default router;
