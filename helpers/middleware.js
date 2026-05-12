const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");
const {
  JWT_SECRET,
  DEX_ISSUER,
  SUPER_ADMIN_USER,
  TOKEN_ENDPOINT,
  CLIENT_ID,
  CLIENT_SECRET,
  NODE_ENV,
  MIDDLEWARE_SERVER,
} = require("./vars.js");

const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

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
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

function isTokenExpiringSoon(token, leeway = 86400) {
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
  const refresh = req.session?.user?.refresh_token;
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

function issueAccessTokenCookie(req, res, user) {
  const token = createAccessToken(user, null);
  res.cookie("access_token", token, {
    httpOnly: true,
    secure: NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
  });
  return token;
}

const client = jwksClient({
  jwksUri: `${DEX_ISSUER}/keys`,
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, function (err, key) {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

async function validateAccessToken(req, res, next) {
  let token =
    req.query.access_token ||
    req.headers["authorization"]?.replace("Bearer ", "") ||
    req.cookies?.access_token;

  if (!token) {
    return res.status(401).json({ error: "Missing access token" });
  }

  const cookieToken = req.cookies?.access_token;
  if (cookieToken && isTokenExpiringSoon(cookieToken) && req.session?.user) {
    try {
      await refreshAccessToken(req);
      token = issueAccessTokenCookie(req, res, req.session.user);
    } catch (e) {
      console.error("Token refresh error:", e.message);
    }
  }

  return new Promise((resolve) => {
    jwt.verify(token, getKey, { algorithms: ["RS256"] }, (err, decoded) => {
      if (!err) {
        req.wopi = decoded;
        req.wopi.canWrite = true;
        req.wopi.isAdminUser = decoded.name === SUPER_ADMIN_USER;
        next();
        resolve();
        return;
      }
      try {
        req.wopi = jwt.verify(token, JWT_SECRET);
        req.wopi.isAdminUser = req.wopi.name === SUPER_ADMIN_USER;
        next();
        resolve();
      } catch (err2) {
        console.error("Invalid token:", err2.message);
        res.redirect("/auth/login");
        resolve();
      }
    });
  });
}

/**
 * Middleware: login required
 */
function requireLogin(req, res, next) {
  if (req.wopi) {
    return next();
  }

  if (req.cookies?.access_token) {
    return validateAccessToken(req, res, next);
  }

  if (req.session?.user) {
    return next();
  }

  req.session.redirectAfterLogin = req.originalUrl;
  return res.redirect("/auth/login");
}

module.exports = {
  createAccessToken,
  validateAccessToken,
  requireLogin,
  isTokenExpiringSoon,
  refreshAccessToken,
};
