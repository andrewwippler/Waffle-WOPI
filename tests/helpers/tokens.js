"use strict";

const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../../helpers/vars");

function createTestToken(payload = {}) {
  const defaultPayload = {
    userId: "test-user-123",
    name: "Test User",
    canWrite: true,
  };
  return jwt.sign({ ...defaultPayload, ...payload }, JWT_SECRET, { expiresIn: "1h" });
}

function createTestAccessToken(fileId = null, canWrite = true) {
  const payload = {
    userId: "test-user-123",
    name: "Test User",
    fileId,
    canWrite,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });
}

module.exports = {
  createTestToken,
  createTestAccessToken,
};
