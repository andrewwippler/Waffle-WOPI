const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const TEMPLATES_DIR = path.join(__dirname, "../templates");

const TEMPLATE_MAP = {
  docx: "document.docx",
  xlsx: "spreadsheet.xlsx",
  pptx: "presentation.pptx",
};

function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function updateDocumentMetadata(filePath, creator) {
  const fileData = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(fileData);
  const coreXml = zip.file("docProps/core.xml");

  if (coreXml) {
    let xml = await coreXml.async("string");

    xml = xml.replace(/(<dc:creator>)[^<]*(<\/dc:creator>)/, `$1${escapeXml(creator)}$2`);
    if (!xml.includes("<dc:creator>")) {
      const insertPoint = xml.indexOf("<cp:coreProperties");
      if (insertPoint !== -1) {
        const endTag = xml.indexOf(">", insertPoint);
        xml =
          xml.slice(0, endTag + 1) +
          `\n  <dc:creator>${escapeXml(creator)}</dc:creator>` +
          xml.slice(endTag + 1);
      }
    }

    xml = xml.replace(
      /(<cp:lastModifiedBy>)[^<]*(<\/cp:lastModifiedBy>)/,
      `$1${escapeXml(creator)}$2`
    );
    if (!xml.includes("<cp:lastModifiedBy>")) {
      const creatorEnd = xml.indexOf("</dc:creator>");
      if (creatorEnd !== -1) {
        xml =
          xml.slice(0, creatorEnd + 14) +
          `\n  <cp:lastModifiedBy>${escapeXml(creator)}</cp:lastModifiedBy>` +
          xml.slice(creatorEnd + 14);
      }
    }

    const dctermsModified = xml.includes("<dcterms:modified");
    if (dctermsModified) {
      const now = new Date().toISOString();
      xml = xml.replace(/(<dcterms:modified[^>]*>)[^<]*(<\/dcterms:modified>)/, `$1${now}$2`);
    }

    zip.file("docProps/core.xml", xml);
  }

  const content = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  fs.writeFileSync(filePath, content);

  return filePath;
}

/**
 * Apply font preferences to a .docx file's word/styles.xml
 * @param {string} docxPath - Path to the .docx file (modified in place)
 * @param {object} fontPrefs - { font, fontSize } where fontSize is in points
 */
async function applyFontToDocx(docxPath, fontPrefs) {
  const { font, fontSize } = fontPrefs;
  if (!font) return;

  const fileData = fs.readFileSync(docxPath);
  const zip = await JSZip.loadAsync(fileData);
  const stylesFile = zip.file("word/styles.xml");
  if (!stylesFile) return;

  let styles = await stylesFile.async("string");

  const safeFont = escapeXml(font);

  // Replace font name in w:rFonts attributes (ascii and hAnsi)
  styles = styles.replace(
    /(<w:rFonts\s+)((?:w:ascii=")[^"]*")(\s+)((?:w:hAnsi=")[^"]*")/g,
    `$1w:ascii="${safeFont}"$3w:hAnsi="${safeFont}"`
  );

  // Replace font size in w:sz and w:szCs if provided (size is in half-points)
  if (fontSize) {
    const halfPt = String(Math.round(parseFloat(fontSize) * 2));
    styles = styles.replace(/<w:sz w:val="\d+"\/>/g, `<w:sz w:val="${halfPt}"/>`);
    styles = styles.replace(/<w:szCs w:val="\d+"\/>/g, `<w:szCs w:val="${halfPt}"/>`);
  }

  zip.file("word/styles.xml", styles);
  const content = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  fs.writeFileSync(docxPath, content);
}

/**
 * Create an empty file at the given path.
 * @param {string} filePath - Full path where the file should be saved.
 * @param {string} fileType - The file type to create. Defaults to "docx".
 * @param {string} creator - The creator name to set in the document metadata. Defaults to 'Collabora Middleware'.
 * @param {object} [fontPrefs] - Optional font preferences { font, fontSize } to apply to .docx files
 * @returns {Promise<string>} Resolves with the file path once saved.
 */
async function createEmptyFile(filePath, fileType = "docx", creator = "Collabora Middleware", fontPrefs) {
  const templateFile = path.join(TEMPLATES_DIR, TEMPLATE_MAP[fileType] || TEMPLATE_MAP.docx);

  if (!fs.existsSync(templateFile)) {
    throw new Error(`Template not found: ${templateFile}`);
  }

  const tmpPath = filePath + ".tmp";
  fs.copyFileSync(templateFile, tmpPath);
  await updateDocumentMetadata(tmpPath, creator);

  // Apply font preferences to .docx files
  if (fontPrefs && fileType === "docx") {
    await applyFontToDocx(tmpPath, fontPrefs);
  }

  fs.renameSync(tmpPath, filePath);

  return filePath;
}

/**
 * Recursively list all files under a directory, returning relative paths.
 * @param {string} dir - The directory to scan
 * @param {string} prefix - Internal prefix for recursion
 * @returns {string[]} Array of file paths relative to dir
 */
function listFilesRecursive(dir, prefix = "") {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir);
  let files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const relPath = prefix ? `${prefix}/${entry}` : entry;
    if (fs.statSync(fullPath).isDirectory()) {
      files = files.concat(listFilesRecursive(fullPath, relPath));
    } else {
      files.push(relPath);
    }
  }
  return files;
}

/**
 * List settings files from SETTINGS_DIR, optionally filtered by type.
 * @param {string} settingsDir - Base settings directory
 * @param {string} middlewareServer - The middleware server URL for building URIs
 * @param {string} [type] - Optional filter: "userconfig" or "systemconfig"
 * @returns {object[]} Array of setting file objects { name, uri, stamp }
 */
function listSettingsFiles(settingsDir, middlewareServer, type) {
  const base = type ? path.join(settingsDir, type) : settingsDir;
  if (!fs.existsSync(base)) return [];
  const files = listFilesRecursive(base);
  return files.map((f) => {
    const fullPath = path.join(base, f);
    const key = type ? `${type}/${f}` : f;
    return {
      name: f,
      uri: `${middlewareServer}/wopi/settings/files/${key}`,
      stamp: fs.statSync(fullPath).mtimeMs.toString(),
    };
  });
}

/**
 * Sanitize a username for use in file paths
 * @param {string} name - Raw username
 * @returns {string} Sanitized name
 */
function sanitizeUsername(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^_+|_+$/g, "");
}

/**
 * Convert font size in pt to XCU hundredths of mm (pt * 20)
 * @param {string|number} pt - Font size in points
 * @returns {number} XCU integer value
 */
function ptToXcuSize(pt) {
  return Math.round(parseFloat(pt) * 20);
}

/**
 * Style definitions for Writer Basic Fonts (Western)
 * Maps internal keys to XCU paths and display labels
 */
const STYLE_DEFINITIONS = {
  Standard: { label: "Default (Body Text)", xcuPath: "Standard", xcuHeightPath: "StandardHeight", defaultSize: "12" },
  Heading: { label: "Heading", xcuPath: "Heading", xcuHeightPath: "HeadingHeight", defaultSize: "14" },
  List: { label: "List", xcuPath: "List", xcuHeightPath: "ListHeight", defaultSize: "12" },
  Caption: { label: "Caption", xcuPath: "Caption", xcuHeightPath: "CaptionHeight", defaultSize: "11" },
  Index: { label: "Index", xcuPath: "Index", xcuHeightPath: "IndexHeight", defaultSize: "11" },
};

/**
 * Generate XCU XML for Writer default fonts
 * @param {object} styles - Map of style key → { font, fontSize }, e.g. { Standard: { font: "Source Sans Pro", fontSize: "12" }, Heading: {...} }
 * @returns {string} XCU XML content
 */
function generateWriterXcu(styles) {
  const items = Object.entries(STYLE_DEFINITIONS).map(([key, def]) => {
    const s = styles[key] || {};
    const font = escapeXml(s.font || "Source Sans Pro");
    const size = ptToXcuSize(s.fontSize || def.defaultSize);
    return `
  <item oor:path="/org.openoffice.Office.Writer/DefaultFont/${def.xcuPath}">
    <prop oor:name="Value" oor:op="fuse" oor:type="xs:string">
      <value>${font}</value>
    </prop>
  </item>
  <item oor:path="/org.openoffice.Office.Writer/DefaultFont/${def.xcuHeightPath}">
    <prop oor:name="Value" oor:op="fuse" oor:type="xs:int">
      <value>${size}</value>
    </prop>
  </item>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry"
           xmlns:xs="http://www.w3.org/2001/XMLSchema"
           xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${items}
</oor:items>`;
}

/**
 * Read an existing user XCU file and extract preferences
 * @param {string} settingsDir - SETTINGS_DIR path
 * @param {string} username - Sanitized username
 * @returns {object|null} Map of style key → { font, fontSize } or null
 */
function getExistingXcu(settingsDir, username) {
  const xcuPath = path.join(settingsDir, "userconfig", "xcu", `${username}_writer.xcu`);
  if (!fs.existsSync(xcuPath)) return null;

  const content = fs.readFileSync(xcuPath, "utf8");
  const result = {};
  let hasAny = false;

  for (const [key, def] of Object.entries(STYLE_DEFINITIONS)) {
    const fontMatch = content.match(
      new RegExp(`<item oor:path="/org\\.openoffice\\.Office\\.Writer/DefaultFont/${def.xcuPath}">[\\s\\S]*?<value>([^<]+)</value>`)
    );
    const sizeMatch = content.match(
      new RegExp(`<item oor:path="/org\\.openoffice\\.Office\\.Writer/DefaultFont/${def.xcuHeightPath}">[\\s\\S]*?<value>(\\d+)</value>`)
    );

    if (fontMatch) {
      result[key] = { font: fontMatch[1] };
      hasAny = true;
      if (sizeMatch) {
        result[key].fontSize = String(parseInt(sizeMatch[1], 10) / 20);
      }
    }
  }

  return hasAny ? result : null;
}

/**
 * Generate a minimal .ott template buffer with default paragraph and page styles
 * @returns {Promise<Buffer>} .ott file buffer
 */
async function generateOttTemplate() {
  const zip = new JSZip();

  zip.file("mimetype", "application/vnd.oasis.opendocument.text-template", { compress: false });

  zip.file("content.xml", `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  office:version="1.2">
  <office:body>
    <office:text/>
  </office:body>
</office:document-content>`);

  zip.file("styles.xml", `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
  office:version="1.2">
  <office:styles>
    <style:default-style style:family="paragraph">
      <style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0cm" fo:line-height="100%"/>
      <style:text-properties style:font-name="Source Sans Pro" fo:font-size="12pt"/>
    </style:default-style>
    <style:default-style style:family="page-layout">
      <style:page-layout-properties fo:margin-left="2cm" fo:margin-right="2cm"
        fo:margin-top="2cm" fo:margin-bottom="2cm"/>
    </style:default-style>
  </office:styles>
  <office:automatic-styles>
    <style:page-layout style:name="Mpm1">
      <style:page-layout-properties fo:page-width="21.001cm" fo:page-height="29.7cm"
        fo:margin-left="2cm" fo:margin-right="2cm"
        fo:margin-top="2cm" fo:margin-bottom="2cm"/>
    </style:page-layout>
  </office:automatic-styles>
  <office:master-styles>
    <style:master-page style:name="Standard" style:page-layout-name="Mpm1"/>
  </office:master-styles>
</office:document-styles>`);

  zip.file("META-INF/manifest.xml", `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"
  manifest:version="1.2">
  <manifest:file-entry manifest:full-path="/" manifest:version="1.2"
    manifest:media-type="application/vnd.oasis.opendocument.text-template"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`);

  return await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

module.exports = {
  createEmptyFile,
  applyFontToDocx,
  listFilesRecursive,
  listSettingsFiles,
  sanitizeUsername,
  generateWriterXcu,
  getExistingXcu,
  generateOttTemplate,
  STYLE_DEFINITIONS,
};
