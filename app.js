"use strict";

let express = require("express");
let path = require("path");
let logger = require("morgan");
let cookieParser = require("cookie-parser");
const fs = require("fs");
const session = require("express-session");
// Office templates are in templates/ directory and used by helpers/files.js

let indexRouter = require("./routes/index");
let wopiRouter = require("./routes/wopi");
let authRouter = require("./routes/auth");
const { requireLogin, validateAccessToken } = require("./helpers/middleware");

const maxDocumentSize = "200mb";

const {
  DEX_ISSUER,
  CLIENT_ID,
  CLIENT_SECRET,
  JWT_SECRET,
  DOCUMENTSERVER_URL,
  MIDDLEWARE_SERVER,
  NODE_ENV,
  FILES_DIR,
} = require("./helpers/vars.js");

if (
  !DEX_ISSUER ||
  !CLIENT_ID ||
  !CLIENT_SECRET ||
  !JWT_SECRET ||
  !DOCUMENTSERVER_URL ||
  !MIDDLEWARE_SERVER
) {
  console.error(
    "Missing required env vars. Please set DEX_ISSUER, CLIENT_ID, CLIENT_SECRET, JWT_SECRET, DOCUMENTSERVER_URL, MIDDLEWARE_SERVER"
  );
  process.exit(1);
}

let app = express();

if (NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Session
app.use(
  session({
    secret: JWT_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

app.use(cookieParser());

// Files directory
if (!fs.existsSync(FILES_DIR)) fs.mkdirSync(FILES_DIR, { recursive: true });

app.use(logger("dev"));
app.use(express.json({ limit: maxDocumentSize }));
app.use(express.urlencoded({ extended: false, limit: maxDocumentSize }));

app.use("/auth", authRouter);
app.get("/favicon.ico", (req, res) => res.sendStatus(200));
app.use("/wopi", validateAccessToken, wopiRouter);
app.use("/", requireLogin, indexRouter);
app.use(express.static(path.join(__dirname, "html")));

// Error handler
app.use((err, req, res, next) => {
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "File too large", maxSize: maxDocumentSize });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
