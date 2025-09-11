require("dotenv").config();
const path = require("path");
const fs = require("fs");

const DEX_ISSUER = process.env.DEX_ISSUER;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const JWT_SECRET = process.env.JWT_SECRET;
const DOCUMENTSERVER_URL = process.env.DOCUMENTSERVER_URL;
const MIDDLEWARE_SERVER = process.env.MIDDLEWARE_SERVER;
const SUPER_ADMIN_USER = process.env.SUPER_ADMIN_USER || "admin";
const NODE_ENV = process.env.NODE_ENV || "development";
// Define your documents folder
const FILES_DIR = process.env.FILES_DIR || path.join(__dirname, '../files/editable');
const SETTINGS_DIR = process.env.FILES_DIR || path.join(__dirname, '../files/settings');

fs.mkdirSync(FILES_DIR, { recursive: true });
fs.mkdirSync(SETTINGS_DIR, { recursive: true });


module.exports = {
  DEX_ISSUER,
  CLIENT_ID,
  CLIENT_SECRET,
  JWT_SECRET,
  DOCUMENTSERVER_URL,
  MIDDLEWARE_SERVER,
  NODE_ENV,
  SUPER_ADMIN_USER,
  SETTINGS_DIR,
  FILES_DIR
};