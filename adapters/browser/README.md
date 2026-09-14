# Ariadne Browser Adapter

The browser adapter is a narrow, privacy-first browser-extension boundary.

Implemented in this package:

- normal active-tab normalization
- navigation event and explicit Attach-to-Thread message shapes
- HTTP(S)-only URL sanitization
- query and fragment stripping
- exact and subdomain exclusions
- private/incognito rejection by default
- no page content, DOM, form values, cookies, authentication data, history, screenshots, clipboard, or keystrokes

The package emits protocol-shaped messages for a supported native-messaging bridge. It does not expose Ariadne on a LAN interface. A browser extension UI/native-host registration is still a packaging integration step: the desktop installer must register a native-messaging host that forwards these validated messages to the existing authenticated Ariadne local endpoint. Until that registration is shipped, this package is a tested adapter boundary, not a claimed end-user browser installation.

Commands:

```bash
npm ci
npm run build
npm run lint
npm run typecheck
npm run test:unit
```
