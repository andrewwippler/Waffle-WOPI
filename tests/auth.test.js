"use strict";

const { expect } = require("chai");
const { agent, app } = require("./setup");
const { DEX_ISSUER, CLIENT_ID, MIDDLEWARE_SERVER } = require("../helpers/vars");

describe("Auth Routes", () => {
  describe("GET /auth/login", () => {
    it("should redirect to Dex OAuth login page", (done) => {
      agent
        .get("/auth/login")
        .expect(302)
        .end((err, res) => {
          if (err) return done(err);
          const expectedRedirect = `${DEX_ISSUER}/auth?client_id=${encodeURIComponent(CLIENT_ID)}&redirect_uri=${encodeURIComponent(`${MIDDLEWARE_SERVER}/auth/callback`)}&response_type=code&scope=openid%20email%20profile`;
          expect(res.headers.location).to.include("/auth?client_id=");
          done();
        });
    });
  });

  describe("GET /auth/callback", () => {
    it("should return 400 if no code parameter", (done) => {
      agent.get("/auth/callback").expect(400, done);
    });

    it("should handle missing id_token in response", (done) => {
      agent.get("/auth/callback").query({ code: "test-auth-code-123" }).expect(500, done);
    });
  });

  describe("GET /auth/logout", () => {
    it("should redirect to home and clear session", (done) => {
      agent
        .get("/auth/logout")
        .expect(302)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.headers.location).to.equal("/");
          done();
        });
    });
  });
});
