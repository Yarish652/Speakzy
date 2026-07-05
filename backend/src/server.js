import express from "express";
import "dotenv/config";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import app from "./app.js";
import { connectDB } from "./lib/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 5001;
const staticPath = path.join(__dirname, "../../frontend/dist");

console.log(`[server] Process PID=${process.pid}`);
console.log(`[server] Using port ${PORT}`);
console.log(`[server] Expected frontend static path: ${staticPath}`);
if (!fs.existsSync(staticPath)) {
  console.warn(`[server] Warning: static frontend path does not exist: ${staticPath}`);
}

app.use(express.static(staticPath));
app.get("*", (req, res) => {
  if (!fs.existsSync(path.join(staticPath, "index.html"))) {
    console.error(`[server] Missing index.html at ${path.join(staticPath, "index.html")}`);
    return res.status(500).send("Frontend assets missing. Build the frontend before serving.");
  }
  res.sendFile(path.join(staticPath, "index.html"));
});

app.use((err, req, res, next) => {
  console.error(`[server error] ${err.stack || err}`);
  res.status(err.status || 500).json({ success: false, error: err.message || "Server Error" });
});

const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  connectDB();
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`[server] Port ${PORT} is already in use. Try setting PORT to a different value.`);
  } else {
    console.error(`[server] Server error: ${error.message}`);
  }
  process.exit(1);
});