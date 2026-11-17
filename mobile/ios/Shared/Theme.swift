import SwiftUI

// Pilothouse identity: lime on near-black.
extension Color {
    // "#rrggbb" from the computer's terminal palette.
    init(hex: String) {
        let v = UInt32(hex.dropFirst(), radix: 16) ?? 0xcccccc
        self.init(red: Double((v >> 16) & 255) / 255, green: Double((v >> 8) & 255) / 255, blue: Double(v & 255) / 255)
    }
    static let lime = Color(red: 200 / 255, green: 1, blue: 46 / 255)
    static let ink = Color(red: 11 / 255, green: 13 / 255, blue: 16 / 255)
    static let amber = Color(red: 1, green: 194 / 255, blue: 74 / 255)

    static func status(_ s: String) -> Color {
        switch s {
        case "waiting": return .amber
        case "running": return .lime
        default: return .gray
        }
    }
}

func statusLabel(_ s: String) -> String {
    switch s {
    case "waiting": return String(localized: "needs you")
    case "running": return String(localized: "working")
    default: return String(localized: "idle")
    }
}
