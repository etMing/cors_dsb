# CORS DSB
A Chrome browser extension that lets you modify `Access-Control-Allow-*` response headers on any website to enable cross-origin requests. Set origin, methods, headers, credentials, and more — no server changes required.
Store Link:  https://chromewebstore.google.com/detail/cors-dsb/beljkekkkgdcegknfclgadhdjfkfomnl
---

## Why Install?

- **Fix CORS errors** — override the server's missing or too-strict CORS headers so cross-origin requests succeed
- **Test third-party APIs** — call any API from your own site without waiting for backend changes
- **Enable credentials & custom headers** — flip Allow-Credentials, add `Authorization` / `X-API-Key` headers, expose response headers
- **No coding required** — everything is configured through a clean popup UI

---

## Key Features

### Per-Site Rules
Each rule targets a specific URL pattern (e.g. `https://api.example.com/*`). Different sites can have different CORS settings.

### Modify All Six CORS Headers
Control `Access-Control-Allow-Origin`, `-Methods`, `-Headers`, `-Credentials`, `-Expose-Headers`, and `-Max-Age` in one place.

### Guided Method & Header Pickers
Pick from common HTTP methods and headers with clickable chips — no need to memorize names. Each picker includes a `*` (allow all) option plus custom input for anything else.

### Allow Credentials Toggle
Turn `Access-Control-Allow-Credentials` on or off with a simple dropdown. (Note: credentials can't be combined with a `*` origin.)

### Master Toggle
Enable or disable all rules globally with one click. The switch remembers its last state across browser restarts.

### Export & Import
Back up your rule set to a JSON file or share rules across devices.

---

## How to Use

1. Install the extension from the Chrome Web Store
2. Click the **CORS DSB** icon in your browser toolbar
3. Click **"+ Add Rule"** — the current site's URL is auto-filled
4. Set the origin, methods, headers, and other fields (chips make it point-and-click)
5. Click **"Save & Apply"**
6. Refresh the target page and retry the request

---

## Example Use Cases

| Scenario | Setup |
|---|---|
| Bypass CORS on a third-party API | Add rule for the API origin → set Allow-Origin `*` |
| Send requests with Authorization headers | Add rule → Allow-Headers → enable `Authorization` |
| Read custom response headers | Add rule → Expose-Headers → select or type header names |
| Allow cookies cross-origin | Add rule → Allow-Credentials `true` → set a specific origin (not `*`) |

---

## Source Code

This extension is open source. View the code, report issues, or contribute at:

**[github.com/etMing/cors_dsb](https://github.com/etMing/cors_dsb)**
