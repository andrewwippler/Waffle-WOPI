const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");
const {
  JWT_SECRET, DEX_ISSUER, SUPER_ADMIN_USER
} = require("./vars.js");

/**
 * Utility: create WOPI access token
 * @param {object} user - User object { id, name }
 * @param {string} fileId - File identifier
 * @param {boolean} canWrite - Permission flag
 * @returns {string} JWT token
 */
function createAccessToken(user, fileId, canWrite = true) {
  const payload = {
    userId: user.id,
    name: user.name,
    fileId,
    canWrite,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "10h" });
}

const client = jwksClient({
  jwksUri: `${DEX_ISSUER}/keys`
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, function(err, key) {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

function validateAccessToken(req, res, next) {
  const token =
    req.query.access_token ||
    req.headers["authorization"]?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: "Missing access token" });
  }

  // Try RS256 (Dex) first, fallback to local secret
  jwt.verify(token, getKey, { algorithms: ["RS256"] }, (err, decoded) => {
    if (!err) {
      req.wopi = decoded;
      req.wopi.canWrite = true;
      req.wopi.isAdminUser = decoded.name === SUPER_ADMIN_USER;
      return next();
    }
    // Fallback to local secret (HS256)
    try {
      req.wopi = jwt.verify(token, JWT_SECRET);
      req.wopi.canWrite = true;
      req.wopi.isAdminUser = decoded.name === SUPER_ADMIN_USER;
      return next();
    } catch (err2) {
      console.error("Invalid token:", err2.message);
      return res.status(401).json({ error: "Invalid or expired access token" });
    }
  });
}

/**
 * Middleware: login required
 */
function requireLogin(req, res, next) {
  if (!req.session.user) {
    req.session.redirectAfterLogin = req.originalUrl;
    return res.redirect("/auth/login");
  }
  next();
}

module.exports = {
  createAccessToken,
  validateAccessToken,
  requireLogin
};