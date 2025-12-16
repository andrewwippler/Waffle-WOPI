"use strict";

let express = require("express");
let router = express.Router();
const fs = require("fs");
const path = require("path");

const { createEmptyFile } = require("../helpers/files.js");
const { createFileToken, decodeFileToken } = require("../helpers/filetoken.js");

const { MIDDLEWARE_SERVER, FILES_DIR } = require("../helpers/vars.js");

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
  const files = entries.filter((e) => fs.statSync(path.join(absDir, e)).isFile() && supportedExtensions.some((ext) => e.endsWith(ext))).sort();

  function joinRel(name) {
    return relPath ? path.join(relPath, name).replace(/\\/g, "/") : name;
  }

  const fileLinks = `
    ${dirs.length ? dirs.map(d => {
      const token = createFileToken(joinRel(d));
      return `<li>📁 <a href="/?path=${encodeURIComponent(joinRel(d))}">${d}</a> --- <button onclick="deleteFile('${encodeURIComponent(token)}')">Delete</button></li>`
    }).join('') : ''}
    ${files.length ? files.map(f => {
      const token = createFileToken(joinRel(f));
      return `<li>📄 <a href="/edit?file=${encodeURIComponent(token)}">${f}</a> --- <button onclick="deleteFile('${encodeURIComponent(token)}')">Delete</button></li>`
    }).join('') : ''}
    ${dirs.length === 0 && files.length === 0 ? '<li>No documents yet</li>' : ''}
  `;

  // Breadcrumbs
  const parts = relPath ? relPath.split(/[\\/]/).filter(Boolean) : [];
  let crumbPath = "";
  const breadcrumbs = ['<a href="/">Home</a>'].concat(parts.map(p => {
    crumbPath = crumbPath ? `${crumbPath}/${p}` : p;
    return `<a href="/?path=${encodeURIComponent(crumbPath)}">${p}</a>`;
  })).join(' / ');

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
    <a href="/logout">Logout</a>
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

// <a href="/settings?access_token=${user.access_token}&iframe_type=user" >User Settings</a> |
// <a href="/settings?access_token=${user.access_token}&iframe_type=admin" >Admin Settings</a>

// Edit document with Collabora (WOPI)
router.get("/edit", (req, res) => {
  const token = req.query.file;
  if (!token) return res.status(400).send("Missing file parameter");
  let rel;
  try {
    rel = decodeFileToken(token);
  } catch (e) {
    return res.status(400).send("Invalid file token");
  }
  const filePath = path.join(FILES_DIR, rel);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return res.status(404).send("File not found");
  // server_url ends with ?
  const wopiSrc = `WOPISrc=${MIDDLEWARE_SERVER}/wopi/files/${encodeURIComponent(token)}`;
  let source = req.session.user.server_url + wopiSrc;
  res.send(`<!DOCTYPE html><html><head><title>Edit ${path.basename(rel)} @ ${MIDDLEWARE_SERVER}</title>
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
    <input name="access_token" value="${req.session.user.access_token}" type="hidden" id="access-token"/>
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
  if (!token) return res.status(400).json({ error: 'Missing file parameter' });
  let rel;
  try {
    rel = decodeFileToken(token);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid token' });
  }
  const filePath = path.join(FILES_DIR, rel);
  const normFile = path.normalize(filePath);
  if (!normFile.startsWith(path.normalize(FILES_DIR))) return res.status(400).json({ error: 'Invalid path' });
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
      if (total > 0 && req.query.confirm !== '1') {
        return res.status(409).json({ error: 'Directory not empty', needsConfirmation: true, entries: total });
      }
      // proceed to remove (confirmed or empty)
      await fs.promises.rm(filePath, { recursive: true, force: true });
      return res.send("Deleted successfully.");
    }

    // it's a file, delete directly
    await fs.promises.unlink(filePath);
    res.send("Deleted successfully.");
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'Not found' });
    console.error(err);
    res.status(500).json({ error: 'Error deleting' });
  }
});

router.get("/settings", (req, res) => {
  // Example query parameters
  const { access_token, iframe_type } = req.query;

  // iframe_type: "user" or "admin"
  const type = iframe_type === "admin" ? "admin" : "user";

  // Build iframe URL (Collabora expects a POST normally, but can also be set via form)
  const iframeSrc = req.session.user.settings_url;

  // HTML page with form post to Collabora iframe
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Collabora Settings</title>
<style>
html, body { margin: 0; padding: 0; height: 100%; width: 100%; overflow: hidden; }
#collabora-settings-iframe { border: none; width: 100%; height: 100vh; }
</style>
</head>
<body>
<form id="settingsForm" action="${iframeSrc}" method="post" enctype="multipart/form-data" target="collabora-settings-iframe">
    <input type="hidden" name="access_token" value="${access_token}">
    <input type="hidden" name="iframe_type" value="${type}">
    <input type="hidden" name="wopi_setting_base_url" value="${MIDDLEWARE_SERVER}/wopi/settings">
    <!-- Optional: pass theme or CSS variables -->
    <input type="hidden" name="ui_theme" value="light">
</form>

<iframe id="collabora-settings-iframe" name="collabora-settings-iframe"></iframe>

<script>
    // Auto-submit the form to load iframe
    document.getElementById('settingsForm').submit();
</script>
</body>
</html>
`;

  res.send(html);
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
    // ensure directory exists
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await createEmptyFile(filePath, req.params.createType, req.session.user.name);
    const token = createFileToken(rel);
    res.redirect(`/edit?file=${encodeURIComponent(token)}`);
  } catch (err) {
    console.error(err);
    res.send("Error creating file. <a href='/'>Back</a>");
  }
});

module.exports = router;
