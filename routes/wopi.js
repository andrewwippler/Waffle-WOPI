"use strict";

let express = require("express");
let router = express.Router();

const fs = require("fs");
const path = require("path");
let http = require("http");
let https = require("https");
let Dom = require("@xmldom/xmldom").DOMParser;
let xpath = require("xpath");
const multer = require("multer");
const upload = multer({ dest: "/tmp" });
const utf7 = require("utf7");

const {
  DOCUMENTSERVER_URL,
  FILES_DIR,
  SETTINGS_DIR,
  MIDDLEWARE_SERVER,
} = require("../helpers/vars.js");

const { listSettingsFiles } = require("../helpers/files.js");

const locks = {}; // { fileId: { value: string, expires: number } }

/* *
 *  wopi CheckFileInfo endpoint
 *
 *  Returns info about the file with the given document id.
 *  The response has to be in JSON format and at a minimum it needs to include
 *  the file name and the file size.
 *  The CheckFileInfo wopi endpoint is triggered by a GET request at
 *  https://HOSTNAME/wopi/files/<document_id>
 */
router.get("/files/:fileId", function (req, res) {
  console.log("file id: " + req.params.fileId);
  const filepath = path.join(FILES_DIR, req.params.fileId);

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: "File not found" });
  }

  const stats = fs.statSync(filepath);
  const json = {
    BaseFileName: req.params.fileId,
    Size: stats.size,
    UserFriendlyName: req.wopi.name,
    UserCanWrite: req.wopi.canWrite,
    IsAdminUser: req.wopi.isAdminUser,
    Version: stats.mtimeMs.toString(),
    SupportsRename: true,
    UserCanNotWriteRelative: false,
    SupportsLocks: true,
    SupportsGetLock: true,
    UserCanRename: req.wopi.canWrite,
  };
  console.log("Available settings", json);
  res.json(json);
});

/* *
 *  wopi GetFile endpoint
 *
 *  Given a request access token and a document id, sends back the contents of the file.
 *  The GetFile wopi endpoint is triggered by a request with a GET verb at
 *  https://HOSTNAME/wopi/files/<document_id>/contents
 */
router.get("/files/:fileId/contents", function (req, res) {
  // send back the file content as response
  const filepath = path.join(FILES_DIR, req.params.fileId);
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: "File not found" });
  }

  res.sendFile(filepath);
});

/* *
 *  wopi PutFile endpoint
 *
 *  Given a request access token and a document id, replaces the files with the POST request body.
 *  The PutFile wopi endpoint is triggered by a request with a POST verb at
 *  https://HOSTNAME/wopi/files/<document_id>/contents
 */
router.post("/files/:fileId/contents", function (req, res) {
  if (!req.wopi.canWrite) {
    return res.status(403).json({ error: "Read-only access" });
  }

  const filepath = path.join(FILES_DIR, req.params.fileId);

  if (req.body) {
    fs.writeFileSync(filepath, req.body);
    const stats = fs.statSync(filepath);
    res.json({
      LastModifiedTime: new Date(stats.mtime).toISOString(),
    });
  } else {
    console.log("Not possible to get the file content.");
    res.sendStatus(404);
  }
});

router.get("/collaboraUrl", function (req, res) {
  let collaboraOnlineHost = DOCUMENTSERVER_URL;
  let httpClient = collaboraOnlineHost.startsWith("https") ? https : http;
  let data = "";
  let request = httpClient.get(
    collaboraOnlineHost + "/hosting/discovery",
    function (response) {
      response.on("data", function (chunk) {
        data += chunk.toString();
      });
      response.on("end", function () {
        if (response.statusCode !== 200) {
          let err = "Request failed. Satus Code: " + response.statusCode;
          response.resume();
          res.status(response.statusCode).send(err);
          console.log(err);
          return;
        }
        if (!response.complete) {
          let err =
            "No able to retrieve the discovery.xml file from the Collabora Online server with the submitted address.";
          res.status(404).send(err);
          console.log(err);
          return;
        }
        let doc = new Dom().parseFromString(data);
        if (!doc) {
          let err = "The retrieved discovery.xml file is not a valid XML file";
          res.status(404).send(err);
          console.log(err);
          return;
        }
        let mimeType = "text/plain";
        let nodes = xpath.select(
          "/wopi-discovery/net-zone/app[@name='" + mimeType + "']/action",
          doc
        );
        let settings = xpath.select(
          "/wopi-discovery/net-zone/app[@name='Settings']/action",
          doc
        );

        if (!nodes || nodes.length !== 1) {
          let err = "The requested mime type is not handled";
          res.status(404).send(err);
          console.log(err);
          return;
        }
        let onlineUrl = nodes[0].getAttribute("urlsrc");
        let onlineSettingsUrl = settings[0].getAttribute("urlsrc");

        res.json({
          url: onlineUrl,
          settings: onlineSettingsUrl,
        });
      });
      response.on("error", function (err) {
        res.status(404).send("Request error: " + err);
        console.log("Request error: " + err.message);
      });
    }
  );
});

// e.g. settings/userconfig/xcu/paragraphStyles.xcu
// e.g. settings/systemconfig/xcu/defaultStyles.xcu
router.get("/settings", (req, res) => {
  const { type } = req.query;

  let response = {};
  try {
    const files = listSettingsFiles(SETTINGS_DIR, MIDDLEWARE_SERVER);
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }

  if (type === "userconfig") {
    response = listSettingsFiles(SETTINGS_DIR, MIDDLEWARE_SERVER, "userconfig");
  } else if (type === "systemconfig") {
    response = listSettingsFiles(
      SETTINGS_DIR,
      MIDDLEWARE_SERVER,
      "systemconfig"
    );
  } else {
    return res.status(400).json({ error: "Invalid type parameter" });
  }

  res.json(response);
});

// TODO: Save settings to files
// e.g. settings/userconfig/xcu/paragraphStyles.xcu
// e.g. settings/systemconfig/xcu/defaultStyles.xcu
router.post("/settings/upload", upload.single("file"), (req, res) => {
  const { fileId } = req.query;

  if (!fileId || !req.file) {
    return res.status(400).json({ error: "Missing fileId or file" });
  }

  // Build target path
  const parts = fileId.split("/").filter(Boolean); // remove empty strings
  // parts = ["settings", "userconfig", "xcu", "paragraphStyles.xcu"]
  const targetDir = path.join(SETTINGS_DIR, ...parts.slice(0, -1));
  const targetPath = path.join(targetDir, parts[parts.length - 1]);

  fs.mkdirSync(targetDir, { recursive: true });
  fs.renameSync(req.file.path, targetPath);

  // Generate new stamp (simple example: timestamp)
  const newStamp = Date.now().toString();

  res.json({
    status: "success",
    filename: parts[parts.length - 1],
    details: {
      stamp: newStamp,
      uri: `https://${MIDDLEWARE_SERVER}/${fileId}`,
    },
  });
});

/* *
 *  wopi X-WOPI-Overrides endpoint
 */
router.post("/files/:fileId", (req, res) => {
  const fileId = req.params.fileId;
  const override = req.header("X-WOPI-Override");
  console.log("X-WOPI-Override:", override, " for fileId:", fileId);
  if (override === "LOCK") {
    const lockValue = req.header("X-WOPI-Lock");
    if (locks[fileId] && locks[fileId].value !== lockValue) {
      // Conflict
      return res.status(409).header("X-WOPI-Lock", locks[fileId].value).end();
    }
    locks[fileId] = { value: lockValue, expires: Date.now() + 30 * 60 * 1000 }; // 30 min
    return res.sendStatus(200);
  } else if (override === "UNLOCK") {
    const lockValue = req.header("X-WOPI-Lock");
    if (!locks[fileId] || locks[fileId].value !== lockValue) {
      return res
        .status(409)
        .header("X-WOPI-Lock", locks[fileId]?.value || "")
        .end();
    }
    delete locks[fileId];
    return res.sendStatus(200);
  } else if (override === "GET_LOCK") {
    if (locks[fileId]) {
      res.setHeader("X-WOPI-Lock", locks[fileId].value);
    }
    return res.sendStatus(200);
  } else if (override === "REFRESH_LOCK") {
    const lockValue = req.header("X-WOPI-Lock");
    if (!locks[fileId] || locks[fileId].value !== lockValue) {
      return res
        .status(409)
        .header("X-WOPI-Lock", locks[fileId]?.value || "")
        .end();
    }
    locks[fileId].expires = Date.now() + 30 * 60 * 1000;
    return res.sendStatus(200);
  } else if (override === "PUT_RELATIVE") {
    // Save As
    const suggestedTarget = utf7.decode(req.header("X-WOPI-SuggestedTarget") || "");
    const newFileName = suggestedTarget.replace(/^\.?/, ""); // Remove leading dot if present
    const newFilePath = path.join(FILES_DIR, newFileName);
    fs.writeFileSync(newFilePath, req.body);
    res.json({
      Name: newFileName,
      Url: `https://${MIDDLEWARE_SERVER}/wopi/files/${encodeURIComponent(newFileName)}?access_token=${req.query.access_token}`,
    });
  } else if (override === "RENAME_FILE") {
    // Rename
    const requestedName = utf7.decode(req.header("X-WOPI-RequestedName") || "");
    const ext = path.extname(req.params.fileId);
    const newFileName = requestedName + ext;
    const oldPath = path.join(FILES_DIR, req.params.fileId);
    const newPath = path.join(FILES_DIR, newFileName);
    fs.renameSync(oldPath, newPath);
    res.json({
      Name: newFileName,
      Url: `https://${MIDDLEWARE_SERVER}/wopi/files/${encodeURIComponent(newFileName)}?access_token=${req.query.access_token}`,
    });
  } else if (override === "UNLOCK_AND_RELOCK") {
    const oldLock = req.header("X-WOPI-OldLock");
    const newLock = req.header("X-WOPI-Lock");
    if (!locks[fileId] || locks[fileId].value !== oldLock) {
      return res
        .status(409)
        .header("X-WOPI-Lock", locks[fileId]?.value || "")
        .end();
    }
    locks[fileId] = { value: newLock, expires: Date.now() + 30 * 60 * 1000 };
    return res.sendStatus(200);
  } else {
    res.status(400).json({ error: "Unsupported X-WOPI-Override" });
  }
});
module.exports = router;
