import SwiftUI

// Pilothouse identity: lime on near-black.
extension Color {
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
    case "waiting": return "needs you"
    case "running": return "working"
    default: return "idle"
    }
}
