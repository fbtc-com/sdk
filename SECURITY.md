# Security Policy

## Reporting a Vulnerability

**Please do NOT open public GitHub issues for security vulnerabilities.**

Instead, report vulnerabilities privately via:

📧 **Email**: legal@fxn.xyz

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

| Action             | Timeline           |
| ------------------ | ------------------ |
| Acknowledgment     | Within 48 hours    |
| Initial assessment | Within 1 week      |
| Fix development    | Varies by severity |
| Public disclosure  | 90 days after fix  |

### Recognition

We credit security researchers in our release notes (unless you prefer anonymity).

## Supported Versions

| Version | Supported              |
| ------- | ---------------------- |
| 0.1.0   | ✅ Yes                 |

## Security Best Practices

When using the SDK:

1. Never expose private keys in client-side code
2. Validate all user inputs before passing to SDK
3. Use environment variables for sensitive configuration
4. Keep dependencies updated
