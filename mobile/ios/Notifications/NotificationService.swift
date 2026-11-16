// Decrypts notifications that came through the Pilothouse relay: the relay only ever sees ciphertext; the text
// was encrypted on your computer with the key this iPhone got when it registered for notifications.
import UserNotifications
import CryptoKit

final class NotificationService: UNNotificationServiceExtension {
    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else { return contentHandler(request.content) }
        // Several computers: each has its own key for this phone; the one that opens the box sent it.
        if let enc = content.userInfo["enc"] as? String,
           let blob = Data(base64Encoded: enc),
           let box = try? AES.GCM.SealedBox(combined: blob),
           let (computer, plain) = Client.all.lazy.compactMap({ c -> (Client, Data)? in
               guard let k = c.pushKey.flatMap({ Data(base64Encoded: $0) }), let p = try? AES.GCM.open(box, using: SymmetricKey(data: k)) else { return nil }
               return (c, p)
           }).first,
           var fields = try? JSONSerialization.jsonObject(with: plain) as? [String: Any] {
            fields["computer"] = computer.id
            if Client.all.count > 1, let title = fields["title"] as? String { fields["title"] = "\(title) · \(computer.name)" }
            if let title = fields["title"] as? String { content.title = title; content.threadIdentifier = title }
            if let body = fields["body"] as? String { content.body = body }
            // sid / sig / approve / deny: what the Approve and Deny buttons need.
            var info = content.userInfo
            for (k, v) in fields { info[k] = v }
            info.removeValue(forKey: "enc")
            content.userInfo = info
        }
        contentHandler(content)
    }
}
