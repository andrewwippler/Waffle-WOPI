const iconv = require("iconv-lite");

const B64CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function b64decode(str) {
  let output = "";
  str = str.replace(/=+$/, "");
  for (let i = 0; i < str.length; i += 4) {
    const a = B64CHARS.indexOf(str[i] || "A");
    const b = B64CHARS.indexOf(str[i + 1] || "A");
    const c = B64CHARS.indexOf(str[i + 2] || "A");
    const d = B64CHARS.indexOf(str[i + 3] || "A");
    const v = (a << 18) | (b << 12) | (c << 6) | d;
    output += String.fromCharCode((v >> 16) & 255);
    if (str[i + 2] !== undefined && str[i + 2] !== "=") {
      output += String.fromCharCode((v >> 8) & 255);
    }
    if (str[i + 3] !== undefined && str[i + 3] !== "=") {
      output += String.fromCharCode(v & 255);
    }
  }
  return output;
}

function decode(str) {
  return str.replace(/&([^-]*)-/g, (_, chunk) => {
    if (chunk === "") return "&";
    const decoded = b64decode(chunk.replace(/,/g, "/"));
    try {
      return iconv.decode(Buffer.from(decoded, "binary"), "UTF-16BE");
    } catch (e) {
      return decoded;
    }
  });
}

module.exports = { decode };
