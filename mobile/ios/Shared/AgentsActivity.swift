// Live Activity: how many agents need you and how many are working, on the lock screen and in the Dynamic Island.
// The computer updates it with Live Activity pushes. Their content cannot be encrypted (the system draws it), so it
// holds two numbers and nothing else: no project names, no commands.
import ActivityKit

struct AgentsActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var needsYou: Int
        var working: Int
    }
}
