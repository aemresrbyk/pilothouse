# Pilothouse for iOS

SwiftUI app + WidgetKit extension (widgets, Live Activity) that talks to Pilothouse's remote API through the end-to-end encrypted relay, or over Tailscale.

## Build

```sh
brew install xcodegen
cd mobile/ios
xcodegen                     # creates Pilothouse.xcodeproj (not committed)
open Pilothouse.xcodeproj    # set your team in project.yml (DEVELOPMENT_TEAM) and keychainGroup in Shared/Client.swift
```

Run on a device, then pair: Pilothouse → Settings → Remote control → scan the QR code.

No computer at hand? **Try a demo** on the first screen loads sample agents made up on the phone (`Shared/Demo.swift`, no network); Unpair in Settings removes it. App Review uses this too.

## Notifications (optional)

Pilothouse sends pushes straight from your computer to Apple, signed with an APNs key from your own Apple Developer account:

1. developer.apple.com → Keys → **+** → enable *Apple Push Notifications service (APNs)* → download the `.p8` file.
2. Create `~/.pilothouse/apns.json` (only you should be able to read it: `chmod 600`):

```json
{ "keyPath": "/path/to/AuthKey_XXXXXXXXXX.p8", "keyId": "XXXXXXXXXX", "teamId": "YOURTEAMID", "bundleId": "com.aemresrbyk.pilothouse.mobile" }
```

Settings → Remote control then lists the iPhone with *notifications*. Debug builds use Apple's sandbox push servers, release builds the production ones.
