# Tebex Integration Setup

This project now includes Tebex webhook handling, local JSON purchase persistence, and the `/claim` Discord command.

## Hosted Tebex Mode (your case)

If you will use Tebex hosted storefront/checkout, you do **not** need local store pages.
Use this project mainly for:

1. receiving Tebex webhook events,
2. saving purchases in a local JSON file,
3. delivering roles via `/claim`.

## Environment Variables

Add to `.env`:

```env
DISCORD_BOT_TOKEN=your_bot_token
ADMIN_ROLE_IDS=123456789012345678,987654321098765432
TEBEX_PURCHASE_CHANNEL_ID=1479945023947804713

# Required account identifier in Headless URLs
TEBEX_PUBLIC_TOKEN=your_public_token

# Optional auth for API requests
TEBEX_PRIVATE_KEY=your_private_key

# Required for admin Tebex slash commands that use plugin.tebex.io
TEBEX_PLUGIN_SECRET=your_plugin_secret
# Legacy alias also accepted
# TEBEX_SECRET=your_plugin_secret

TEBEX_WEBHOOK_SECRET=your_webhook_secret
TEBEX_WEBHOOK_PATH=/webhooks/tebex


# package_id -> role_id
TEBEX_PACKAGE_ROLE_MAP={"12345":"987654321098765432"}
```

## Tebex dashboard configuration

1. Create package variable `discord_id` (required).
2. Ensure customer fills `discord_id` at purchase.
3. Configure webhook URL to your bot server endpoint:
   - `POST /webhooks/tebex` (or custom `TEBEX_WEBHOOK_PATH`).
4. Use events at least:
   - `payment.completed`
   - `payment.refunded`
   - `payment.dispute*`

## HTTP Routes (backend)

- `GET /health` - health check
- `POST /webhooks/tebex` (or path from `TEBEX_WEBHOOK_PATH`)

(Existing `/api/tebex/*` routes can stay available, but are optional in hosted mode.)

## Claim Flow

1. Tebex sends `payment.completed` to webhook.
2. Server stores purchase data in `data/tebex/storage.json`.
3. Bot sends a purchase notification to `TEBEX_PURCHASE_CHANNEL_ID`.
4. Customer uses `/claim` or clicks the published `/claim-panel` in Discord.
5. Bot maps `package_id` to `role_id` using `TEBEX_PACKAGE_ROLE_MAP`.
6. Successful claims are marked as `claimed=true`.


Local JSON storage is required for this flow. If the file cannot be read or written, webhook processing and /claim will fail until access is restored.


## Admin Panel Command

Use /tebex-panel (administrator only) to:

- verify environment keys quickly,
- test Tebex API and local storage connectivity,
- pull professional metrics from purchases (pending, claimed, refunded, disputed),
- view recent purchases and top packages in one panel.

Use /claim-panel to publish a branded Safe Studio claim panel with buttons for:

- checking pending purchases,
- redeeming purchases directly from the message,
- keeping `/claim` available as a direct slash-command fallback.

## Tebex Admin Slash Commands

The bot also includes these Tebex admin commands:

- `/verify transaction_id:<id>`
- `/products`
- `/search tebex_username:<username>`
- `/updateproduct package_id:<id> enabled:<true|false> name:<name> price:<value>`
- `/createurl package_id:<id> tebex_username:<username>`
- `/recentpayments`

Access is granted to server administrators and also to roles listed in `ADMIN_ROLE_IDS` when configured.



