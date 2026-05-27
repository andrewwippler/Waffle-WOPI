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
const { decode: utf7Decode } = require("../helpers/utf7");
const { listSettingsFiles } = require("../helpers/files.js");

const bodyParser = require("body-parser");

const { DOCUMENTSERVER_URL, FILES_DIR, MIDDLEWARE_SERVER, SETTINGS_DIR } = require("../helpers/vars.js");

const { createFileToken, decodeFileToken } = require("../helpers/filetoken.js");

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
  let rel;
  try {
    rel = decodeFileToken(req.params.fileId);
  } catch (e) {
    return res.status(400).json({ error: "Invalid file token" });
  }
  const filepath = path.join(FILES_DIR, rel);

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: "File not found" });
  }

  const stats = fs.statSync(filepath);
  const json = {
    BaseFileName: path.basename(rel),
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
  let rel;
  try {
    rel = decodeFileToken(req.params.fileId);
  } catch (e) {
    return res.status(400).json({ error: "Invalid file token" });
  }
  const filepath = path.join(FILES_DIR, rel);
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
const rawBodyParser = bodyParser.raw({ limit: "200mb" });

router.post("/files/:fileId/contents", rawBodyParser, function (req, res) {
  if (!req.wopi.canWrite) {
    return res.status(403).json({ error: "Read-only access" });
  }

  let rel;
  try {
    rel = decodeFileToken(req.params.fileId);
  } catch (e) {
    return res.status(400).json({ error: "Invalid file token" });
  }
  const filepath = path.join(FILES_DIR, rel);

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
  const requestedServer = req.query.server || DOCUMENTSERVER_URL;
  const mimeType =
    req.query.mimeType || "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const extension = req.query.extension || "docx";

  console.log("[collaboraUrl] Requested server:", requestedServer);
  console.log("[collaboraUrl] Requested mimeType:", mimeType);
  console.log("[collaboraUrl] Requested extension:", extension);

  let collaboraOnlineHost = requestedServer;
  let httpClient = collaboraOnlineHost.startsWith("https") ? https : http;
  let data = "";
  // eslint-disable-next-line no-unused-vars
  let request = httpClient.get(collaboraOnlineHost + "/hosting/discovery", function (response) {
    response.on("data", function (chunk) {
      data += chunk.toString();
    });
    response.on("end", function () {
      if (response.statusCode !== 200) {
        let err = "Request failed. Status Code: " + response.statusCode;
        response.resume();
        res.status(response.statusCode).send(err);
        console.error("[collaboraUrl]", err);
        return;
      }
      if (!response.complete) {
        let err =
          "Unable to retrieve the discovery.xml file from the Collabora Online server with the submitted address.";
        res.status(404).send(err);
        console.error("[collaboraUrl]", err);
        return;
      }
      let doc = new Dom().parseFromString(data, "text/xml");
      if (!doc) {
        let err = "The retrieved discovery.xml file is not a valid XML file";
        res.status(404).send(err);
        console.error("[collaboraUrl]", err);
        return;
      }

      console.log("[collaboraUrl] Looking up mimeType:", mimeType);
      let nodes = xpath.select(
        "/wopi-discovery/net-zone/app[@name='" + mimeType + "']/action",
        doc
      );

      if (!nodes || nodes.length === 0) {
        console.log("[collaboraUrl] No match for mimeType, trying extension:", extension);
        nodes = xpath.select("/wopi-discovery/net-zone/app[@name='" + extension + "']/action", doc);
      }

      let settings = xpath.select("/wopi-discovery/net-zone/app[@name='Settings']/action", doc);

      if (!nodes || nodes.length === 0) {
        let err = "The requested mime type is not handled";
        res.status(404).send(err);
        console.error("[collaboraUrl]", err, "- mimeType:", mimeType, "extension:", extension);
        return;
      }

      console.log("[collaboraUrl] Found", nodes.length, "action(s) for mimeType/extension");
      let onlineUrl = nodes[0].getAttribute("urlsrc");
      let onlineSettingsUrl = settings[0] ? settings[0].getAttribute("urlsrc") : null;

      console.log("[collaboraUrl] Returning onlineUrl:", onlineUrl);
      console.log("[collaboraUrl] Returning settingsUrl:", onlineSettingsUrl);

      res.json({
        url: onlineUrl,
        settings: onlineSettingsUrl,
      });
    });
    response.on("error", function (err) {
      res.status(404).send("Request error: " + err);
      console.error("[collaboraUrl] Request error:", err.message);
    });
  });
});

// Settings file listing
router.get("/settings", (req, res) => {
  const { type } = req.query;

  try {
    if (type === "userconfig") {
      const files = listSettingsFiles(SETTINGS_DIR, MIDDLEWARE_SERVER, "userconfig");
      return res.json({ files });
    } else if (type === "systemconfig") {
      const files = listSettingsFiles(SETTINGS_DIR, MIDDLEWARE_SERVER, "systemconfig");
      return res.json({ files });
    } else if (!type) {
      const userconfig = listSettingsFiles(SETTINGS_DIR, MIDDLEWARE_SERVER, "userconfig");
      const systemconfig = listSettingsFiles(SETTINGS_DIR, MIDDLEWARE_SERVER, "systemconfig");
      return res.json({ userconfig, systemconfig });
    } else {
      return res.status(400).json({ error: "Invalid type parameter" });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Upload a new settings file (multipart or raw body file upload)
router.post("/settings/upload", (req, res) => {
  upload.single("file")(req, res, function (err) {
    if (err) {
      return res.status(500).json({ error: "File upload failed", details: err.message });
    }

    const { fileId } = req.query;

    if (!fileId) {
      return res.status(400).json({ error: "Missing fileId" });
    }

    // Build target path, stripping the leading /settings/ prefix
    // e.g. "/settings/systemconfig/xcu/doc.xcu" -> ["systemconfig", "xcu", "doc.xcu"]
    const parts = fileId.split("/").filter(Boolean).filter((p) => p !== "settings");
    const targetDir = path.join(SETTINGS_DIR, ...parts.slice(0, -1));
    const targetPath = path.join(targetDir, parts[parts.length - 1]);

    const writeFile = (buf) => {
      try {
        fs.mkdirSync(targetDir, { recursive: true });
        fs.writeFileSync(targetPath, buf);
      } catch (fsErr) {
        return res.status(500).json({ error: "Failed to save file", details: fsErr.message });
      }

      const newStamp = Date.now().toString();

      res.json({
        status: "success",
        filename: parts[parts.length - 1],
        details: {
          stamp: newStamp,
          uri: `${MIDDLEWARE_SERVER}/wopi/settings/files${fileId}`,
        },
      });
    };

    // If multer parsed a multipart file, use it
    if (req.file) {
      const buf = fs.readFileSync(req.file.path);
      fs.unlinkSync(req.file.path);
      return writeFile(buf);
    }

    // Fallback: read raw body from stream
    let body = [];
    req.on("data", (chunk) => body.push(chunk));
    req.on("end", () => {
      writeFile(Buffer.concat(body));
    });
  });
});

// Read a settings file (WOPI-style GetFile for settings files)
router.get("/settings/files/:fileId", (req, res) => {
  const fileId = req.params.fileId;
  const safePath = path.normalize(fileId).replace(/\\/g, "/");

  if (safePath.startsWith("..") || path.isAbsolute(safePath)) {
    return res.status(400).json({ error: "Invalid path" });
  }

  const filePath = path.join(SETTINGS_DIR, safePath);
  const normFile = path.normalize(filePath);

  if (!normFile.startsWith(path.normalize(SETTINGS_DIR))) {
    return res.status(400).json({ error: "Invalid path" });
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).json({ error: "File not found" });
  }

  res.sendFile(filePath);
});

// Write or delete a settings file (WOPI-style PutFile/DeleteFile for settings)
router.post("/settings/files/:fileId", (req, res) => {
  const fileId = req.params.fileId;
  const safePath = path.normalize(fileId).replace(/\\/g, "/");

  if (safePath.startsWith("..") || path.isAbsolute(safePath)) {
    return res.status(400).json({ error: "Invalid path" });
  }

  const filePath = path.join(SETTINGS_DIR, safePath);
  const normFile = path.normalize(filePath);

  if (!normFile.startsWith(path.normalize(SETTINGS_DIR))) {
    return res.status(400).json({ error: "Invalid path" });
  }

  const override = req.header("X-WOPI-Override");

  if (override === "DELETE") {
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }
    try {
      fs.unlinkSync(filePath);
      return res.json({ status: "deleted" });
    } catch (e) {
      return res.status(500).json({ error: "Failed to delete file" });
    }
  }

  // PutFile: save file content from raw body
  let body = [];
  req.on("data", (chunk) => body.push(chunk));
  req.on("end", () => {
    const buf = Buffer.concat(body);
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, buf);
      res.json({ status: "saved", stamp: Date.now().toString() });
    } catch (e) {
      res.status(500).json({ error: "Failed to save file" });
    }
  });
});

/* *
 *  wopi X-WOPI-Overrides endpoint
 */
router.post("/files/:fileId", rawBodyParser, (req, res) => {
  const fileId = req.params.fileId;
  let rel;
  try {
    rel = decodeFileToken(fileId);
  } catch (e) {
    return res.status(400).json({ error: "Invalid file token" });
  }
  const override = req.header("X-WOPI-Override");
  console.log("X-WOPI-Override:", override, " for fileId:", fileId);
  if (override === "LOCK") {
    const lockValue = req.header("X-WOPI-Lock");
    if (locks[fileId] && locks[fileId].value !== lockValue) {
      // Conflict
      return res.status(409).header("X-WOPI-Lock", locks[fileId].value).end();
    }
    locks[fileId] = { value: lockValue, expires: Date.now() + 108000 }; // 30 min
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
    locks[fileId].expires = Date.now() + 108000; // 30 min
    return res.sendStatus(200);
  } else if (override === "PUT_RELATIVE") {
    // Save As
    const suggestedTarget = utf7Decode(req.header("X-WOPI-SuggestedTarget") || "");
    const newFileName = suggestedTarget.replace(/^\.?/, ""); // Remove leading dot if present
    const dir = path.dirname(rel);
    const newRel = dir === "." ? newFileName : path.join(dir, newFileName);
    const newFilePath = path.join(FILES_DIR, newRel);
    fs.writeFileSync(newFilePath, req.body);
    res.json({
      Name: newFileName,
      Url: `https://${MIDDLEWARE_SERVER}/wopi/files/${encodeURIComponent(createFileToken(newRel))}?access_token=${req.query.access_token}`,
    });
  } else if (override === "RENAME_FILE") {
    // Rename
    const requestedName = utf7Decode(req.header("X-WOPI-RequestedName") || "");
    const ext = path.extname(rel);
    const newFileName = requestedName + ext;
    const dir = path.dirname(rel);
    const oldPath = path.join(FILES_DIR, rel);
    const newRel = dir === "." ? newFileName : path.join(dir, newFileName);
    const newPath = path.join(FILES_DIR, newRel);
    fs.renameSync(oldPath, newPath);
    res.json({
      Name: newFileName,
      Url: `https://${MIDDLEWARE_SERVER}/wopi/files/${encodeURIComponent(createFileToken(newRel))}?access_token=${req.query.access_token}`,
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
    locks[fileId] = { value: newLock, expires: Date.now() + 108000 }; // 30 min
    return res.sendStatus(200);
  } else {
    res.status(400).json({ error: "Unsupported X-WOPI-Override" });
  }
});
module.exports = router;
