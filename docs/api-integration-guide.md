# API Integration Guide

This guide explains how to configure various third-party APIs within the `apis.json` configuration file. The application can then leverage these connections in automated tasks.

## API Configuration Structure

Each API is defined as an object in the `apis.json` file. The key is a unique name you'll use to reference the API in your tasks.

The basic structure is:
```json
"api-name": {
  "type": "rest",
  "baseUrl": "https://api.example.com/v1",
  "auth": {
    "type": "header",
    "header": "X-Api-Key",
    "token": "YOUR_API_KEY_HERE"
  }
}
```

- `type`: Currently, only `rest` is supported.
- `baseUrl`: The base URL for all API endpoints.
- `auth`: (Optional) Authentication details.
    - `type`: Can be `header` or `bearer`.
    - `header`: The name of the HTTP header for the API key (if `type` is `header`).
    - `token`: Your secret API key or bearer token.

---

## Example Integrations

Below are example configurations for commonly used services. Replace placeholder values with your actual credentials.

### Pushbullet

Used for sending notifications. The core application uses this, but you can also define it for custom tasks.

**`apis.json`:**
```json
"pushbullet": {
  "type": "rest",
  "baseUrl": "https://api.pushbullet.com/v2",
  "auth": {
    "type": "header",
    "header": "Access-Token",
    "token": "YOUR_PUSHBULLET_ACCESS_TOKEN"
  }
}
```

### Radarr

For managing your movie library.

**`apis.json`:**
```json
"radarr": {
  "type": "rest",
  "baseUrl": "http://localhost:7878/api/v3",
  "auth": {
    "type": "header",
    "header": "X-Api-Key",
    "token": "YOUR_RADARR_API_KEY"
  }
}
```
*Note: Adjust `localhost:7878` to your Radarr instance's address.*

### Sonarr

For managing your TV show library.

**`apis.json`:**
```json
"sonarr": {
  "type": "rest",
  "baseUrl": "http://localhost:8989/api/v3",
  "auth": {
    "type": "header",
    "header": "X-Api-Key",
    "token": "YOUR_SONARR_API_KEY"
  }
}
```
*Note: Adjust `localhost:8989` to your Sonarr instance's address.*

### Trakt

For tracking TV shows and movies.

**`apis.json`:**
```json
"trakt": {
  "type": "rest",
  "baseUrl": "https://api.trakt.tv",
  "auth": {
    "type": "bearer",
    "token": "YOUR_TRAKT_ACCESS_TOKEN"
  }
}
```
*Note: You will also need to include a `trakt-api-key` header with your client ID for Trakt's API, which might require custom handling in your task prompt.*

### Hardcover

For tracking your reading list.

**`apis.json`:**
```json
"hardcover": {
  "type": "rest",
  "baseUrl": "https://api.hardcover.app/v1",
  "auth": {
    "type": "bearer",
    "token": "YOUR_HARDCOVER_API_TOKEN"
  }
}
```

## Using APIs in Tasks

Once configured, you can reference these APIs in your task prompts. The automation script running your prompt will need to know how to use the `baseUrl` and authentication details to make the API calls.
