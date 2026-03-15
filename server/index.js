import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", ".env") });

import removeBgRouter from "./routes/removeBg.js";
import text2imageRouter from "./routes/text2image.js";
import image2imageRouter from "./routes/image2image.js";
import conceptAssetsRouter from "./routes/conceptAssets.js";
import videoRouter from "./routes/video.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "20mb" }));

app.use("/api/remove-bg", removeBgRouter);
app.use("/api/text2image", text2imageRouter);
app.use("/api/image2image", image2imageRouter);
app.use("/api/concept-assets", conceptAssetsRouter);
app.use("/api/video", videoRouter);

app.get("/api/health", (_, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
