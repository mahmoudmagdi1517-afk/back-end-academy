const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const { localeMiddleware } = require("./middlewares/locale.middleware");
const {
  notFoundHandler,
  errorHandler,
} = require("./middlewares/error.middleware");
const { mountRoutes } = require("./routes");

function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet());

  const origins = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin(origin, cb) {
        if (!origin || origins.length === 0 || origins.includes(origin)) {
          return cb(null, true);
        }
        return cb(new Error("CORS blocked"));
      },
      credentials: true,
    }),
  );

  app.use(
    rateLimit({
      windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
      max: Number(process.env.RATE_LIMIT_MAX || 200),
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.use(express.json({ limit: "3mb" }));
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
  app.use(localeMiddleware);

  mountRoutes(app);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

// module.exports = { createApp };
const app = createApp();
module.exports = app;
