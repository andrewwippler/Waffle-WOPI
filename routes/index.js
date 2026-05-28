"use strict";

let express = require("express");
let router = express.Router();
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const { createEmptyFile, generateWriterXcu, sanitizeUsername, getExistingXcu, STYLE_DEFINITIONS } = require("../helpers/files.js");
const { createFileToken, decodeFileToken } = require("../helpers/filetoken.js");
const { createAccessToken } = require("../helpers/middleware.js");

const {
  MIDDLEWARE_SERVER,
  FILES_DIR,
  SETTINGS_DIR,
  NODE_ENV,
  CLIENT_ID,
  CLIENT_SECRET,
  TOKEN_ENDPOINT,
  DOCUMENTSERVER_URL,
} = require("../helpers/vars.js");

function isTokenExpiring(token, leeway = 86400) {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
        "utf8"
      )
    );
    return !payload.exp || payload.exp - leeway <= Math.floor(Date.now() / 1000);
  } catch (e) {
    return true;
  }
}

async function refreshAccessToken(req) {
  const refresh = req.session.user && req.session.user.refresh_token;
  if (!refresh) throw new Error("no refresh token available");
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refresh,
    client_id: CLIENT_ID,
  });
  if (CLIENT_SECRET) params.set("client_secret", CLIENT_SECRET);
  const resp = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!resp.ok) throw new Error("token refresh failed: " + resp.status);
  const data = await resp.json();
  req.session.user.access_token = data.access_token;
  if (data.refresh_token) req.session.user.refresh_token = data.refresh_token;
  if (data.server_url) req.session.user.server_url = data.server_url;
}

async function ensureValidToken(req, res) {
  if (!req.session || !req.session.user || !req.session.user.access_token) return false;
  if (isTokenExpiring(req.session.user.access_token)) {
    try {
      await refreshAccessToken(req);
    } catch (e) {
      console.error("token refresh error", e);
      req.session.destroy((err) => {
        res.clearCookie("access_token", {
          httpOnly: true,
          secure: NODE_ENV === "production",
          sameSite: "lax",
        });
      });
      return true;
    }
  }
  return false;
}

router.get("/", (req, res) => {
  const user = req.session.user;
  const supportedExtensions = [".docx", ".xlsx", ".pptx"];

  // Relative path within FILES_DIR (may be empty)
  const relPath = req.query.path ? req.query.path : "";
  const absDir = path.join(FILES_DIR, relPath);
  const normBase = path.normalize(FILES_DIR + path.sep);
  const normTarget = path.normalize(absDir + path.sep);
  if (!normTarget.startsWith(normBase)) return res.status(400).send("Invalid path");

  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
    return res.status(404).send("Directory not found");
  }

  const entries = fs.readdirSync(absDir);
  const dirs = entries.filter((e) => fs.statSync(path.join(absDir, e)).isDirectory()).sort();
  const files = entries
    .filter(
      (e) =>
        fs.statSync(path.join(absDir, e)).isFile() &&
        supportedExtensions.some((ext) => e.endsWith(ext))
    )
    .sort();

  function joinRel(name) {
    return relPath ? path.join(relPath, name).replace(/\\/g, "/") : name;
  }

  const fileLinks = `
    ${
      dirs.length
        ? dirs
            .map((d) => {
              const token = createFileToken(joinRel(d));
              return `<li>📁 <a href="/?path=${encodeURIComponent(joinRel(d))}">${d}</a> --- <button onclick="deleteFile('${encodeURIComponent(token)}')">Delete</button></li>`;
            })
            .join("")
        : ""
    }
    ${
      files.length
        ? files
            .map((f) => {
              const token = createFileToken(joinRel(f));
              return `<li>📄 <a href="/edit?file=${encodeURIComponent(token)}">${f}</a> --- <button onclick="deleteFile('${encodeURIComponent(token)}')">Delete</button></li>`;
            })
            .join("")
        : ""
    }
    ${dirs.length === 0 && files.length === 0 ? "<li>No documents yet</li>" : ""}
  `;

  // Breadcrumbs
  const parts = relPath ? relPath.split(/[\\/]/).filter(Boolean) : [];
  let crumbPath = "";
  const breadcrumbs = ['<a href="/">Home</a>']
    .concat(
      parts.map((p) => {
        crumbPath = crumbPath ? `${crumbPath}/${p}` : p;
        return `<a href="/?path=${encodeURIComponent(crumbPath)}">${p}</a>`;
      })
    )
    .join(" / ");

  res.send(`<!DOCTYPE html><html><head><title>Waffle WOPI @ ${MIDDLEWARE_SERVER}</title>
    <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    ul { list-style-type: none; padding: 0; }
    li { margin: 5px 0; }
    a { text-decoration: none; color: #007BFF; }
    a:hover { text-decoration: underline; }
    form { margin-top: 20px; }
    input[type="text"] { padding: 5px; width: 200px; }
    input[type="submit"] { padding: 5px 10px; }
    </style>
    </head><body>
    <h1>Welcome, ${user.name}</h1>
    <a href="/logout">Logout</a> |
    <a href="/settings?iframe_type=user">User Settings</a> |
    <a href="/settings?iframe_type=admin">Admin Settings</a> |
    <a href="/preferences">Writer Defaults</a>
    <h2>Your Documents</h2>
    <div>Path: ${breadcrumbs}</div>
    <ul>${fileLinks}</ul>

<script src="/javascripts/deleteFile.js"></script>

    <h3>Create New</h3>
    <form method="POST" id="createForm">
      <input type="text" name="filename" placeholder="Name" required />
      <input type="hidden" name="currentpath" value="${relPath}" />
      <select name="filetype" id="filetype">
        <option value="docx">Word (.docx)</option>
        <option value="xlsx">Excel (.xlsx)</option>
        <option value="pptx">PowerPoint (.pptx)</option>
        <option value="folder">Folder</option>
      </select>
      <input type="submit" value="Create" />
    </form>

    <script>
      document.getElementById('createForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const filetype = document.getElementById('filetype').value;
        this.action = '/create/' + encodeURIComponent(filetype);
        this.submit();
      });
    </script>
      </body></html>`);
});

// Edit document with Collabora (WOPI)
router.get("/edit", async (req, res) => {
  const token = req.query.file;
  if (!token) return res.status(400).send("Missing file parameter");
  let rel;
  try {
    rel = decodeFileToken(token);
  } catch (e) {
    return res.status(400).send("Invalid file token");
  }
  const filePath = path.join(FILES_DIR, rel);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile())
    return res.status(404).send("File not found");

  const mode = req.query.mode === "view" ? "view" : "edit";
  const canWrite = mode === "edit";
  const wopiAccessToken = createAccessToken(req.session.user, rel, canWrite);

  if (!req.session.user.server_url) {
    try {
      const resp = await axios.get(
        `${MIDDLEWARE_SERVER}/wopi/collaboraUrl?server=` +
          encodeURIComponent(DOCUMENTSERVER_URL) +
          `&access_token=` +
          encodeURIComponent(wopiAccessToken)
      );
      req.session.user.server_url = resp.data.url;
      req.session.user.settings_url = resp.data.settings;
    } catch (e) {
      return res.status(500).send("Failed to discover Collabora URL");
    }
  }

  const wopiSrc = `WOPISrc=` + encodeURIComponent(`${MIDDLEWARE_SERVER}/wopi/files/${token}`);
  let source = req.session.user.server_url + wopiSrc;
  res.send(`<!DOCTYPE html><html><head><title>${mode === "edit" ? "Edit" : "View"} ${path.basename(rel)} @ ${MIDDLEWARE_SERVER}</title>
    <style>
      html, body { margin: 0; padding: 0; height: 100%; width: 100%; overflow: hidden; }
      #collabora-online-viewer { border: none; width: 100%; height: 100vh; }
    </style>

    </head><body>

    <div style="display: none">
  <form action="${source}" enctype="multipart/form-data" method="post" target="collabora-online-viewer" id="collabora-submit-form">
    <input name="css_variables" value="" type="hidden" id="css-variables"/>
    <input name="lang" value="en_US" type="hidden" id="lang-form"/>
    <input name="closebutton" value="1" type="hidden" id="close-button-form"/>
    <input name="ui_defaults" value="UIMode=tabbed;TextSidebar=false;TextRuler=true;" type="hidden" id="ui-defaults"/>
    <input name="access_token" value="${wopiAccessToken}" type="hidden" id="access-token"/>
    <input type="submit" value="" />
  </form>
</div>

    <iframe id="collabora-online-viewer" name="collabora-online-viewer" height=1000 class="vbox" allow="clipboard-read *; clipboard-write *">
</iframe>

    <script src="/javascripts/wopi.js"></script>
    <script type="text/javascript">
// Auto-submit the form to load iframe
    document.getElementById('collabora-submit-form').submit();
    </script>
    </body></html>`);
});

router.delete("/edit", async (req, res) => {
  const token = req.query.file;
  if (!token) return res.status(400).json({ error: "Missing file parameter" });
  let rel;
  try {
    rel = decodeFileToken(token);
  } catch (e) {
    return res.status(400).json({ error: "Invalid token" });
  }
  const filePath = path.join(FILES_DIR, rel);
  const normFile = path.normalize(filePath);
  if (!normFile.startsWith(path.normalize(FILES_DIR)))
    return res.status(400).json({ error: "Invalid path" });
  try {
    const stat = await fs.promises.stat(filePath);
    if (stat.isDirectory()) {
      // check if directory is empty (recursively count entries)
      async function countEntries(dir) {
        let count = 0;
        const items = await fs.promises.readdir(dir);
        for (const it of items) {
          count += 1;
          const p = path.join(dir, it);
          const s = await fs.promises.stat(p);
          if (s.isDirectory()) {
            count += await countEntries(p);
          }
        }
        return count;
      }

      const total = await countEntries(filePath);
      // If non-empty and no explicit confirm, ask client to confirm
      if (total > 0 && req.query.confirm !== "1") {
        return res
          .status(409)
          .json({ error: "Directory not empty", needsConfirmation: true, entries: total });
      }
      // proceed to remove (confirmed or empty)
      await fs.promises.rm(filePath, { recursive: true, force: true });
      return res.send("Deleted successfully.");
    }

    // it's a file, delete directly
    await fs.promises.unlink(filePath);
    res.send("Deleted successfully.");
  } catch (err) {
    if (err.code === "ENOENT") return res.status(404).json({ error: "Not found" });
    console.error(err);
    res.status(500).json({ error: "Error deleting" });
  }
});

// Settings iframe page
router.get("/settings", async (req, res) => {
  const { iframe_type } = req.query;
  const type = iframe_type === "admin" ? "admin" : "user";
  const iframeSrc = req.session.user.settings_url;

  if (!iframeSrc) {
    return res.status(400).send("No settings URL available. Try editing a document first to discover the Collabora settings URL.");
  }

  const wopiAccessToken = createAccessToken(req.session.user, null, type === "admin");

  const typeLabel = type === "admin" ? "Admin Settings" : "User Settings";
  const otherType = type === "admin" ? "user" : "admin";
  const otherLabel = type === "admin" ? "User Settings" : "Admin Settings";

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${typeLabel} — Waffle WOPI</title>
<style>
html, body { margin: 0; padding: 0; height: 100%; width: 100%; overflow: hidden; }
body { font-family: Arial, sans-serif; }
.header { display: flex; align-items: center; gap: 16px; padding: 10px 20px; background: #f5f5f5; border-bottom: 1px solid #ddd; box-sizing: border-box; }
.header h2 { margin: 0; font-size: 16px; color: #333; }
.header a { text-decoration: none; color: #007BFF; font-size: 14px; }
.header a:hover { text-decoration: underline; }
.header .switch-btn { margin-left: auto; padding: 6px 14px; font-size: 13px; background: #007BFF; color: #fff; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; }
.header .switch-btn:hover { background: #0056b3; text-decoration: none; }
#collabora-settings-iframe { border: none; width: 100%; height: calc(100vh - 45px); }
#loading { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #666; font-size: 14px; }
</style>
</head>
<body>

<div class="header">
  <h2>${typeLabel}</h2>
  <a href="/">&larr; Home</a>
  <span style="color:#999;font-size:13px">|</span>
  <a href="/preferences">Writer Defaults</a>
  <a class="switch-btn" href="/settings?iframe_type=${otherType}">Switch to ${otherLabel}</a>
</div>

<form id="settingsForm" action="${iframeSrc}" method="post" enctype="multipart/form-data" target="collabora-settings-iframe">
    <input type="hidden" name="access_token" value="${wopiAccessToken}">
    <input type="hidden" name="access_token_ttl" value="3600">
    <input type="hidden" name="iframe_type" value="${type}">
    <input type="hidden" name="wopi_setting_base_url" value="${MIDDLEWARE_SERVER}/wopi/settings">
    <input type="hidden" name="ui_theme" value="light">
</form>

<div id="loading">Loading settings…</div>
<iframe id="collabora-settings-iframe" name="collabora-settings-iframe" onload="document.getElementById('loading').style.display='none'"></iframe>

<script>
    document.getElementById('settingsForm').submit();
</script>
</body>
</html>
`;

  res.send(html);
});

// Writer default preferences (per-user XCU)
router.get("/preferences", (req, res) => {
  const user = req.session.user;
  const safeName = sanitizeUsername(user.name || user.id);
  const existing = getExistingXcu(SETTINGS_DIR, safeName) || {};

  const fonts = [
    { group: "Recommended", options: [
      "Source Sans Pro", "Carlito", "Caladea",
      "Liberation Serif", "Liberation Sans", "Liberation Sans Narrow", "Liberation Mono",
      "DejaVu Serif", "DejaVu Serif Condensed", "DejaVu Sans", "DejaVu Sans Condensed", "DejaVu Sans Mono",
      "Noto Serif", "Noto Sans", "Open Sans", "Karla", "Rubik",
    ] },
    { group: "Serif", options: [
      "Amiri", "Amiri Quran", "David Libre", "Frank Ruhl Hofshi",
      "Gentium Basic", "Gentium Book Basic",
      "Linux Libertine G", "Linux Libertine Display G",
      "Miriam Libre",
      "Noto Serif Armenian", "Noto Serif Bengali", "Noto Serif Devanagari",
      "Noto Serif Georgian", "Noto Serif Gujarati", "Noto Serif Hebrew",
      "Noto Serif JP", "Noto Serif KR", "Noto Serif Kannada",
      "Noto Serif Khmer", "Noto Serif Lao", "Noto Serif Malayalam",
      "Noto Serif SC", "Noto Serif TC", "Noto Serif Tamil",
      "Noto Serif Telugu", "Noto Serif Thai",
      "Scheherazade",
    ] },
    { group: "Sans-Serif", options: [
      "Agdasima", "Alef", "Bacasime Antique", "Belanosima",
      "Linux Biolinum G", "Lunasima",
      "Noto Kufi Arabic", "Noto Naskh Arabic", "Noto Nastaliq Urdu",
      "Noto Sans Arabic", "Noto Sans Armenian", "Noto Sans Avestan",
      "Noto Sans Balinese", "Noto Sans Bamum", "Noto Sans Batak",
      "Noto Sans Bengali", "Noto Sans Brahmi", "Noto Sans Buginese",
      "Noto Sans Buhid", "Noto Sans Canadian Aboriginal", "Noto Sans Carian",
      "Noto Sans Cham", "Noto Sans Cherokee", "Noto Sans Coptic",
      "Noto Sans Cuneiform", "Noto Sans Cypriot", "Noto Sans Deseret",
      "Noto Sans Devanagari", "Noto Sans Egyptian Hieroglyphs",
      "Noto Sans Ethiopic", "Noto Sans Georgian", "Noto Sans Glagolitic",
      "Noto Sans Gothic", "Noto Sans Gujarati", "Noto Sans Gurmukhi",
      "Noto Sans Hanunoo", "Noto Sans Hebrew", "Noto Sans Imperial Aramaic",
      "Noto Sans Inscriptional Pahlavi", "Noto Sans Inscriptional Parthian",
      "Noto Sans JP", "Noto Sans Javanese", "Noto Sans KR",
      "Noto Sans Kaithi", "Noto Sans Kannada", "Noto Sans Kayah Li",
      "Noto Sans Kharoshthi", "Noto Sans Khmer", "Noto Sans Lao",
      "Noto Sans Lepcha", "Noto Sans Limbu", "Noto Sans Linear B",
      "Noto Sans Lisu", "Noto Sans Lycian", "Noto Sans Lydian",
      "Noto Sans Malayalam", "Noto Sans Mandaic", "Noto Sans Meetei Mayek",
      "Noto Sans Mongolian", "Noto Sans Myanmar", "Noto Sans NKo",
      "Noto Sans New Tai Lue", "Noto Sans Ogham", "Noto Sans Ol Chiki",
      "Noto Sans Old Italic", "Noto Sans Old Persian",
      "Noto Sans Old South Arabian", "Noto Sans Old Turkic",
      "Noto Sans Oriya", "Noto Sans Osmanya", "Noto Sans Phags Pa",
      "Noto Sans Phoenician", "Noto Sans Rejang", "Noto Sans Runic",
      "Noto Sans SC", "Noto Sans Samaritan", "Noto Sans Saurashtra",
      "Noto Sans Shavian", "Noto Sans Sinhala", "Noto Sans Sundanese",
      "Noto Sans Syloti Nagri", "Noto Sans Symbols",
      "Noto Sans Syriac Eastern", "Noto Sans Syriac Estrangela", "Noto Sans Syriac Western",
      "Noto Sans TC", "Noto Sans Tagalog", "Noto Sans Tagbanwa",
      "Noto Sans Tai Le", "Noto Sans Tai Tham", "Noto Sans Tai Viet",
      "Noto Sans Tamil", "Noto Sans Telugu", "Noto Sans Thaana",
      "Noto Sans Thai", "Noto Sans Tibetan", "Noto Sans Tifinagh",
      "Noto Sans Ugaritic", "Noto Sans Vai", "Noto Sans Yi",
      "Open Sans Condensed", "Open Sans SemiCondensed",
      "Reem Kufi",
    ] },
    { group: "Display / Decorative", options: [
      "Caprasimo", "Lugrasimo", "Lumanosimo", "OpenDyslexic",
    ] },
    { group: "Symbols", options: [
      "DejaVu Math TeX Gyre", "Noto Color Emoji", "Noto Emoji", "OpenSymbol",
    ] },
  ];

  const sizes = [8, 9, 10, 10.5, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];

  function fontOptions(selected) {
    return fonts
      .map(
        (g) =>
          `<optgroup label="${g.group}">${g.options
            .map((f) => `<option value="${f}"${f === selected ? " selected" : ""}>${f}</option>`)
            .join("")}</optgroup>`
      )
      .join("");
  }

  function sizeOptions(selected) {
    return sizes
      .map((s) => `<option value="${s}"${String(s) === String(selected) ? " selected" : ""}>${s} pt</option>`)
      .join("");
  }

  function styleSection(key, def) {
    const prefs = existing[key] || {};
    const curFont = prefs.font || "Source Sans Pro";
    const curSize = prefs.fontSize || def.defaultSize;
    return `
  <fieldset style="margin:12px 0;padding:10px;border:1px solid #ccc;border-radius:4px">
    <legend><strong>${def.label}</strong></legend>
    <div><label>Font:</label> <select name="${key}_font">${fontOptions(curFont)}</select></div>
    <div><label>Size:</label> <select name="${key}_fontSize">${sizeOptions(curSize)}</select></div>
  </fieldset>`;
  }

  const sections = Object.entries(STYLE_DEFINITIONS).map(([key, def]) => styleSection(key, def)).join("\n");

  const saved = req.query.saved === "1" ? '<p style="color:green;font-weight:bold">Preferences saved!</p>' : "";
  const hasXcu = existing ? '<p style="color:green">&#10003; Active configuration loaded</p>' : '<p style="color:#888">Not yet configured</p>';

  res.send(`<!DOCTYPE html><html><head><title>Writer Defaults — ${user.name}</title>
<style>
body { font-family: Arial, sans-serif; margin: 20px; }
h1 { color: #333; }
label { display: inline-block; width: 140px; margin: 6px 0; }
select { padding: 4px; min-width: 200px; }
input[type=submit] { padding: 8px 20px; font-size: 14px; margin-top: 12px; }
fieldset { margin: 12px 0; padding: 10px; border: 1px solid #ccc; border-radius: 4px; }
legend { font-weight: bold; padding: 0 6px; }
</style></head><body>
<h1>Writer Defaults for ${user.name}</h1>
<a href="/">&larr; Back to Home</a>
${saved}
${hasXcu}
<form method="POST" action="/preferences">${sections}
  <div><input type="submit" value="Save Preferences"></div>
</form>
<p style="font-size:0.85em;color:#666">These settings generate a per-user XCU file loaded by Collabora Online. Font changes apply when you open a new Writer document.</p>
</body></html>`);
});

router.post("/preferences", (req, res) => {
  const user = req.session.user;
  const safeName = sanitizeUsername(user.name || user.id);
  const styles = {};

  for (const key of Object.keys(STYLE_DEFINITIONS)) {
    const font = req.body[`${key}_font`];
    const fontSize = req.body[`${key}_fontSize`];
    if (font && fontSize) {
      styles[key] = { font, fontSize };
    }
  }

  if (Object.keys(styles).length === 0) {
    return res.status(400).send("Missing required fields. <a href='/preferences'>Back</a>");
  }

  const xcuContent = generateWriterXcu(styles);
  const xcuDir = path.join(SETTINGS_DIR, "userconfig", "xcu");
  const xcuPath = path.join(xcuDir, `${safeName}_writer.xcu`);

  try {
    fs.mkdirSync(xcuDir, { recursive: true });
    fs.writeFileSync(xcuPath, xcuContent, "utf8");
  } catch (err) {
    console.error("Failed to save XCU:", err);
    return res.status(500).send("Failed to save preferences. <a href='/preferences'>Back</a>");
  }

  res.redirect("/preferences?saved=1");
});

// Create new document
router.post("/create/:createType", async (req, res) => {
  let { filename, currentpath } = req.body;
  currentpath = currentpath || "";
  const sanitizedName = filename.replace(/[\/\\?%*|"<>]/g, "").replace(/[ :]/g, "_");

  if (req.params.createType === "folder") {
    const rel = currentpath ? path.join(currentpath, sanitizedName) : sanitizedName;
    const dirPath = path.join(FILES_DIR, rel);
    const normDir = path.normalize(dirPath);
    if (!normDir.startsWith(path.normalize(FILES_DIR))) return res.send("Invalid path");
    try {
      await fs.promises.mkdir(dirPath, { recursive: true });
      res.redirect(`/?path=${encodeURIComponent(rel)}`);
      return;
    } catch (err) {
      console.error(err);
      res.send("Error creating folder. <a href='/'>Back</a>");
    }
  }
  filename = sanitizedName + "." + req.params.createType;
  const rel = currentpath ? path.join(currentpath, filename) : filename;
  const filePath = path.join(FILES_DIR, rel);
  const normFile = path.normalize(filePath);
  if (!normFile.startsWith(path.normalize(FILES_DIR))) return res.send("Invalid path");

  if (fs.existsSync(filePath)) return res.send("Error: File exists. <a href='/'>Back</a>");

  try {
    // Look up user's XCU font preferences for .docx files
    let fontPrefs = null;
    if (req.params.createType === "docx") {
      const safeName = sanitizeUsername(req.session.user.name || req.session.user.id);
      const existing = getExistingXcu(SETTINGS_DIR, safeName);
      if (existing && existing.Standard && existing.Standard.font) {
        fontPrefs = { font: existing.Standard.font, fontSize: existing.Standard.fontSize || "12" };
      }
    }

    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await createEmptyFile(filePath, req.params.createType, req.session.user.name, fontPrefs);
    const token = createFileToken(rel);
    res.redirect(`/edit?file=${encodeURIComponent(token)}`);
  } catch (err) {
    console.error(err);
    res.send("Error creating file. <a href='/'>Back</a>");
  }
});

// Session expired page
router.get("/session-expired", (req, res) => {
  res.send(`<!DOCTYPE html><html><head><title>Session Expired</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 20px; }
      h1 { color: #333; }
      a { text-decoration: none; color: #007BFF; }
      a:hover { text-decoration: underline; }
    </style>
    </head><body>
    <h1>Session Expired</h1>
    <p>Your session has expired. Please <a href="/auth/login">log in again</a>.</p>
  </body></html>`);
});

// Logout route for UI link
router.get("/logout", (req, res) => {
  try {
    req.session.destroy(() => {
      res.clearCookie("access_token", {
        httpOnly: true,
        secure: NODE_ENV === "production",
        sameSite: "lax",
      });
      res.redirect("/");
    });
  } catch (e) {
    res.clearCookie("access_token", {
      httpOnly: true,
      secure: NODE_ENV === "production",
      sameSite: "lax",
    });
    res.redirect("/");
  }
});

module.exports = router;
