"use strict";

const fs = require("fs");
const path = require("path");
const { generateOttTemplate } = require("../helpers/files");

const OTT_PATH = path.join(__dirname, "..", "templates", "writer_defaults.ott");

generateOttTemplate()
  .then((buf) => {
    fs.writeFileSync(OTT_PATH, buf);
    console.log("Generated .ott template:", OTT_PATH, `(${(buf.length / 1024).toFixed(1)} KB)`);
  })
  .catch((err) => {
    console.error("Failed to generate .ott template:", err);
    process.exit(1);
  });
