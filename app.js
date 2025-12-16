'use strict';

let express = require('express');
let path = require('path');
let logger = require('morgan');
let bodyParser = require('body-parser');
const qs = require("querystring");
const fs = require("fs");
const session = require("express-session");
const officegen = require("officegen");

let indexRouter = require('./routes/index');
let wopiRouter = require('./routes/wopi');
let authRouter = require('./routes/auth');
const { requireLogin, validateAccessToken } = require('./helpers/middleware');

// maximum request body size handled by the bodyParser package
// increase it if you need to handle larger files
const maxDocumentSize = '100kb';

const {
  DEX_ISSUER,
  CLIENT_ID,
  CLIENT_SECRET,
  JWT_SECRET,
  DOCUMENTSERVER_URL,
  MIDDLEWARE_SERVER,
  NODE_ENV,
  FILES_DIR
} = require("./helpers/vars.js");

if (!DEX_ISSUER || !CLIENT_ID || !CLIENT_SECRET || !JWT_SECRET || !DOCUMENTSERVER_URL || !MIDDLEWARE_SERVER) {
  console.error("Missing required env vars. Please set DEX_ISSUER, CLIENT_ID, CLIENT_SECRET, JWT_SECRET, DOCUMENTSERVER_URL, MIDDLEWARE_SERVER");
  process.exit(1);
}

let app = express();

if (NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Session
app.use(session({
  secret: JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// Files directory
if (!fs.existsSync(FILES_DIR)) fs.mkdirSync(FILES_DIR, { recursive: true });



app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(bodyParser.raw({ limit: maxDocumentSize }));


app.use('/auth', authRouter);
app.get('/favicon.ico', (req, res) => res.sendStatus(200));
app.use('/wopi', validateAccessToken, wopiRouter);
app.use('/', requireLogin, indexRouter);
app.use(express.static(path.join(__dirname, 'html')));

module.exports = app;
