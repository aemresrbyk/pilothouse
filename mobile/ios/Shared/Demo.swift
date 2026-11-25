// Demo computer: sample agents and replies made up on the phone, so the app can be tried (and reviewed) without
// pairing a computer. Nothing leaves the phone. Client(id: "demo") answers from here instead of the network.
import Foundation

enum Demo {
    static let id = "demo"
    static var answered = false // the sample approval was answered; the tab moves on to "running"

    static func reply(_ method: String, _ path: String) -> Data {
        let route = path.split(separator: "?").first.map(String.init) ?? path
        if method == "POST" {
            if route == "/api/choose" { answered = true }
            return json(["ok": true])
        }
        switch route {
        case "/api/sessions": return json(sessions)
        case "/api/projects": return json([["id": "web", "name": "storefront"], ["id": "api", "name": "billing-api"], ["id": "ios", "name": "ios-app"]])
        case "/api/usage": return json([
            ["agent": "Claude Code", "plan": "Pro", "windows": [["label": "5 hours", "usedPercent": 42], ["label": "week", "usedPercent": 18]]],
            ["agent": "Codex", "windows": [["label": "5 hours", "usedPercent": 10]]]
        ])
        case "/api/conversations": return json([
            ["key": "claude:demo1", "agent": "Claude Code", "project": "storefront", "projectId": "web", "title": "Add Apple Pay to checkout", "updatedAt": now - 120_000, "live": true],
            ["key": "codex:demo2", "agent": "Codex", "project": "billing-api", "projectId": "api", "title": "Fix rounding in invoice totals", "updatedAt": now - 3_600_000, "live": false]
        ])
        case "/api/conversation", "/api/tab-chat": return json(["live": true, "messages": [
            ["role": "user", "text": "Add Apple Pay to the checkout page."],
            ["role": "assistant", "text": "Added the Apple Pay button and the payment request in Checkout.tsx. The tests pass. Shall I run the build?"]
        ]])
        case "/api/todos": return json(["project": "storefront", "items": [
            ["file": "src/Checkout.tsx", "line": 88, "text": "handle declined cards", "kind": "TODO"],
            ["file": "src/cart.ts", "line": 12, "text": "rounding on discounts", "kind": "FIXME"]
        ]])
        case "/api/diff": return json(["project": "storefront", "stat": " src/Checkout.tsx | 24 ++++++++++++++++++------\n 1 file changed, 18 insertions(+), 6 deletions(-)", "untracked": [],
            "diff": "--- a/src/Checkout.tsx\n+++ b/src/Checkout.tsx\n@@ -40,6 +40,12 @@\n   return (\n     <form onSubmit={pay}>\n+      <ApplePayButton\n+        amount={total}\n+        onAuthorized={confirm}\n+      />\n       <CardFields />\n-      <button>Pay</button>\n+      <button type=\"submit\">Pay {format(total)}</button>\n     </form>"])
        case "/api/debate": return json(["project": "storefront", "agents": ["claude", "codex"], "running": false,
            "markdown": "# Debate: Stripe or Apple Pay first?\n\n## 1. Claude Code\n\nApple Pay first: most checkouts are on iPhone and it skips the card form.\n\nAGREE\n\n## 2. Codex\n\nAgreed, but keep the card form as the fallback.\n\nAGREE\n\n---\n\n## Decision\n\nShip Apple Pay first, card form as fallback.\n\n## Tasks\n\n1. Add the Apple Pay button\n2. Test a declined payment"])
        case "/api/screen": return json(["cols": 60, "rows": 14, "cursor": ["x": 2, "y": 11], "lines": screen])
        default: return json(["error": "Not in the demo"])
        }
    }

    private static var now: Double { Date().timeIntervalSince1970 * 1000 }
    private static var sessions: [[String: Any]] {
        [
            answered
                ? session("t1", "storefront", "web", "Claude Code", "running", preview: "Running the build…")
                : session("t1", "storefront", "web", "Claude Code", "waiting", summary: "Run npm run build?", preview: "Tests pass. Shall I run the build?",
                          choices: [["key": "1", "label": "Yes"], ["key": "2", "label": "Yes, and don't ask again"], ["key": "3", "label": "No"]]),
            session("t2", "billing-api", "api", "Codex", "running", preview: "Fixing rounding in invoice totals"),
            session("t3", "ios-app", "ios", "opencode", "idle", preview: "Done: dark mode for the settings screen.")
        ]
    }
    private static func session(_ id: String, _ project: String, _ pid: String, _ agent: String, _ status: String,
                                summary: String = "", preview: String, choices: [[String: String]] = []) -> [String: Any] {
        ["id": id, "project": project, "projectId": pid, "agent": agent, "status": status, "tail": preview, "choices": choices,
         "risk": "normal", "sig": "demo", "summary": summary.isEmpty ? preview : summary, "preview": preview]
    }
    private static var screen: [[[Any]]] {
        let lime = "#c8ff2e", dim = "#8a8f98"
        return [
            [["> Add Apple Pay to the checkout page.", lime, true]], [],
            [["⏺ ", lime], ["Added ApplePayButton to src/Checkout.tsx", ""]],
            [["⏺ ", lime], ["Ran npm test: 48 passed", ""]], [],
            [["Tests pass. Shall I run the build?", "", true]], [],
            [["Bash command: ", dim], ["npm run build", "", true]],
            [["❯ 1. Yes", lime, true]], [["  2. Yes, and don't ask again", ""]], [["  3. No", ""]], [["> ", dim]], [], []
        ]
    }
    private static func json(_ value: Any) -> Data { (try? JSONSerialization.data(withJSONObject: value)) ?? Data("{}".utf8) }
}
