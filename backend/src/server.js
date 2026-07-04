import express from "express";
import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import authRoutes from "./routes/auth.route.js";
import userRoutes from "./routes/user.route.js";
import chatRoutes from "./routes/chat.route.js";
import aiRoutes from "./routes/ai.route.js";

import { connectDB } from "./lib/db.js";

const app = express();
const PORT = process.env.PORT || 5001;
const staticPath = path.join(__dirname, "../../frontend/dist");

// server startup info logged by environment or process manager when needed
if (!fs.existsSync(staticPath)) {
  console.warn(`[server] Warning: static frontend path does not exist: ${staticPath}`);
}

app.set("trust proxy", 1); // required for correct client IPs behind Render's proxy

app.use(
  helmet({
    // Stream Chat's SDK and Dicebear avatars load cross-origin resources;
    // a default strict CSP would block both, so it's disabled here rather
    // than left half-configured. Other helmet protections stay active
    // (X-Content-Type-Options, X-Frame-Options, HSTS, hiding X-Powered-By, etc).
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:5174", "https://speakzy-9rkd.onrender.com"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());
app.use(cookieParser());
app.options("*", cors());

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/ai", aiRoutes);

app.use("/api", (req, res) => {
  console.warn(`[server] API 404: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ success: false, message: "API route not found" });
});

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