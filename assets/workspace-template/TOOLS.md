# Tools

> Environment-specific tool inventory. Skills define *how* tools work; this file lists *what's connected here*.

## Why This File Is Separate From `skills/`

- `skills/` is shared (provided by the vertical pack, versioned, refreshable)
- `TOOLS.md` is tenant-specific (real device names, real contact IDs, real API integrations)
- Keeping them apart lets the vertical pack upgrade without overwriting tenant-specific notes

## What Goes Here

- API integrations enabled for this tenant (e.g. NocoBase collections in scope)
- External account IDs (e.g. messaging channel user IDs, social handles)
- Device aliases (e.g. cameras, printers, IoT)
- Voice / TTS preferences
- Anything environment-specific that a skill might want to know

## Examples

```markdown
### NocoBase Collections (this tenant)
- products
- orders
- customers

### Messaging Channels
- WeChat: <official-account-id>
- Telegram: <user-id>

### Printers
- receipt-printer-front: 192.168.1.100, ESC/POS
```

## Bootstrap

Initially empty. The vertical pack populates a baseline list at first boot; the tenant fills in their specifics.

---

*See `IDENTITY.md` for who I am, `USER.md` for who I serve.*
