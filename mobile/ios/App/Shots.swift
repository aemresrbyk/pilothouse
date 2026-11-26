#if DEBUG
// App Store screenshots without touching the screen: launch a Debug build with -shots on an iPhone 17 Pro Max
// simulator (1320x2868, the 6.9" size). The app walks the demo and, at each screen, writes Documents/ready-<name>;
// the script captures the whole screen then (status bar included) with `simctl io screenshot` and deletes the
// marker. Never in Release builds.
import SwiftUI
import UIKit

enum Shots {
    @MainActor static func run(_ model: Model) async {
        // Chat text check: code blocks fold to one note (also while the block is still open), headings turn bold.
        if Locale.current.language.languageCode == "en" {
            assert(readableText("## Hi\nsee:\n```ts\na\nb\n```\nok") == "**Hi**\nsee:\n*‹/› 2 lines of code hidden*\nok")
            assert(readableText("x\n```\na") == "x\n*‹/› 1 line of code hidden*")
        }
        try? await Task.sleep(for: .seconds(2))
        await snap("1-pair")
        Client.startDemo()
        model.paired = true
        await model.refresh()
        try? await Task.sleep(for: .seconds(4)) // conversations and usage load after the agent list
        await snap("2-home")
        model.openSession = "\(Demo.id)~t1"
        try? await Task.sleep(for: .seconds(3))
        await snap("3-session")
        NotificationCenter.default.post(name: terminal, object: nil)
        try? await Task.sleep(for: .seconds(3))
        await snap("4-terminal")
        NotificationCenter.default.post(name: changes, object: nil)
        try? await Task.sleep(for: .seconds(3))
        await snap("5-changes")
        NotificationCenter.default.post(name: debate, object: nil)
        try? await Task.sleep(for: .seconds(3))
        await snap("6-debate")
    }

    static let terminal = Notification.Name("shots.terminal")
    static let changes = Notification.Name("shots.changes")
    static let debate = Notification.Name("shots.debate")

    // Waits (up to 20 s) until the script has taken the picture.
    private static func snap(_ name: String) async {
        guard let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
        let marker = dir.appendingPathComponent("ready-\(name)")
        FileManager.default.createFile(atPath: marker.path, contents: nil)
        for _ in 0..<80 where FileManager.default.fileExists(atPath: marker.path) {
            try? await Task.sleep(for: .milliseconds(250))
        }
    }
}
#endif
