/**
 * Local dev server that wraps the Vercel serverless function.
 * In production, api/chat.ts runs as a Vercel serverless function directly.
 * Locally, this Express server handles /api/chat and proxies the same handler.
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import { POST } from "./api/chat.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.post("/api/chat", async (req, res) => {
  try {
    // Convert Express request to Web Request for the serverless function
    const webRequest = new Request(`http://localhost:${PORT}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });

    const response = await POST(webRequest);

    // Stream the response back
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const reader = response.body.getReader();
      const pump = async () => {
        const { done, value } = await reader.read();
        if (done) { res.end(); return; }
        res.write(value);
        await pump();
      };
      await pump();
    } else {
      res.end(await response.text());
    }
  } catch (error) {
    console.error("[dev-server]", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`Dev API server on http://localhost:${PORT}`);
});
