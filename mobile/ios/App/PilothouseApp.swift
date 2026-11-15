import SwiftUI
import UserNotifications
import WidgetKit
import LocalAuthentication

@main
struct PilothouseApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var delegate
    @StateObject private var model = Model()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .preferredColorScheme(.dark)
                .tint(.lime)
                // pilothouse://session/<id> from the widget or a tapped notification.
                .onOpenURL { url in
                    if url.host == "session" { model.openSession = url.lastPathComponent }
                }
        }
    }
}

@MainActor
final class Model: ObservableObject {
    @Published var paired = Client.shared.paired
    @Published var sessions: [Session] = []
    @Published var projects: [Project] = []
    @Published var usage: [AgentUsage] = []
    @Published var conversations: [Conversation] = []
    @Published var error: String?
    @Published var openSession: String?
    private var lastWaiting = -1

    func refresh() async {
        do {
            sessions = try await Client.shared.sessions()
            error = nil
            // Keep the home-screen widget in step while the app is open.
            let waiting = sessions.filter(\.waiting).count
            if waiting != lastWaiting { lastWaiting = waiting; WidgetCenter.shared.reloadAllTimelines() }
        } catch PilotError.server(let code, _) where code == 401 {
            // This phone was removed in Pilothouse Settings.
            Client.shared.forget()
            paired = false
        } catch {
            self.error = "Cannot reach your computer. Is it awake, with Pilothouse open and Tailscale on?"
        }
    }

    func refreshProjects() async {
        if let p = try? await Client.shared.projects() { projects = p }
        if let u = try? await Client.shared.usage() { usage = u }
        if let c = try? await Client.shared.conversations() { conversations = c }
    }
}

enum Push {
    // Debug builds are signed with the development APNs environment.
    #if DEBUG
    static let sandbox = true
    #else
    static let sandbox = false
    #endif

    static func enable() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            if granted { DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() } }
        }
    }
}

enum Biometrics {
    // Face ID / passcode before a risky approval. A phone without a passcode cannot ask, so the two taps stand alone.
    static func confirm(_ reason: String) async -> Bool {
        let ctx = LAContext()
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) else { return true }
        return (try? await ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)) ?? false
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        let approve = UNNotificationAction(identifier: "APPROVE", title: "Approve", options: [.authenticationRequired])
        let approveRisky = UNNotificationAction(identifier: "APPROVE", title: "Approve risky command", options: [.authenticationRequired, .destructive])
        let deny = UNNotificationAction(identifier: "DENY", title: "Deny", options: [])
        center.setNotificationCategories([
            UNNotificationCategory(identifier: "APPROVAL", actions: [approve, deny], intentIdentifiers: []),
            UNNotificationCategory(identifier: "APPROVAL_RISKY", actions: [approveRisky, deny], intentIdentifiers: [])
        ])
        if Client.shared.paired { Push.enable() }
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { try? await Client.shared.registerPush(token: hex, sandbox: Push.sandbox) }
    }

    // Silent part of every push: refresh the widget.
    func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any]) async -> UIBackgroundFetchResult {
        WidgetCenter.shared.reloadAllTimelines()
        return .newData
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        WidgetCenter.shared.reloadAllTimelines()
        return [.banner, .sound, .list]
    }

    // Approve / Deny from the lock screen. The server refuses it if the prompt changed since the push.
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let info = response.notification.request.content.userInfo
        guard let sid = info["sid"] as? String else { return }
        let sig = info["sig"] as? String ?? ""
        switch response.actionIdentifier {
        case "APPROVE":
            if let key = info["approve"] as? String { try? await Client.shared.choose(sid, key: key, sig: sig, confirm: true) }
        case "DENY":
            if let key = info["deny"] as? String { try? await Client.shared.choose(sid, key: key, sig: sig, confirm: false) }
        default:
            if let url = URL(string: "pilothouse://session/\(sid)") { await UIApplication.shared.open(url) }
        }
        WidgetCenter.shared.reloadAllTimelines()
    }
}
