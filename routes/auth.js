'use strict';

let express = require('express');
let router = express.Router();
const axios = require('axios');
const qs = require('qs');
const jwt = require('jsonwebtoken');

const { createAccessToken } = require("../helpers/middleware.js");

const {DEX_ISSUER, CLIENT_ID, CLIENT_SECRET, DOCUMENTSERVER_URL, MIDDLEWARE_SERVER, NODE_ENV } = require("../helpers/vars.js");

const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

// Dex login
router.get("/login", (req, res) => {
  const redirect_uri = `${MIDDLEWARE_SERVER}/auth/callback`;
  const authUrl = `${DEX_ISSUER}/auth?client_id=${encodeURIComponent(CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirect_uri)}&response_type=code&scope=openid%20email%20profile`;
  res.redirect(authUrl);
});

// Dex callback
router.get("/callback", async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) return res.status(400).send("Missing code");

    const tokenResp = await axios.post(
      `${DEX_ISSUER}/token`,
      qs.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${MIDDLEWARE_SERVER}/auth/callback`,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );


    const idToken = tokenResp.data.id_token;
    if (!idToken) return res.status(500).send("No id_token received");
    const server_url = await axios.get(`${MIDDLEWARE_SERVER}/wopi/collaboraUrl?server=` + encodeURIComponent(DOCUMENTSERVER_URL) +`&access_token=` + encodeURIComponent(idToken));

    if (!server_url.data.url) {
      console.error("No server url received:", server_url.data);
    }
    const userInfo = jwt.decode(idToken);
    if (!userInfo || !userInfo.sub) return res.status(500).send("Invalid id_token");

    req.session.user = {
      id: userInfo.sub,
      email: userInfo.email,
      access_token: idToken,
      server_url: server_url.data.url,
      settings_url: server_url.data.settings,
      name: userInfo.name || userInfo.preferred_username || userInfo.email || "Unnamed User"
    };

    const token = createAccessToken(req.session.user, null);
    res.cookie('access_token', token, { httpOnly: true, secure: NODE_ENV === "production", sameSite: 'lax', maxAge: COOKIE_MAX_AGE });
    res.redirect(req.session.redirectAfterLogin || '/');
  } catch (err) {
    console.error("Callback error:", err.response?.data || err.message);
    res.status(500).send("Authentication failed");
  }
});

// Logout
router.get("/logout", (req, res) => {
  req.session.destroy(err => {
    const logoutUrl = DEX_ISSUER ? (DEX_ISSUER.endsWith("/") ? `${DEX_ISSUER}logout` : `${DEX_ISSUER}/logout`) : "/";
    res.redirect("/");
  });
  res.clearCookie('access_token', { httpOnly: true, secure: NODE_ENV === "production", sameSite: 'lax' });
});

module.exports = router;
