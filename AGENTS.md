# AGENTS.md - Collabora Middleware Development Guide

## Project Overview

This is a Node.js/Express WOPI server for Collabora Online document editing. It handles file operations, authentication via OAuth2 (Dex), and integrates with Collabora Office.

## Build & Run Commands

### Installation

```bash
npm install
```

### Development

```bash
npm run dev    # Start with nodemon (auto-restart on file changes)
npm start     # Start production server: node ./bin/www
```

### Single Test Execution

**No tests currently configured.** The project has no test framework installed and no test scripts defined in package.json.

To add tests, consider:

```bash
npm install --save-dev jest supertest  # or mocha, tap, etc.
```

## Code Style Guidelines

### Language

- **JavaScript (ES6+)** - CommonJS module system (`require`, not ES modules)
- **No TypeScript** - Plain JavaScript only

### Imports/Requires

- Group require statements at the top of files
- Order: built-in Node modules → external packages → local modules
- Use `const` for most variables, `let` when reassignment needed

```javascript
// Example import order
const express = require("express");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");

const indexRouter = require("./routes/index");
const { createAccessToken } = require("./helpers/middleware");
```

### Naming Conventions

- **Files**: lowercase with underscores (`filetoken.js`, `middleware.js`)
- **Variables/functions**: camelCase (`createAccessToken`, `fileId`)
- **Constants**: UPPER_SNAKE_CASE for config values (`JWT_SECRET`, `FILES_DIR`)
- **Routes**: noun-based, plural for collections (`/wopi/files`, `/settings`)

### Formatting

- Use 2 spaces for indentation
- Prefer double quotes for strings (consistent with most files)
- Use semicolons at end of statements
- Max line length ~100 characters

### Error Handling

- Use try/catch for synchronous operations that may fail
- Return proper HTTP status codes: 400 (bad request), 401 (unauthorized), 403 (forbidden), 404 (not found), 500 (server error)
- Log errors with `console.error()` or `console.log()`

```javascript
// Example error handling pattern
try {
  rel = decodeFileToken(req.params.fileId);
} catch (e) {
  return res.status(400).json({ error: "Invalid file token" });
}

if (!fs.existsSync(filepath)) {
  return res.status(404).json({ error: "File not found" });
}
```

### JSDoc Comments

Add JSDoc comments for public functions:

```javascript
/**
 * Utility: create WOPI access token
 * @param {object} user - User object { id, name }
 * @param @param {string} fileId - File identifier
 * @param {boolean} canWrite - Permission flag
 * @returns {string} JWT token
 */
function createAccessToken(user, fileId, canWrite = true) { ... }
```

### Security

- Never commit secrets or keys to version control
- Use environment variables for all sensitive configuration
- Validate all user inputs
- Use `httpOnly` and `sameSite` cookies for sessions
- Use HTTPS in production (check `NODE_ENV === "production"`)

### Project Structure

```
├── app.js                 # Main Express app setup
├── bin/www                # Entry point
├── routes/                # Express route handlers
│   ├── index.js
│   ├── wopi.js
│   └── auth.js
├── helpers/               # Utility functions
│   ├── middleware.js      # Auth middleware
│   ├── vars.js            # Environment config
│   ├── files.js
│   └── filetoken.js
├── html/                  # Static assets
└── files/                 # Runtime file storage
    ├── editable/
    └── settings/
```

### Existing Patterns

- Routes follow REST-like patterns with Express router
- File operations use synchronous `fs` methods (convenience over async)
- WOPI protocol implementation in `routes/wopi.js`
- JWT tokens for authentication with RS256 (Dex) and HS256 (fallback)

### Dependencies (for reference)

- **express** ^5.2.1 - Web framework
- **jsonwebtoken** ^9.0.3 - JWT handling
- **jwks-rsa** ^4.0.0 - JWKS client for Dex
- **axios** ^1.13.6 - HTTP client
- **multer** ^2.1.0 - File uploads
- **officegen** ^0.6.5 - Office document generation

### Linting/Formatting

**No linting configured.** Consider adding ESLint:

```bash
npx eslint --init
```

## Environment Variables

Required:

- `DEX_ISSUER` - OAuth2 provider URL
- `CLIENT_ID` - OAuth2 client ID
- `CLIENT_SECRET` - OAuth2 client secret
- `JWT_SECRET` - JWT signing key
- `DOCUMENTSERVER_URL` - Collabora Online URL
- `MIDDLEWARE_SERVER` - This server's URL

Optional:

- `NODE_ENV` - "development" or "production"
- `FILES_DIR` - Editable files directory (default: `./files/editable`)
- `SETTINGS_DIR` - Settings files directory (default: `./files/settings`)
- `SUPER_ADMIN_USER` - Admin username (default: "admin")
