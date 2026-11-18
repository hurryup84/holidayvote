import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
    private let message = UILabel()
    private let done = UIButton(type: .system)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        message.numberOfLines = 0
        message.textAlignment = .center
        message.text = NSLocalizedString("reading", comment: "")
        done.setTitle(NSLocalizedString("done", comment: ""), for: .normal)
        done.addTarget(self, action: #selector(finish), for: .touchUpInside)
        done.isEnabled = false
        let stack = UIStackView(arrangedSubviews: [message, done])
        stack.axis = .vertical
        stack.spacing = 24
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -24),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
        readLink()
    }

    private func readLink() {
        let items = extensionContext?.inputItems.compactMap { $0 as? NSExtensionItem } ?? []
        let providers = items.flatMap { item in (item.attachments ?? []).map { ($0, item.attributedTitle?.string) } }
        // Prefer a URL attachment over a browser's additional plain-text title.
        for type in [UTType.url.identifier, UTType.plainText.identifier] {
            guard let (provider, title) = providers.first(where: { $0.0.hasItemConformingToTypeIdentifier(type) }) else { continue }
            provider.loadItem(forTypeIdentifier: type, options: nil) { [weak self] item, error in
                DispatchQueue.main.async {
                    guard let self = self else { return }
                    if let error = error {
                        self.fail(error)
                    } else if let url = item as? URL {
                        self.save(text: url.absoluteString, title: title)
                    } else if let text = item as? String {
                        self.save(text: text, title: title)
                    } else {
                        self.fail(nil)
                    }
                }
            }
            return
        }
        if let text = items.first?.attributedContentText?.string {
            save(text: text, title: items.first?.attributedTitle?.string)
        } else {
            fail(nil)
        }
    }

    private func save(text: String, title: String?) {
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue),
              detector.matches(in: text, range: NSRange(text.startIndex..., in: text)).contains(where: {
                  ["http", "https"].contains($0.url?.scheme?.lowercased() ?? "")
              }) else {
            fail(nil)
            return
        }
        do {
            try IncomingShareStore.save(text: text, title: title == text ? nil : title)
            saved()
        } catch {
            fail(error)
        }
    }

    /// Opens HolidayVote, which reads the share from the inbox and shows the add-house flow.
    /// If the app can't be opened, the share stays in the inbox and the user opens the app manually.
    private func saved() {
        message.text = NSLocalizedString("saved", comment: "")
        done.isEnabled = true
        openHostApp { [weak self] opened in
            if opened { self?.finish() }
        }
    }

    /// Extensions can't use UIApplication.shared; reach the UIApplication through the responder chain and call
    /// open(_:options:completionHandler:) dynamically (the plain openURL: selector no longer works since iOS 18).
    private func openHostApp(completion: @escaping (Bool) -> Void) {
        guard let url = URL(string: "com.moidev.holidayvote://shared-link") else { return completion(false) }
        let selector = NSSelectorFromString("openURL:options:completionHandler:")
        var responder: UIResponder? = self
        while let current = responder {
            if let application = current as? UIApplication, application.responds(to: selector) {
                typealias OpenURL = @convention(c) (
                    NSObject, Selector, NSURL, NSDictionary, @convention(block) (Bool) -> Void
                ) -> Void
                let open = unsafeBitCast(application.method(for: selector), to: OpenURL.self)
                let handler: @convention(block) (Bool) -> Void = { opened in
                    DispatchQueue.main.async { completion(opened) }
                }
                open(application, selector, url as NSURL, NSDictionary(), handler)
                return
            }
            responder = current.next
        }
        completion(false)
    }

    private func fail(_ error: Error?) {
        if let error = error { NSLog("[incoming-share] %@", error.localizedDescription) }
        message.text = NSLocalizedString(error == nil ? "invalid" : "failed", comment: "")
        done.isEnabled = true
    }

    @objc private func finish() {
        extensionContext?.completeRequest(returningItems: nil)
    }
}
