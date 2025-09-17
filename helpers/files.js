const fs = require("fs");
const path = require("path");
const officegen = require("officegen");

/**
 * Create an empty file at the given path.
 * @param {string} filePath - Full path where the file should be saved.
 * @param {string} fileType - The file type to create. Defaults to "docx".
 * @param {string} creator - The creator name to set in the document metadata. Defaults to 'Collabora Middleware'.
 * @returns {Promise<string>} Resolves with the file path once saved.
 */
function createEmptyFile(filePath, fileType = "docx", creator = 'Collabora Middleware') {
  return new Promise((resolve, reject) => {
    const file = officegen({
      type: fileType,
      creator: creator,
    });

    // Add at least one sheet for Excel files
    if (fileType === "xlsx") {
      file.makeNewSheet();
    }
    // Add at least one slide for PowerPoint files
    if (fileType === "pptx") {
      file.makeNewSlide();
    }

    const out = fs.createWriteStream(filePath);

    out.on("error", err => reject(err));
    file.on("error", err => reject(err));
    out.on("close", () => resolve(filePath));

    file.generate(out);
  });
}

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

module.exports = {
  createEmptyFile,
  listSettingsFiles
};