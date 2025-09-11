# Collabora Office WOPI Server

A small WOPI server implementation for editing and viewing office (.docx) documents. Supports access to the same files (note: no file level security is implemented. Every user has access to the same files. Guest Access is not allowed.)

## Requirements

- [Collabora Code](https://www.collaboraonline.com/code/)
- OAuth2 Provider (e.g. [Dex idP](https://dexidp.io/))
- Storage mounted at `/app/files`

## Environment Variables

### DEX_ISSUER

The issuer for your OAuth2 provider. (e.g. `https://dex.example.com`)

### CLIENT_ID

The client id for your OAuth2 provider.

### CLIENT_SECRET

The client secret for your OAuth2 provider.

### JWT_SECRET

The key to sign the JWT token used for authentication.

### DOCUMENTSERVER_URL

The full URL of where collabora/code is running. (e.g. `https://collabora.example.com`)

### MIDDLEWARE_SERVER

The full URL of where this server will be available at. (e.g. `https://o.example.com`)

### SUPER_ADMIN_USER

This is the username that you want Collabora's serverhealth buttons exposed to.

### FILES_DIR (OPTIONAL)

Defaults to `/app/files/editable`

### SETTINGS_DIR (OPTIONAL)

Defaults to `/app/files/settings`
