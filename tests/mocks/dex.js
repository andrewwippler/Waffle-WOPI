"use strict";

const nock = require("nock");

const { DEX_ISSUER, CLIENT_ID, CLIENT_SECRET, MIDDLEWARE_SERVER } = require("../../helpers/vars");

const mockUser = {
  sub: "test-user-123",
  email: "testuser@example.com",
  name: "Test User",
  preferred_username: "testuser",
};

const mockIdToken =
  "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXItMTIzIiwiZW1haWwiOiJ0ZXN0dXNlckBleGFtcGxlLmNvbSIsIm5hbWUiOiJUZXN0IFVzZXIiLCJwcmVmZXJlcnRlZF91c2VybmFtZSI6InRlc3R1c2VyIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

const mockRefreshToken = "mock-refresh-token-12345";

function setupDexMocks() {
  nock(DEX_ISSUER).persist().post("/token").reply(200, {
    id_token: mockIdToken,
    refresh_token: mockRefreshToken,
    token_type: "Bearer",
    expires_in: 3600,
  });

  nock(DEX_ISSUER)
    .persist()
    .get("/keys")
    .reply(200, {
      keys: [
        {
          kty: "RSA",
          kid: "test-key-id",
          use: "sig",
          alg: "RS256",
          n: "0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw",
          e: "AQAB",
        },
      ],
    });
}

function getMockUser() {
  return { ...mockUser };
}

function getMockIdToken() {
  return mockIdToken;
}

function getMockRefreshToken() {
  return mockRefreshToken;
}

module.exports = {
  setupDexMocks,
  getMockUser,
  getMockIdToken,
  getMockRefreshToken,
};
