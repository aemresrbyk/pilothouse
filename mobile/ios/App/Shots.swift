#if DEBUG
// App Store screenshots without a screen: launch a Debug build with -shots and the app walks the demo and saves
// what its own window draws to Documents/shot-*.png. Never in Release builds.
import SwiftUI
import UIKit

enum Shots {
    @MainActor static func run(_ model: Model) async {
        try? await Task.sleep(for: .seconds(2))
        save("1-pair")
        Client.startDemo()
        model.paired = true
        await model.refresh()
        try? await Task.sleep(for: .seconds(2))
        save("2-home")
        model.openSession = "\(Demo.id)~t1"
        try? await Task.sleep(for: .seconds(3))
        save("3-session")
    }

    @MainActor private static func save(_ name: String) {
        guard let window = UIApplication.shared.connectedScenes.compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first,
              let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
        let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
            window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        }
        try? image.pngData()?.write(to: dir.appendingPathComponent("shot-\(name).png"))
    }
}
#endif
