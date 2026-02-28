"use strict";

require("dotenv").config({ path: ".env.test" });

const path = require("path");
const fs = require("fs");
const nock = require("nock");
const jwt = require("jsonwebtoken");

const app = require("../app");
const request = require("supertest");

const { FILES_DIR, SETTINGS_DIR, JWT_SECRET } = require("../helpers/vars");
const { setupDexMocks } = require("./mocks/dex");
const { setupCollaboraMocks } = require("./mocks/collabora");

function createTestAccessToken(fileId = null, canWrite = true) {
  const payload = {
    userId: "test-user-123",
    name: "Test User",
    fileId,
    canWrite,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });
}

const testAccessToken = createTestAccessToken();

const testAgent = request.agent(app);

function setupTestEnvironment() {
  if (!fs.existsSync(FILES_DIR)) {
    fs.mkdirSync(FILES_DIR, { recursive: true });
  }
  if (!fs.existsSync(SETTINGS_DIR)) {
    fs.mkdirSync(SETTINGS_DIR, { recursive: true });
  }

  const fixturesDir = path.join(__dirname, "fixtures");
  const testFile = path.join(FILES_DIR, "test.txt");
  if (!fs.existsSync(testFile)) {
    const fixtureContent = fs.readFileSync(path.join(fixturesDir, "test.txt"), "utf8");
    fs.writeFileSync(testFile, fixtureContent);
  }
}

function clearTestFiles() {
  if (fs.existsSync(FILES_DIR)) {
    const files = fs.readdirSync(FILES_DIR);
    for (const file of files) {
      const filePath = path.join(FILES_DIR, file);
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        // Ignore errors
      }
    }
  }

  if (fs.existsSync(SETTINGS_DIR)) {
    const clearDir = (dir) => {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const itemPath = path.join(dir, item);
        if (fs.statSync(itemPath).isDirectory()) {
          clearDir(itemPath);
          fs.rmdirSync(itemPath);
        } else {
          fs.unlinkSync(itemPath);
        }
      }
    };
    try {
      clearDir(SETTINGS_DIR);
    } catch (e) {
      // Ignore errors
    }
  }
}

before(function (done) {
  setupTestEnvironment();
  setupDexMocks();
  setupCollaboraMocks();
  done();
});

afterEach(function () {
  nock.cleanAll();
  setupDexMocks();
  setupCollaboraMocks();
});

after(function () {
  clearTestFiles();
});

module.exports = {
  app,
  request,
  agent: testAgent,
  accessToken: testAccessToken,
  createTestAccessToken,
  FILES_DIR,
  SETTINGS_DIR,
};
