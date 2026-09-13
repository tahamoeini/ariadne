# Ariadne Browser Adapter

The browser adapter is intentionally narrow and explicit.

Initial scope:

- active normal tab
- title
- sanitized HTTP(S) URL
- navigation event
- explicit Attach to Thread

It must not capture page content, DOM, form values, cookies, authentication data, browsing history, or private/incognito activity by default. Communication is with the installed local Ariadne application through a supported local mechanism; Ariadne must not expose an LAN endpoint.
