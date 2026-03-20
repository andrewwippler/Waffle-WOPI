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
  const zip = await JSZip.loadFile(filePath);
  const coreXml = zip.file("docProps/core.xml");

  if (coreXml) {
    let xml = coreXml.asText();

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
 * Create an empty file at the given path.
 * @param {string} filePath - Full path where the file should be saved.
 * @param {string} fileType - The file type to create. Defaults to "docx".
 * @param {string} creator - The creator name to set in the document metadata. Defaults to 'Collabora Middleware'.
 * @returns {Promise<string>} Resolves with the file path once saved.
 */
async function createEmptyFile(filePath, fileType = "docx", creator = "Collabora Middleware") {
  const templateFile = path.join(TEMPLATES_DIR, TEMPLATE_MAP[fileType] || TEMPLATE_MAP.docx);

  if (!fs.existsSync(templateFile)) {
    throw new Error(`Template not found: ${templateFile}`);
  }

  fs.copyFileSync(templateFile, filePath);

  await updateDocumentMetadata(filePath, creator);

  return filePath;
}

module.exports = {
  createEmptyFile,
};
