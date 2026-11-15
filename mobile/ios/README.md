# Pilothouse for iOS

SwiftUI app + WidgetKit extension that talks to Pilothouse's Phone remote over Tailscale.

## Build

```sh
brew install xcodegen
cd mobile/ios
xcodegen                     # creates Pilothouse.xcodeproj (not committed)
open Pilothouse.xcodeproj    # set your team in project.yml (DEVELOPMENT_TEAM) and keychainGroup in Shared/Client.swift
```

Run on a device, then pair: Pilothouse → Settings → Phone remote → scan the QR code.

## Notifications (optional)

Pilothouse sends pushes straight from your computer to Apple, signed with an APNs key from your own Apple Developer account:

1. developer.apple.com → Keys → **+** → enable *Apple Push Notifications service (APNs)* → download the `.p8` file.
2. Create `~/.pilothouse/apns.json` (only you should be able to read it: `chmod 600`):

```json
{ "keyPath": "/path/to/AuthKey_XXXXXXXXXX.p8", "keyId": "XXXXXXXXXX", "teamId": "YOURTEAMID", "bundleId": "com.aemresrbyk.pilothouse.mobile" }
```

Settings → Phone remote then says *Notifications: on*. Debug builds use Apple's sandbox push servers, release builds the production ones.
