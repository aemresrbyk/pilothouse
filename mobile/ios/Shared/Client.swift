// Talks to Pilothouse's phone remote API (electron/remote.ts) on the computer's Tailscale address.
// Shared by the app and the widget: the computer's address lives in the app group, the device token in the keychain.
import Foundation
import Security

let appGroup = "group.com.aemresrbyk.pilothouse"
// shortcut: team prefix hardcoded; read it from the provisioning profile if the app moves to another team.
let keychainGroup = "RHN7LUWPD2.com.aemresrbyk.pilothouse.shared"

struct Choice: Codable, Hashable { let key: String; let label: String }

struct Session: Codable, Identifiable, Hashable {
    let id: String
    let project: String
    let projectId: String
    let agent: String // "Claude Code", "Codex", … or "Terminal"
    let status: String // waiting | running | idle
    let tail: String
    let choices: [Choice]
    let risk: String // danger | normal
    let sig: String
    let summary: String
    let preview: String // the agent's last message, without TUI chrome
    var waiting: Bool { status == "waiting" }
    var risky: Bool { risk == "danger" }
}

struct Project: Codable, Identifiable, Hashable { let id: String; let name: String }

struct UsageWindow: Codable, Hashable { let label: String; let usedPercent: Double; let resetsAt: Double? }
struct AgentUsage: Codable, Identifiable, Hashable {
    let agent: String
    let windows: [UsageWindow]
    let plan: String?
    let updatedAt: Double?
    let note: String?
    var id: String { agent }
}

struct TodoItem: Codable, Hashable { let file: String; let line: Int; let text: String; let kind: String }
struct TodoList: Codable { let project: String; let items: [TodoItem] }
struct DiffResult: Codable { let project: String; let stat: String; let diff: String; let untracked: [String] }

enum PilotError: LocalizedError {
    case notPaired, badLink, server(Int, String)
    var errorDescription: String? {
        switch self {
        case .notPaired: return "Not paired with a computer."
        case .badLink: return "That is not a Pilothouse pairing code. Use the QR code in Pilothouse → Settings → Phone remote."
        case .server(_, let message): return message
        }
    }
}

enum Keychain {
    private static func query(_ key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrAccount as String: key, kSecAttrAccessGroup as String: keychainGroup]
    }
    static func set(_ value: String?, for key: String) {
        SecItemDelete(query(key) as CFDictionary)
        guard let value else { return }
        var add = query(key)
        add[kSecValueData as String] = Data(value.utf8)
        // The widget and lock-screen actions run while the phone is locked, after its first unlock.
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }
    static func get(_ key: String) -> String? {
        var q = query(key)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
}

final class Client {
    static let shared = Client()
    private let defaults = UserDefaults(suiteName: appGroup)!

    var base: URL? { defaults.string(forKey: "base").flatMap(URL.init(string:)) }
    var paired: Bool { base != nil && Keychain.get("token") != nil }

    private struct ErrorBody: Decodable { let error: String }
    private struct OK: Decodable { let ok: Bool }
    private struct Paired: Decodable { let token: String }

    func send<T: Decodable>(_ method: String, _ path: String, _ body: [String: Any]? = nil, base: URL? = nil, auth: Bool = true) async throws -> T {
        guard let root = base ?? self.base, let url = URL(string: path, relativeTo: root) else { throw PilotError.notPaired }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.timeoutInterval = 10
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if auth {
            guard let token = Keychain.get("token") else { throw PilotError.notPaired }
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body { req.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let (data, response) = try await URLSession.shared.data(for: req)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard code == 200 else {
            throw PilotError.server(code, (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error ?? "Error \(code)")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    // link: http://100.x.y.z:4747/#p=<pairing code>, from the QR code in Pilothouse Settings.
    func pair(link: String, name: String) async throws {
        guard var parts = URLComponents(string: link.trimmingCharacters(in: .whitespacesAndNewlines)),
              let fragment = parts.fragment, fragment.hasPrefix("p="), parts.scheme == "http" else { throw PilotError.badLink }
        parts.fragment = nil
        parts.path = "/"
        guard let base = parts.url else { throw PilotError.badLink }
        let res: Paired = try await send("POST", "/api/pair", ["secret": String(fragment.dropFirst(2)), "name": name], base: base, auth: false)
        defaults.set(base.absoluteString, forKey: "base")
        Keychain.set(res.token, for: "token")
    }

    func forget() {
        Keychain.set(nil, for: "token")
        defaults.removeObject(forKey: "base")
    }

    func unpair() async {
        let _: OK? = try? await send("POST", "/api/unpair", [:])
        forget()
    }

    func sessions() async throws -> [Session] { try await send("GET", "/api/sessions") }
    func projects() async throws -> [Project] { try await send("GET", "/api/projects") }
    func usage() async throws -> [AgentUsage] { try await send("GET", "/api/usage") }
    func todos(_ projectId: String) async throws -> TodoList {
        try await send("GET", "/api/todos?project=\(projectId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? projectId)")
    }
    func diff(_ id: String) async throws -> DiffResult {
        try await send("GET", "/api/diff?id=\(id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? id)")
    }
    func choose(_ id: String, key: String, sig: String, confirm: Bool) async throws {
        let _: OK = try await send("POST", "/api/choose", ["id": id, "key": key, "sig": sig, "confirm": confirm])
    }
    func message(_ id: String, _ text: String) async throws { let _: OK = try await send("POST", "/api/send", ["id": id, "text": text]) }
    func stop(_ id: String) async throws { let _: OK = try await send("POST", "/api/stop", ["id": id]) }
    func open(_ projectId: String) async throws { let _: OK = try await send("POST", "/api/open", ["project": projectId]) }
    func registerPush(token: String, sandbox: Bool) async throws {
        let _: OK = try await send("POST", "/api/push-token", ["token": token, "sandbox": sandbox])
    }
}
