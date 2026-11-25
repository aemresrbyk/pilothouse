#if DEBUG
// App Store screenshots without a screen: launch a Debug build with -shots and the app walks the demo and saves
// what its own window draws to Documents/shot-*.png. Never in Release builds.
import SwiftUI
import UIKit

enum Shots {
    @MainActor static func run(_ model: Model) async {
        // App Store's 6.9" size (440x956 pt at 3x = 1320x2868), whatever simulator this runs on.
        window?.frame = CGRect(x: 0, y: 0, width: 440, height: 956)
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

    @MainActor private static var window: UIWindow? {
        UIApplication.shared.connectedScenes.compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first
    }

    @MainActor private static func save(_ name: String) {
        guard let window, let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
        let format = UIGraphicsImageRendererFormat()
        format.scale = 3
        let image = UIGraphicsImageRenderer(bounds: window.bounds, format: format).image { _ in
            window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        }
        try? image.pngData()?.write(to: dir.appendingPathComponent("shot-\(name).png"))
    }
}
#endif
