# Contract: `atlas://` URL Scheme

**Feature**: `001-rebrand-pass`
**Status**: authoritative

This contract defines the `atlas://` custom URL scheme registered to the Atlas application on each OS.

## Grammar (RFC 3986 derived)

```
atlas-uri      = "atlas://" host "/" path [ "?" query ]
host           = "auth" | "open" | "deeplink"     ; reserved hosts, see Hosts table
path           = segment *( "/" segment )
segment        = unreserved / pct-encoded
query          = key-value *( "&" key-value )
key-value      = key "=" value
key            = unreserved-no-equal *( unreserved-no-equal )
value          = unreserved / pct-encoded
```

## Reserved Hosts (v1)

| Host | Purpose | Path / query expectations |
|---|---|---|
| `auth` | Receive sign-in callback from the cloud auth web app (future spec `002-cloud-auth`) | `atlas://auth?code=<opaque>&state=<opaque>` |
| `open` | Open a specified resource inside Atlas | `atlas://open/<resource-type>/<id>` |
| `deeplink` | Generic deep-link entry point reserved for future use | undefined in v1 — reject if used |

This rebrand spec registers the scheme; only the `auth` host is *consumed* by a future spec. `open` and `deeplink` are reserved namespace placeholders so future specs can use them without renegotiating registration.

## Registration

| OS | Mechanism | File / API |
|---|---|---|
| macOS | `CFBundleURLTypes` in `Info.plist` | written by Electron-builder from `electron-builder.yml`'s `mac.protocols` |
| Windows | Registry under `HKEY_CLASSES_ROOT\atlas` | written by the installer (NSIS / MSI) |
| Linux | `MimeType=x-scheme-handler/atlas;` in the `.desktop` entry | `installers/linux/atlas.desktop` + `xdg-mime default` post-install |

## Rules

- **R-URL-001**: The Atlas application MUST register exclusively for the `atlas` scheme. It MUST NOT register for `goose` or any other upstream-owned scheme.
- **R-URL-002**: A URL with an unrecognised host (anything outside `auth` / `open` / `deeplink`) MUST be rejected by the application with a logged error and no user action.
- **R-URL-003**: All query parameter values MUST be percent-decoded once on receipt. Double decoding is a security defect.
- **R-URL-004**: The application MUST NOT execute, eval, or invoke any shell command based on URL contents. URL parameters are data, not code.
- **R-URL-005**: Receiving an `atlas://` URL while the application is not running MUST launch the application and then deliver the URL. Receiving it while running MUST focus the existing window and deliver the URL without spawning a second instance.

## Verification

- Integration test `url_scheme_registration_test` (per OS): asserts the OS routes `atlas://auth?code=test` to the running Atlas process.
- Integration test `url_scheme_rejects_unknown_host_test`: sends `atlas://unknown/path` and asserts a logged rejection with no UI action.
- Security test `url_scheme_does_not_execute_shell_test`: sends `atlas://open/file/$(rm%20-rf%20~)` and asserts the application logs a rejection and does not execute anything.
