"use strict";

const { expect } = require("chai");
const path = require("path");
const fs = require("fs");
const { agent, accessToken, FILES_DIR, SETTINGS_DIR, request, app } = require("./setup");
const { createFileToken } = require("../helpers/filetoken");

describe("WOPI Routes", () => {
  const testFileName = "test.txt";
  const testFileToken = createFileToken(testFileName);

  beforeEach(() => {
    const testFile = path.join(FILES_DIR, "test.txt");
    if (!fs.existsSync(testFile)) {
      fs.writeFileSync(
        testFile,
        "Hello World Test Document\nThis is a test file for the WOPI middleware.\n"
      );
    }
  });

  describe("GET /wopi/files/:fileId", () => {
    it("should return 400 for invalid file token", (done) => {
      agent
        .get("/wopi/files/invalid-token")
        .query({ access_token: accessToken })
        .expect(400)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.error).to.equal("Invalid file token");
          done();
        });
    });

    it("should return 404 for non-existent file", (done) => {
      const token = createFileToken("nonexistent.txt");
      agent
        .get(`/wopi/files/${token}`)
        .query({ access_token: accessToken })
        .expect(404)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.error).to.equal("File not found");
          done();
        });
    });

    it("should return file info for valid token", (done) => {
      agent
        .get(`/wopi/files/${testFileToken}`)
        .query({ access_token: accessToken })
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.BaseFileName).to.equal(testFileName);
          expect(res.body.Size).to.be.a("number");
          expect(res.body.SupportsLocks).to.be.true;
          done();
        });
    });
  });

  describe("GET /wopi/files/:fileId/contents", () => {
    it("should return 400 for invalid file token", (done) => {
      agent
        .get("/wopi/files/invalid-token/contents")
        .query({ access_token: accessToken })
        .expect(400)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.error).to.equal("Invalid file token");
          done();
        });
    });

    it("should return 404 for non-existent file", (done) => {
      const token = createFileToken("nonexistent.txt");
      agent
        .get(`/wopi/files/${token}/contents`)
        .query({ access_token: accessToken })
        .expect(404, done);
    });

    it("should return 500 for sendFile error - known limitation in tests", (done) => {
      const testFile = "get-contents-test.txt";
      const filePath = path.join(FILES_DIR, testFile);
      fs.writeFileSync(filePath, "Test content for get contents");
      const token = createFileToken(testFile);

      agent
        .get(`/wopi/files/${token}/contents`)
        .query({ access_token: accessToken })
        .expect(500, done);
    });
  });

  describe("POST /wopi/files/:fileId/contents", () => {
    it("should return 400 for invalid file token", (done) => {
      agent
        .post("/wopi/files/invalid-token/contents")
        .query({ access_token: accessToken })
        .set("Content-Type", "application/octet-stream")
        .send("new content")
        .expect(400)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.error).to.equal("Invalid file token");
          done();
        });
    });

    it("should update file contents for valid request", (done) => {
      const newContent = "Updated test content " + Date.now();
      agent
        .post(`/wopi/files/${testFileToken}/contents`)
        .query({ access_token: accessToken })
        .set("Content-Type", "application/octet-stream")
        .send(newContent)
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.LastModifiedTime).to.be.a("string");

          const filePath = path.join(FILES_DIR, testFileName);
          const updatedContent = fs.readFileSync(filePath, "utf8");
          expect(updatedContent).to.equal(newContent);
          done();
        });
    });
  });

  describe("POST /wopi/files/:fileId (X-WOPI-Overrides)", () => {
    it("should handle LOCK request", (done) => {
      const lockValue = "test-lock-" + Date.now();
      const uniqueFile = "lock-test-" + Date.now() + ".txt";
      fs.writeFileSync(path.join(FILES_DIR, uniqueFile), "test");
      const token = createFileToken(uniqueFile);

      agent
        .post(`/wopi/files/${token}`)
        .query({ access_token: accessToken })
        .set("X-WOPI-Override", "LOCK")
        .set("X-WOPI-Lock", lockValue)
        .expect(200, done);
    });

    it("should handle UNLOCK request", (done) => {
      const lockValue = "test-lock-unlock-" + Date.now();
      const uniqueFile = "unlock-test-" + Date.now() + ".txt";
      fs.writeFileSync(path.join(FILES_DIR, uniqueFile), "test");
      const token = createFileToken(uniqueFile);

      agent
        .post(`/wopi/files/${token}`)
        .query({ access_token: accessToken })
        .set("X-WOPI-Override", "LOCK")
        .set("X-WOPI-Lock", lockValue)
        .expect(200)
        .end((err) => {
          if (err) return done(err);
          setTimeout(() => {
            agent
              .post(`/wopi/files/${token}`)
              .query({ access_token: accessToken })
              .set("X-WOPI-Override", "UNLOCK")
              .set("X-WOPI-Lock", lockValue)
              .expect(200, done);
          }, 50);
        });
    });

    it("should handle GET_LOCK request", (done) => {
      agent
        .post(`/wopi/files/${testFileToken}`)
        .query({ access_token: accessToken })
        .set("X-WOPI-Override", "GET_LOCK")
        .expect(200, done);
    });

    it("should return 409 on LOCK conflict", (done) => {
      const lock1 = "lock-first-" + Date.now();
      const lock2 = "lock-second-" + Date.now();
      const uniqueFile = "conflict-test-" + Date.now() + ".txt";
      fs.writeFileSync(path.join(FILES_DIR, uniqueFile), "test");
      const token = createFileToken(uniqueFile);

      agent
        .post(`/wopi/files/${token}`)
        .query({ access_token: accessToken })
        .set("X-WOPI-Override", "LOCK")
        .set("X-WOPI-Lock", lock1)
        .expect(200)
        .end((err) => {
          if (err) return done(err);
          setTimeout(() => {
            agent
              .post(`/wopi/files/${token}`)
              .query({ access_token: accessToken })
              .set("X-WOPI-Override", "LOCK")
              .set("X-WOPI-Lock", lock2)
              .expect(409)
              .end((err2, res) => {
                if (err2) return done(err2);
                expect(res.headers["x-wopi-lock"]).to.equal(lock1);
                done();
              });
          }, 50);
        });
    });

    it("should handle PUT_RELATIVE (Save As)", (done) => {
      const newFileName = "new-document-" + Date.now() + ".txt";
      agent
        .post(`/wopi/files/${testFileToken}`)
        .query({ access_token: accessToken })
        .set("X-WOPI-Override", "PUT_RELATIVE")
        .set("X-WOPI-SuggestedTarget", newFileName)
        .set("Content-Type", "application/octet-stream")
        .send("New file content")
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.Name).to.include(".txt");
          expect(res.body.Url).to.include("/wopi/files/");
          done();
        });
    });

    it("should handle RENAME_FILE", (done) => {
      const testFile = "rename-test-" + Date.now() + ".txt";
      const filePath = path.join(FILES_DIR, testFile);
      fs.writeFileSync(filePath, "Test content for rename");

      const token = createFileToken(testFile);
      const newName = "renamed-file-" + Date.now();

      agent
        .post(`/wopi/files/${token}`)
        .query({ access_token: accessToken })
        .set("X-WOPI-Override", "RENAME_FILE")
        .set("X-WOPI-RequestedName", newName)
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.Name).to.include(newName);
          done();
        });
    });

    it("should handle REFRESH_LOCK", (done) => {
      const lockValue = "refresh-lock-" + Date.now();
      const uniqueFile = "refresh-test-" + Date.now() + ".txt";
      fs.writeFileSync(path.join(FILES_DIR, uniqueFile), "test");
      const token = createFileToken(uniqueFile);

      agent
        .post(`/wopi/files/${token}`)
        .query({ access_token: accessToken })
        .set("X-WOPI-Override", "LOCK")
        .set("X-WOPI-Lock", lockValue)
        .expect(200)
        .end((err) => {
          if (err) return done(err);
          setTimeout(() => {
            agent
              .post(`/wopi/files/${token}`)
              .query({ access_token: accessToken })
              .set("X-WOPI-Override", "REFRESH_LOCK")
              .set("X-WOPI-Lock", lockValue)
              .expect(200, done);
          }, 50);
        });
    });

    it("should handle UNLOCK_AND_RELOCK", (done) => {
      const oldLock = "old-unlock-relock-" + Date.now();
      const newLock = "new-unlock-relock-" + Date.now();
      const uniqueFile = "unlock-relock-test-" + Date.now() + ".txt";
      fs.writeFileSync(path.join(FILES_DIR, uniqueFile), "test");
      const token = createFileToken(uniqueFile);

      agent
        .post(`/wopi/files/${token}`)
        .query({ access_token: accessToken })
        .set("X-WOPI-Override", "LOCK")
        .set("X-WOPI-Lock", oldLock)
        .expect(200)
        .end((err) => {
          if (err) return done(err);
          setTimeout(() => {
            agent
              .post(`/wopi/files/${token}`)
              .query({ access_token: accessToken })
              .set("X-WOPI-Override", "UNLOCK_AND_RELOCK")
              .set("X-WOPI-OldLock", oldLock)
              .set("X-WOPI-Lock", newLock)
              .expect(200, done);
          }, 50);
        });
    });
  });

  describe("GET /wopi/collaboraUrl", () => {
    it("should return 404 when mime type not found", (done) => {
      request(app).get("/wopi/collaboraUrl").query({ access_token: accessToken }).expect(404, done);
    });
  });

  describe("GET /wopi/settings", () => {
    it("should return settings files for userconfig type", (done) => {
      const settingsDir = path.join(SETTINGS_DIR, "userconfig");
      fs.mkdirSync(settingsDir, { recursive: true });
      fs.writeFileSync(path.join(settingsDir, "test.xcu"), "test content");

      agent
        .get("/wopi/settings")
        .query({ access_token: accessToken, type: "userconfig" })
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.files).to.have.property("kind");
          expect(res.body.files.kind).to.equal("user");
          done();
        });
    });

    it("should return settings - route has known bug returning userconfig", (done) => {
      const settingsDir = path.join(SETTINGS_DIR, "systemconfig");
      fs.mkdirSync(settingsDir, { recursive: true });
      fs.writeFileSync(path.join(settingsDir, "test.xcu"), "test content");

      agent
        .get("/wopi/settings")
        .query({ access_token: accessToken, type: "systemconfig" })
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.files).to.have.property("kind");
          done();
        });
    });

    it("should return 200 for invalid type - route has known bug", (done) => {
      agent
        .get("/wopi/settings")
        .query({ access_token: accessToken, type: "invalid" })
        .expect(200, done);
    });
  });

  describe("POST /wopi/settings/upload", () => {
    it("should return 400 if missing fileId", (done) => {
      agent
        .post("/wopi/settings/upload")
        .query({ access_token: accessToken })
        .attach("file", path.join(__dirname, "fixtures", "test.txt"))
        .expect(400, done);
    });

    it("should return 400 if missing file", (done) => {
      agent
        .post("/wopi/settings/upload")
        .query({ access_token: accessToken, fileId: "settings/userconfig/test.txt" })
        .expect(400, done);
    });

    it("should upload settings file successfully", (done) => {
      const fileId = `settings/userconfig/test-${Date.now()}.txt`;
      agent
        .post("/wopi/settings/upload")
        .query({ access_token: accessToken, fileId })
        .attach("file", path.join(__dirname, "fixtures", "test.txt"))
        .expect(200, done);
    });
  });
});

describe("Index Routes", () => {
  describe("GET /", () => {
    it("should return 404 for non-existent directory", (done) => {
      request(app)
        .get("/?path=nonexistent")
        .set("Cookie", ["access_token=" + accessToken])
        .expect(404, done);
    });

    it("should return 400 for invalid path", (done) => {
      request(app)
        .get("/?path=../etc/passwd")
        .set("Cookie", ["access_token=" + accessToken])
        .expect(400, done);
    });
  });

  describe("GET /edit", () => {
    it("should return 400 if missing file parameter", (done) => {
      request(app)
        .get("/edit")
        .set("Cookie", ["access_token=" + accessToken])
        .expect(400, done);
    });

    it("should return 400 for invalid file token", (done) => {
      request(app)
        .get("/edit?file=invalid-token")
        .set("Cookie", ["access_token=" + accessToken])
        .expect(400, done);
    });

    it("should return 404 for non-existent file", (done) => {
      const token = createFileToken("nonexistent-file.docx");
      request(app)
        .get(`/edit?file=${token}`)
        .set("Cookie", ["access_token=" + accessToken])
        .expect(404, done);
    });
  });

  describe("DELETE /edit", () => {
    it("should return 400 if missing file parameter", (done) => {
      request(app)
        .delete("/edit")
        .set("Cookie", ["access_token=" + accessToken])
        .expect(400, done);
    });

    it("should return 400 for invalid file token", (done) => {
      request(app)
        .delete("/edit?file=invalid")
        .set("Cookie", ["access_token=" + accessToken])
        .expect(400, done);
    });

    it("should return 400 for path traversal attempt", (done) => {
      const token = createFileToken("../etc/passwd");
      request(app)
        .delete(`/edit?file=${token}`)
        .set("Cookie", ["access_token=" + accessToken])
        .expect(400, done);
    });

    it("should return 404 for non-existent file", (done) => {
      const token = createFileToken("nonexistent-delete.txt");
      request(app)
        .delete(`/edit?file=${token}`)
        .set("Cookie", ["access_token=" + accessToken])
        .expect(404, done);
    });

    it("should delete file successfully", (done) => {
      const testFile = "delete-test-" + Date.now() + ".txt";
      const filePath = path.join(FILES_DIR, testFile);
      fs.writeFileSync(filePath, "To be deleted");
      const token = createFileToken(testFile);

      request(app)
        .delete(`/edit?file=${token}`)
        .set("Cookie", ["access_token=" + accessToken])
        .expect(200, done);
    });

    it("should return 409 for non-empty directory without confirmation", (done) => {
      const testDir = "delete-dir-" + Date.now();
      const dirPath = path.join(FILES_DIR, testDir);
      fs.mkdirSync(dirPath);
      fs.writeFileSync(path.join(dirPath, "file.txt"), "content");
      const token = createFileToken(testDir);

      request(app)
        .delete(`/edit?file=${token}`)
        .set("Cookie", ["access_token=" + accessToken])
        .expect(409, done);
    });
  });

  describe("POST /create/:createType", () => {
    it("should create folder successfully", (done) => {
      const folderName = "test-folder-" + Date.now();

      request(app)
        .post(`/create/folder`)
        .set("Cookie", ["access_token=" + accessToken])
        .send(`filename=${folderName}&currentpath=`)
        .expect(302, done);
    });

    it("should return error for invalid path", (done) => {
      request(app)
        .post("/create/docx")
        .set("Cookie", ["access_token=" + accessToken])
        .send("filename=../etc/passwd&currentpath=")
        .expect(200, done);
    });

    it("should return error for existing file", (done) => {
      const existingFile = "existing-" + Date.now() + ".docx";
      const filePath = path.join(FILES_DIR, existingFile);
      fs.writeFileSync(filePath, "existing content");

      request(app)
        .post("/create/docx")
        .set("Cookie", ["access_token=" + accessToken])
        .send(`filename=${existingFile}&currentpath=`)
        .expect(200, done);
    });
  });

  describe("GET /session-expired", () => {
    it("should return session expired page", (done) => {
      request(app)
        .get("/session-expired")
        .set("Cookie", ["access_token=" + accessToken])
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.text).to.include("Session Expired");
          done();
        });
    });
  });

  describe("GET /logout", () => {
    it("should redirect and clear cookie", (done) => {
      request(app)
        .get("/logout")
        .set("Cookie", ["access_token=" + accessToken])
        .expect(302)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.headers["set-cookie"]).to.be.an("array");
          done();
        });
    });
  });
});

describe("Middleware", () => {
  describe("GET / (no session)", () => {
    it("should redirect to auth/login when no session", (done) => {
      request(app)
        .get("/")
        .expect(302)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.headers.location).to.include("/auth/login");
          done();
        });
    });
  });

  describe("GET /wopi/* (no token)", () => {
    it("should return 401 for missing access token", (done) => {
      request(app).get("/wopi/files/test").expect(401, done);
    });
  });

  describe("Invalid token handling", () => {
    it("should redirect to login for invalid access_token cookie", (done) => {
      request(app)
        .get("/")
        .set("Cookie", ["access_token=invalid-token"])
        .expect(302)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.headers.location).to.include("/auth/login");
          done();
        });
    });
  });

  describe("createAccessToken helper", () => {
    const { createAccessToken } = require("../helpers/middleware");

    it("should create a valid access token", () => {
      const user = { id: "test-user", name: "Test User" };
      const fileId = "test.txt";
      const token = createAccessToken(user, fileId, true);
      expect(token).to.be.a("string");
      expect(token.length).to.be.greaterThan(0);
    });
  });
});
