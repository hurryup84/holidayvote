import Foundation

struct SharedHolidayHomeLink: Codable {
    let id: String
    let text: String
    let title: String?
    let createdAt: TimeInterval
}

enum IncomingShareStore {
    static func directory() throws -> URL {
        guard let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: "group.com.moidev.holidayvote"
        ) else {
            throw NSError(domain: "IncomingShare", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "Shared holiday-home storage is unavailable. Check App Group signing."])
        }
        let directory = container.appendingPathComponent("SharedHouses", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }

    static func save(text: String, title: String?) throws {
        let share = SharedHolidayHomeLink(id: UUID().uuidString, text: text, title: title,
                                        createdAt: Date().timeIntervalSince1970)
        let destination = try directory().appendingPathComponent(share.id + ".json")
        try JSONEncoder().encode(share).write(to: destination, options: .atomic)
    }

    static func pending() throws -> [SharedHolidayHomeLink] {
        let files = try FileManager.default.contentsOfDirectory(
            at: directory(), includingPropertiesForKeys: nil, options: .skipsHiddenFiles
        ).filter { $0.pathExtension == "json" }
        return try files.map { try JSONDecoder().decode(SharedHolidayHomeLink.self, from: Data(contentsOf: $0)) }
            .sorted { $0.createdAt < $1.createdAt }
    }

    static func remove(id: String) throws {
        guard UUID(uuidString: id) != nil else {
            throw NSError(domain: "IncomingShare", code: 2,
                          userInfo: [NSLocalizedDescriptionKey: "Invalid shared holiday-home id"])
        }
        let file = try directory().appendingPathComponent(id + ".json")
        if FileManager.default.fileExists(atPath: file.path) {
            try FileManager.default.removeItem(at: file)
        }
    }
}
