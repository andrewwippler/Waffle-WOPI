import fs from "fs";
import officegen from "officegen";

/**
 * Create an empty .docx file at the given path.
 * @param {string} filePath - Full path where the docx file should be saved.
 * @returns {Promise<string>} Resolves with the file path once saved.
 */
export function createEmptyDocx(filePath) {

  return new Promise((resolve, reject) => {
    const docx = officegen("docx");
    const out = fs.createWriteStream(filePath);

    out.on("error", err => reject(err));
    docx.on("error", err => reject(err));
    out.on("close", () => resolve(filePath));

    docx.generate(out);
  });
}
