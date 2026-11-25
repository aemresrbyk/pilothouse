import SwiftUI
import ActivityKit
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
                #if DEBUG
                .task { if CommandLine.arguments.contains("-shots") { await Shots.run(model) } }
                #endif
        }
    }
}

@MainActor
final class Model: ObservableObject {
    @Published var paired = Client.anyPaired
    @Published var sessions: [Session] = []
    @Published var projects: [Project] = []
    @Published var usage: [AgentUsage] = []
    @Published var conversations: [Conversation] = []
    @Published var error: String?
    @Published var openSession: String?
    private var lastWaiting = -1

    // Every paired computer at once; one that does not answer is named, the others still show.
    func refresh() async {
        let computers = Client.all
        var all: [Session] = [], down: [String] = []
        await withTaskGroup(of: (Client, Result<[Session], Error>).self) { group in
            for c in computers { group.addTask { do { return (c, .success(try await c.sessions())) } catch { return (c, .failure(error)) } } }
            for await (c, r) in group {
                switch r {
                case .success(let list): all += list
                case .failure(PilotError.server(401, _)): c.forget() // this phone was removed in that computer's Settings
                case .failure: down.append(c.name)
                }
            }
        }
        let order = ["waiting": 0, "running": 1, "idle": 2]
        sessions = all.sorted { (order[$0.status] ?? 3, $0.computerName, $0.project) < (order[$1.status] ?? 3, $1.computerName, $1.project) }
        paired = Client.anyPaired
        error = down.isEmpty ? nil : (computers.count > 1
            ? "Cannot reach \(down.joined(separator: ", ")). Is it awake, with Pilothouse open and Remote control on?"
            : "Cannot reach your computer. Is it awake, with Pilothouse open and Remote control on?")
        // Keep the home-screen widget and the Live Activity in step while the app is open.
        let waiting = sessions.filter(\.waiting).count
        if waiting != lastWaiting { lastWaiting = waiting; WidgetCenter.shared.reloadAllTimelines() }
        Live.update(needsYou: waiting, working: sessions.filter { $0.status == "running" }.count)
    }

    func refreshProjects() async {
        var p: [Project] = [], u: [AgentUsage] = [], cv: [Conversation] = []
        for c in Client.all {
            p += (try? await c.projects()) ?? []
            u += (try? await c.usage()) ?? []
            cv += (try? await c.conversations()) ?? []
        }
        projects = p; usage = u
        conversations = cv.sorted { $0.updatedAt > $1.updatedAt }
    }
    var severalComputers: Bool { Client.all.count > 1 }
}

enum Push {
    // Debug builds are signed with the development APNs environment.
    #if DEBUG
    static let sandbox = true
    #else
    static let sandbox = false
    #endif

    static func enable() {
        #if DEBUG
        if CommandLine.arguments.contains("-shots") { return } // no permission alert over App Store screenshots
        #endif
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            if granted { DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() } }
        }
    }
}

// Live Activity: started while the app is open and agents are busy; afterwards the computer keeps it current
// with Live Activity pushes (it gets this activity's push token), and ends it when nothing is left.
@MainActor
enum Live {
    static func update(needsYou: Int, working: Int) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        let state = AgentsActivityAttributes.ContentState(needsYou: needsYou, working: working)
        let current = Activity<AgentsActivityAttributes>.activities.first
        if needsYou + working == 0 {
            if let current { Task { await current.end(ActivityContent(state: state, staleDate: nil), dismissalPolicy: .default) } }
            return
        }
        if let current {
            Task { await current.update(ActivityContent(state: state, staleDate: nil)) }
            return
        }
        guard let activity = try? Activity.request(attributes: AgentsActivityAttributes(), content: ActivityContent(state: state, staleDate: nil), pushType: .token) else { return }
        Task {
            for await token in activity.pushTokenUpdates {
                let hex = token.map { String(format: "%02x", $0) }.joined()
                for c in Client.all { try? await c.registerActivity(token: hex, sandbox: Push.sandbox) }
            }
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
        if Client.anyPaired { Push.enable() }
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { for c in Client.all { try? await c.registerPush(token: hex, sandbox: Push.sandbox) } }
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
        // The notification extension notes which computer sent it (the one whose key opened it).
        let client = Client.of(info["computer"] as? String ?? "")
        switch response.actionIdentifier {
        case "APPROVE":
            if let key = info["approve"] as? String { try? await client.choose(sid, key: key, sig: sig, confirm: true) }
        case "DENY":
            if let key = info["deny"] as? String { try? await client.choose(sid, key: key, sig: sig, confirm: false) }
        default:
            if let url = URL(string: "pilothouse://session/\(client.id)~\(sid)") { await UIApplication.shared.open(url) }
        }
        WidgetCenter.shared.reloadAllTimelines()
    }
}
