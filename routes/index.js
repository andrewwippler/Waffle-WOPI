"use strict";

let express = require("express");
let router = express.Router();
const fs = require("fs");
const path = require("path");

const { createEmptyFile } = require("../helpers/files.js");

const { MIDDLEWARE_SERVER, FILES_DIR } = require("../helpers/vars.js");

router.get("/", (req, res) => {
  const user = req.session.user;
  const supportedExtensions = [".docx", ".xlsx", ".pptx"];
  const files = fs
    .readdirSync(FILES_DIR)
    .filter((f) => supportedExtensions.some((ext) => f.endsWith(ext)));
  const fileLinks = files.length
    ? files
        .map(
          (f) => `<li><a href="/edit/${encodeURIComponent(f)}">${f}</a> ---
            <button onclick="deleteFile('${encodeURIComponent(f)}')">Delete</button>
          </li>`
        )
        .join("")
    : "<li>No documents yet</li>";

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
    <ul>${fileLinks}</ul>

<script src="/javascripts/deleteFile.js"></script>

    <h3>Create New Document</h3>
    <form method="POST" id="createForm">
      <input type="text" name="filename" placeholder="Document name" required />
      <select name="filetype" id="filetype">
        <option value="docx">Word (.docx)</option>
        <option value="xlsx">Excel (.xlsx)</option>
        <option value="pptx">PowerPoint (.pptx)</option>
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

  // <a href="/settings?access_token=${user.access_token}&iframe_type=user" >User Settings</a> |
  // <a href="/settings?access_token=${user.access_token}&iframe_type=admin" >Admin Settings</a>
});

// Edit document with Collabora (WOPI)
router.get("/edit/:filename", (req, res) => {
  const fileId = req.params.filename;
  const filePath = path.join(FILES_DIR, fileId);
  if (!fs.existsSync(filePath)) return res.status(404).send("File not found");
  // server_url ends with ?
  const wopiSrc = `WOPISrc=${MIDDLEWARE_SERVER}/wopi/files/${encodeURIComponent(
    fileId
  )}`;
  let source = req.session.user.server_url + wopiSrc;
  res.send(`<!DOCTYPE html><html><head><title>Edit ${fileId} @ ${MIDDLEWARE_SERVER}</title>
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

router.delete("/edit/:filename", async (req, res) => {
  const fileId = req.params.filename;
  const filePath = path.join(FILES_DIR, fileId);
  try {
    await fs.promises.unlink(filePath);
    res.send("File deleted successfully.");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error deleting file.");
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
router.post("/create/:fileType", async (req, res) => {
  let { filename } = req.body;
  filename =
    filename.replace(/[\/\\?%*|"<>]/g, "").replace(/[ :]/g, "_") +
    "." +
    req.params.fileType;
  const filePath = path.join(FILES_DIR, filename);

  if (fs.existsSync(filePath))
    return res.send("Error: File exists. <a href='/'>Back</a>");

  try {
    await createEmptyFile(filePath, req.params.fileType, req.session.user.name);
    res.redirect(`/edit/${encodeURIComponent(filename)}`);
  } catch (err) {
    console.error(err);
    res.send("Error creating file. <a href='/'>Back</a>");
  }
});

module.exports = router;
