import { Router, type IRouter } from "express";
import { db, officesTable } from "@workspace/db";
import { asc } from "@workspace/db";

const router: IRouter = Router();

router.get("/locations", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(officesTable)
      .orderBy(asc(officesTable.wilayaNumber), asc(officesTable.id));
    res.json({ ok: true, offices: rows });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch offices");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

export default router;
