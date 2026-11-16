// Talks to Pilothouse's remote API (electron/remote.ts), one of two ways:
//  - Tailscale: straight to the computer's tailnet address (http://100.x.y.z:4747).
//  - Relay: through relay.usepilothouse.com, every request and reply sealed with AES-256-GCM using a key only this
//    phone and the computer hold (electron/relayLink.ts has the other side). No Tailscale needed.
// Shared by the app, the widget and the notification extension: addresses in the app group, secrets in the keychain.
import Foundation
import Security
import CryptoKit

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

struct Conversation: Codable, Identifiable, Hashable {
    let key: String // "claude:<session id>"
    let agent: String
    let project: String
    let projectId: String
    let title: String
    let updatedAt: Double
    let live: Bool
    var id: String { key }
}
struct ChatMessage: Codable, Hashable { let role: String; let text: String; let time: String? }
struct ChatLog: Codable { let messages: [ChatMessage]; let live: Bool }

struct TodoItem: Codable, Hashable { let file: String; let line: Int; let text: String; let kind: String }
struct TodoList: Codable { let project: String; let items: [TodoItem] }
struct DiffResult: Codable { let project: String; let stat: String; let diff: String; let untracked: [String] }
// The live terminal: each line is runs of ["text", "#rrggbb" or "" for default, bold?].
struct ScreenRun: Decodable, Hashable {
    let text: String; let color: String; let bold: Bool
    init(from decoder: Decoder) throws {
        var c = try decoder.unkeyedContainer()
        text = try c.decode(String.self)
        color = try c.decode(String.self)
        bold = c.isAtEnd ? false : try c.decode(Bool.self)
    }
}
struct ScreenSnapshot: Decodable, Equatable {
    struct Cursor: Decodable, Equatable { let x: Int; let y: Int }
    let cols: Int; let rows: Int; let lines: [[ScreenRun]]; let cursor: Cursor
}

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
    var relayRoom: String? { defaults.string(forKey: "relayRoom") }
    var paired: Bool { (base != nil || relayRoom != nil) && Keychain.get("token") != nil }
    // Shown in Settings: where this phone reaches the computer.
    var connection: String { relayRoom != nil ? "Pilothouse relay (end-to-end encrypted)" : base?.host ?? "Not paired" }

    private struct ErrorBody: Decodable { let error: String }
    private struct OK: Decodable { let ok: Bool }
    private struct Paired: Decodable { let token: String; let device: String?; let relayKey: String? }

    func send<T: Decodable>(_ method: String, _ path: String, _ body: [String: Any]? = nil, base: URL? = nil, auth: Bool = true) async throws -> T {
        if base == nil, let room = relayRoom {
            guard let device = defaults.string(forKey: "relayDevice"), let key = Keychain.get("relayKey"), let token = Keychain.get("token")
            else { throw PilotError.notPaired }
            let (code, data) = try await RelayLink.shared.request(room: room, device: device, key: key, token: token, method: method, path: path, body: body ?? [:])
            return try decode(code, data)
        }
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
        return try decode((response as? HTTPURLResponse)?.statusCode ?? 0, data)
    }

    private func decode<T: Decodable>(_ code: Int, _ data: Data) throws -> T {
        guard code == 200 else {
            throw PilotError.server(code, (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error ?? "Error \(code)")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    // link, from the QR code in Pilothouse Settings:
    //   https://usepilothouse.com/app/#r=<room>&p=<pairing code>   (relay, works anywhere)
    //   http://100.x.y.z:4747/#p=<pairing code>                     (Tailscale)
    func pair(link: String, name: String) async throws {
        let text = link.trimmingCharacters(in: .whitespacesAndNewlines)
        if let parts = URLComponents(string: text), parts.scheme == "https", parts.host == "usepilothouse.com" || parts.host == "www.usepilothouse.com" {
            let fields = Dictionary((parts.fragment ?? "").split(separator: "&").compactMap { kv -> (String, String)? in
                let p = kv.split(separator: "=", maxSplits: 1); return p.count == 2 ? (String(p[0]), String(p[1])) : nil
            }, uniquingKeysWith: { a, _ in a })
            guard let room = fields["r"], room.count == 32, let code = fields["p"] else { throw PilotError.badLink }
            let (status, data) = try await RelayLink.shared.request(room: room, device: "pair", key: nil, pairCode: code, token: nil,
                                                                    method: "POST", path: "/api/pair", body: ["secret": code, "name": name])
            let res: Paired = try decode(status, data)
            guard let device = res.device, let relayKey = res.relayKey else { throw PilotError.badLink }
            defaults.removeObject(forKey: "base")
            defaults.set(room, forKey: "relayRoom")
            defaults.set(device, forKey: "relayDevice")
            Keychain.set(relayKey, for: "relayKey")
            Keychain.set(res.token, for: "token")
            return
        }
        guard var parts = URLComponents(string: link.trimmingCharacters(in: .whitespacesAndNewlines)),
              let fragment = parts.fragment, fragment.hasPrefix("p="), parts.scheme == "http" else { throw PilotError.badLink }
        parts.fragment = nil
        parts.path = "/"
        guard let base = parts.url else { throw PilotError.badLink }
        let res: Paired = try await send("POST", "/api/pair", ["secret": String(fragment.dropFirst(2)), "name": name], base: base, auth: false)
        defaults.set(base.absoluteString, forKey: "base")
        defaults.removeObject(forKey: "relayRoom")
        Keychain.set(res.token, for: "token")
    }

    func forget() {
        Keychain.set(nil, for: "token")
        Keychain.set(nil, for: "pushKey")
        Keychain.set(nil, for: "relayKey")
        defaults.removeObject(forKey: "base")
        defaults.removeObject(forKey: "relayRoom")
        defaults.removeObject(forKey: "relayDevice")
    }

    func unpair() async {
        let _: OK? = try? await send("POST", "/api/unpair", [:])
        forget()
    }

    func sessions() async throws -> [Session] { try await send("GET", "/api/sessions") }
    func projects() async throws -> [Project] { try await send("GET", "/api/projects") }
    func usage() async throws -> [AgentUsage] { try await send("GET", "/api/usage") }
    func conversations() async throws -> [Conversation] { try await send("GET", "/api/conversations") }
    func conversation(_ key: String) async throws -> ChatLog {
        try await send("GET", "/api/conversation?key=\(key.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? key)")
    }
    func tabChat(_ id: String) async throws -> ChatLog {
        try await send("GET", "/api/tab-chat?id=\(id.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? id)")
    }
    func resume(_ key: String) async throws { let _: OK = try await send("POST", "/api/resume", ["key": key]) }
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
    func screen(_ id: String) async throws -> ScreenSnapshot {
        try await send("GET", "/api/screen?id=\(id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? id)")
    }
    // Raw keys for the terminal: arrows, Esc, Tab, Enter, Ctrl+C.
    func keys(_ id: String, _ data: String) async throws { let _: OK = try await send("POST", "/api/keys", ["id": id, "data": data]) }
    func stop(_ id: String) async throws { let _: OK = try await send("POST", "/api/stop", ["id": id]) }
    func open(_ projectId: String) async throws { let _: OK = try await send("POST", "/api/open", ["project": projectId]) }
    // This Live Activity's push token: the computer updates the lock-screen counts with it.
    func registerActivity(token: String, sandbox: Bool) async throws { let _: OK = try await send("POST", "/api/activity-token", ["token": token, "sandbox": sandbox]) }
    private struct PushRegistered: Decodable { let pushKey: String? }
    // The computer answers with this phone's notification key; the extension decrypts pushes with it.
    func registerPush(token: String, sandbox: Bool) async throws {
        let res: PushRegistered = try await send("POST", "/api/push-token", ["token": token, "sandbox": sandbox])
        if let key = res.pushKey { Keychain.set(key, for: "pushKey") }
    }
}

// One WebSocket to the computer's room on the relay; requests are matched to replies by id.
actor RelayLink {
    static let shared = RelayLink()
    static let endpoint = "wss://relay.usepilothouse.com/room/"
    private var socket: URLSessionWebSocketTask?
    private var room = ""
    private var waiting: [String: CheckedContinuation<(Int, Data), Error>] = [:]
    private var keys: [String: SymmetricKey] = [:] // device id ("pair" while pairing) -> key, to open replies

    func request(room: String, device: String, key: String?, pairCode: String? = nil, token: String?,
                 method: String, path: String, body: [String: Any]) async throws -> (Int, Data) {
        let symmetric: SymmetricKey
        if let pairCode { symmetric = SymmetricKey(data: SHA256.hash(data: Data(pairCode.utf8))) }
        else if let key, let raw = Data(base64Encoded: key) { symmetric = SymmetricKey(data: raw) }
        else { throw PilotError.notPaired }
        keys[device] = symmetric
        let ws = connect(room)
        let id = UUID().uuidString
        var plain: [String: Any] = ["id": id, "t": Int(Date().timeIntervalSince1970 * 1000), "n": UUID().uuidString,
                                    "m": method, "p": path, "b": body]
        if let token { plain["a"] = token }
        let sealed = try AES.GCM.seal(try JSONSerialization.data(withJSONObject: plain), using: symmetric, authenticating: Data(device.utf8))
        guard let box = sealed.combined?.base64EncodedString() else { throw PilotError.server(0, "Could not encrypt") }
        let envelope = String(data: try JSONSerialization.data(withJSONObject: ["d": device, "c": box]), encoding: .utf8)!
        return try await withCheckedThrowingContinuation { cont in
            waiting[id] = cont
            ws.send(.string(envelope)) { error in if let error { Task { await self.fail(id, error) } } }
            Task { try? await Task.sleep(for: .seconds(15)); await self.fail(id, PilotError.server(0, "Your computer did not answer. Is Pilothouse open?")) }
        }
    }

    private func connect(_ room: String) -> URLSessionWebSocketTask {
        if let socket, self.room == room, socket.state == .running { return socket }
        socket?.cancel()
        var req = URLRequest(url: URL(string: Self.endpoint + room)!)
        req.setValue("https://usepilothouse.com", forHTTPHeaderField: "Origin")
        let ws = URLSession.shared.webSocketTask(with: req)
        socket = ws
        self.room = room
        ws.resume()
        listen(ws)
        return ws
    }

    private nonisolated func listen(_ ws: URLSessionWebSocketTask) {
        ws.receive { result in
            Task {
                switch result {
                case .success(.string(let text)): await self.handle(text); self.listen(ws)
                case .success: self.listen(ws)
                case .failure(let error): await self.dropAll(ws, error)
                }
            }
        }
    }

    private func handle(_ text: String) {
        guard let env = try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any] else { return }
        if env["offline"] as? Bool == true {
            return failAll(PilotError.server(0, "Your computer is offline, asleep, or Pilothouse is closed."))
        }
        guard let d = env["d"] as? String, let c = env["c"] as? String, let key = keys[d], let raw = Data(base64Encoded: c),
              let box = try? AES.GCM.SealedBox(combined: raw),
              let plain = try? AES.GCM.open(box, using: key, authenticating: Data(d.utf8)),
              let reply = try? JSONSerialization.jsonObject(with: plain) as? [String: Any],
              let id = reply["id"] as? String, let cont = waiting.removeValue(forKey: id) else { return }
        let body = (try? JSONSerialization.data(withJSONObject: reply["b"] ?? [:], options: .fragmentsAllowed)) ?? Data("{}".utf8)
        cont.resume(returning: ((reply["s"] as? Int) ?? 0, body))
    }

    private func fail(_ id: String, _ error: Error) { waiting.removeValue(forKey: id)?.resume(throwing: error) }
    private func failAll(_ error: Error) { for (_, c) in waiting { c.resume(throwing: error) }; waiting = [:] }
    private func dropAll(_ ws: URLSessionWebSocketTask, _ error: Error) {
        if socket === ws { socket = nil }
        failAll(PilotError.server(0, "Cannot reach the Pilothouse relay. Check your internet connection."))
    }
}
