# Security Policy

Ascend runs entirely in the browser. It has no server, no accounts and no telemetry, and it stores no secrets. User data stays in the browser's IndexedDB on the user's device.

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report them privately with GitHub's [private vulnerability reporting](https://github.com/its-harsh-here/ASCEND/security/advisories/new) (Security tab → "Report a vulnerability").

Include steps to reproduce and the affected version or commit. You should get an initial response within a week.

## Scope

Relevant reports include, for example:

- Cross-site scripting through quest content, imported backups or links
- Unsafe handling of imported JSON backups
- Issues in the optional local-AI integration (e.g. unintended network requests)

The optional Ollama integration talks only to the URL the user configures. Never expose an Ollama server to the public internet.
