# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.1.x   | :white_check_mark: |
| < 1.1.0 | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability within this project, please **do not** create a public issue. Instead, please report it through one of the following channels:

- **Email**: security-ghost@example.com (Placeholder)
- **GitHub**: Use the "Report a vulnerability" button if enabled.

## Security Controls Implemented

- **Zero-Knowledge Architecture**: All encryption and decryption occurs client-side. The server never sees plaintext messages or decryption keys.
- **Perfect Forward Secrecy (PFS)**: Unique Initialization Vectors (IV) for every message to ensure past sessions remain secure even if a key is compromised.
- **Input Sanitization**: All user-generated content is sanitized to prevent XSS.
- **Rate Limiting**: Protection against brute-force and DoS attacks.
- **SQL Injection Protection**: Parameterized queries and strict input validation.
- **Secure Headers**: HSTS, CSP, X-Frame-Options, and X-Content-Type-Options are enabled.

## Privacy by Design

GhostChat does not track users, store IP addresses in logs, or use third-party analytics. Persistence is optional and entirely local.
