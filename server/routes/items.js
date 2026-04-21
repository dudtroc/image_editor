import express from "express";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = express.Router();

/** GET /api/items — item.json 데이터 반환 */
router.get("/", (_req, res) => {
  try {
    const dataPath = join(__dirname, "../../data/item/item.json");
    const data = JSON.parse(readFileSync(dataPath, "utf-8"));
    res.json(data);
  } catch (err) {
    console.error("item.json 읽기 실패:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
