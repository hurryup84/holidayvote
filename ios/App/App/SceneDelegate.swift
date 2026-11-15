import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = HolidayVoteViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    class HolidayVoteViewController: CAPBridgeViewController {
        override func capacitorDidLoad() {
            bridge?.registerPluginInstance(IncomingSharePlugin())
        }
    }

    @objc(IncomingSharePlugin)
    class IncomingSharePlugin: CAPPlugin, CAPBridgedPlugin {
        let identifier = "IncomingSharePlugin"
        let jsName = "IncomingShare"
        let pluginMethods: [CAPPluginMethod] = [
            CAPPluginMethod(name: "pending", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
        ]

        @objc func pending(_ call: CAPPluginCall) {
            do {
                let shares = try IncomingShareStore.pending().map { share -> [String: Any] in
                    var result: [String: Any] = ["id": share.id, "text": share.text]
                    if let title = share.title { result["title"] = title }
                    return result
                }
                call.resolve(["shares": shares])
            } catch {
                call.reject("Could not read shared holiday homes", nil, error)
            }
        }

        @objc func remove(_ call: CAPPluginCall) {
            guard let id = call.getString("id") else {
                call.reject("Missing share id")
                return
            }
            do {
                try IncomingShareStore.remove(id: id)
                call.resolve()
            } catch {
                call.reject("Could not remove shared holiday home", nil, error)
            }
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
