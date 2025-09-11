'use strict';

let express = require('express');
let router = express.Router();

const fs = require("fs");
const path = require("path");
let http = require('http');
let https = require('https');
let Dom = require('@xmldom/xmldom').DOMParser;
let xpath = require('xpath');
const multer = require('multer');
const upload = multer({ dest: '/tmp' })

const {DOCUMENTSERVER_URL, FILES_DIR, SETTINGS_DIR, MIDDLEWARE_SERVER } = require("../helpers/vars.js");
const { on } = require('events');

/* *
 *  wopi CheckFileInfo endpoint
 *
 *  Returns info about the file with the given document id.
 *  The response has to be in JSON format and at a minimum it needs to include
 *  the file name and the file size.
 *  The CheckFileInfo wopi endpoint is triggered by a GET request at
 *  https://HOSTNAME/wopi/files/<document_id>
 */
router.get('/files/:fileId', function(req, res) {
	console.log('file id: ' + req.params.fileId);
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
      Version: stats.mtimeMs.toString()
    };
  console.log(json);
    res.json(json);

});

/* *
 *  wopi GetFile endpoint
 *
 *  Given a request access token and a document id, sends back the contents of the file.
 *  The GetFile wopi endpoint is triggered by a request with a GET verb at
 *  https://HOSTNAME/wopi/files/<document_id>/contents
 */
router.get('/files/:fileId/contents', function(req, res) {
	// we just return the content of a fake text file
	// in a real case you should use the file id
	// for retrieving the file from the storage and
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
router.post('/files/:fileId/contents', function(req, res) {
	// we log to the console so that is possible
	// to check that saving has triggered this wopi endpoint
  console.log('wopi PutFile endpoint');

  if (!req.wopi.canWrite) {
    return res.status(403).json({ error: "Read-only access" });
  }

  const filepath = path.join(FILES_DIR, req.params.fileId);

	if (req.body) {
      fs.writeFileSync(filepath, req.body);
      res.sendStatus(200);
	} else {
		console.log('Not possible to get the file content.');
		res.sendStatus(404);
	}
});

router.get('/collaboraUrl', function(req, res) {
    let collaboraOnlineHost = DOCUMENTSERVER_URL;
    let httpClient = collaboraOnlineHost.startsWith('https') ? https : http;
    let data = '';
    let request = httpClient.get(collaboraOnlineHost + '/hosting/discovery', function (response) {
        response.on('data', function(chunk) { data += chunk.toString(); });
        response.on('end', function() {
            if (response.statusCode !== 200) {
                let err = 'Request failed. Satus Code: ' + response.statusCode;
                response.resume();
                res.status(response.statusCode).send(err);
                console.log(err)
                return;
            }
            if (!response.complete) {
                let err = 'No able to retrieve the discovery.xml file from the Collabora Online server with the submitted address.';
                res.status(404).send(err);
                console.log(err);
                return;
            }
            let doc = new Dom().parseFromString(data);
            if (!doc) {
                let err = 'The retrieved discovery.xml file is not a valid XML file'
                res.status(404).send(err)
                console.log(err);
                return;
            }
            let mimeType = 'text/plain';
          let nodes = xpath.select("/wopi-discovery/net-zone/app[@name='" + mimeType + "']/action", doc);
          let settings = xpath.select("/wopi-discovery/net-zone/app[@name='Settings']/action", doc);
            if (!nodes || nodes.length !== 1) {
                let err = 'The requested mime type is not handled'
                res.status(404).send(err);
                console.log(err);
                return;
            }
          let onlineUrl = nodes[0].getAttribute('urlsrc');
          let onlineSettingsUrl = settings[0].getAttribute('urlsrc');

            res.json({
              url: onlineUrl,
              settings: onlineSettingsUrl
            });
        });
        response.on('error', function(err) {
            res.status(404).send('Request error: ' + err);
            console.log('Request error: ' + err.message);
        });
    });
});

// Utility: recursively list files in a directory
function listSettingsFiles(dir, baseUrl, kind = 'userconfig') {

  if (kind === 'userconfig') {
    realDir = path.join(dir, 'userconfig');
    realKind = 'user';
  } else if (kind === 'systemconfig') {
    realDir = path.join(dir, 'systemconfig');
    realKind = 'shared';
  } else {
    throw new Error('Invalid kind parameter');
  }
  const response = {
    kind: realKind,
    autotext: [],
    xcu: [],
    browsersetting: []
  };

  function walk(currentDir, relPath = "") {
    const files = fs.readdirSync(currentDir);
    for (const file of files) {
      const fullPath = path.join(currentDir, file);
      const relFilePath = path.join(relPath, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath, relFilePath);
      } else {
        const uri = `${baseUrl}/settings/${relFilePath.replace(/\\/g, "/")}`;
        const stamp = stat.mtimeMs.toString();

        // Categorize by path
        if (relFilePath.includes('autotext')) {
          response.autotext.push({ stamp, uri });
        } else if (relFilePath.includes('xcu')) {
          response.xcu.push({ stamp, uri });
        } else if (relFilePath.includes('browsersetting')) {
          response.browsersetting.push({ stamp, uri });
        }
      }
    }
  }
  walk(realDir);
  return response;
}

// e.g. settings/userconfig/xcu/paragraphStyles.xcu
// e.g. settings/systemconfig/xcu/defaultStyles.xcu
// see https://sdk.collaboraonline.com/docs/configuration/admin/admin.html

router.get('/settings', (req, res) => {
    const { type } = req.query;

    let response = {};
   try {
    const files = listSettingsFiles(SETTINGS_DIR, MIDDLEWARE_SERVER);
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }

  if (type === 'userconfig') {

    response = listSettingsFiles(SETTINGS_DIR, MIDDLEWARE_SERVER, 'userconfig');
    } else if (type === 'systemconfig') {
    response = listSettingsFiles(SETTINGS_DIR, MIDDLEWARE_SERVER, 'systemconfig');

    } else {
        return res.status(400).json({ error: 'Invalid type parameter' });
    }

    res.json(response);
});

// TODO: Save settings to files
// e.g. settings/userconfig/xcu/paragraphStyles.xcu
// e.g. settings/systemconfig/xcu/defaultStyles.xcu
// see https://sdk.collaboraonline.com/docs/configuration/admin/admin.html
router.post('/settings/upload', upload.single('file'), (req, res) => {
    const { fileId } = req.query;

    if (!fileId || !req.file) {
        return res.status(400).json({ error: "Missing fileId or file" });
    }

    // Build target path
    const parts = fileId.split('/').filter(Boolean); // remove empty strings
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
            uri: `https://${MIDDLEWARE_SERVER}/${fileId}`
        }
    });
});
module.exports = router;
