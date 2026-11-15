# Pilothouse push relay

A Cloudflare Worker that forwards notifications from Pilothouse on your computer to the Pilothouse iPhone app, through Apple's push service.

- **It can't read them.** Your computer encrypts each notification (AES-256-GCM) with a key that only your paired iPhone has; the iPhone decrypts it. The relay sees an encrypted blob and a device token.
- **It keeps nothing.** No storage, no logs (`observability` off), no analytics.
- **It costs nothing** on the Workers free plan (100,000 requests a day).

You don't need it if you build the iPhone app yourself: put your own APNs key in `~/.pilothouse/apns.json` (see [`mobile/ios`](../mobile/ios)) and your computer talks to Apple directly.

## Deploy

```sh
cd relay
npx wrangler login
npx wrangler secret put APNS_KEY      # paste the whole .p8 file
npx wrangler secret put APNS_KEY_ID
npx wrangler secret put APNS_TEAM_ID
npx wrangler deploy
```
