# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| latest  | Yes       |

We support the latest published version of `mcp-cost-tracker-router` on npm. Update to the latest release before reporting a vulnerability.

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report security issues by emailing the maintainers directly or using GitHub's private vulnerability reporting feature (Security → Report a vulnerability).

Include as much of the following as possible:

- A description of the vulnerability and its potential impact.
- Steps to reproduce the issue.
- Any proof-of-concept code, if applicable.
- The version of `mcp-cost-tracker-router` you are using.

You can expect an initial response within **72 hours** and a resolution or status update within **14 days**.

## Security Considerations

`mcp-cost-tracker-router` stores token usage and session spend history in a local SQLite database:

- The pricing table and spend history are stored locally and never transmitted externally.
- Restrict file-system permissions on the database file to prevent unauthorized read access.
- Routing suggestions are advisory only; final model selection remains with the calling agent or user.
