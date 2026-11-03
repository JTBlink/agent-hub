// Native macOS regression. Requires Vite on :1420.
// Run: swift tests/browser/terminal-rendering-webkit.swift
import Cocoa
import WebKit

final class TerminalRenderingRunner: NSObject, WKNavigationDelegate {
    let web = WKWebView(frame: NSRect(x: 0, y: 0, width: 1100, height: 700))
    var timeout: Timer?

    override init() {
        super.init()
        web.navigationDelegate = self
        timeout = Timer.scheduledTimer(withTimeInterval: 45, repeats: false) { _ in
            print("FAIL: WebKit terminal regression timed out")
            exit(1)
        }
        let origin = CommandLine.arguments.dropFirst().first ?? "http://127.0.0.1:1420"
        web.load(URLRequest(url: URL(string:
            "\(origin)/tests/browser/terminal-rendering.html")!))
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        let script = """
        while (!window.runTerminalRenderingRegression)
          await new Promise(resolve => setTimeout(resolve, 100));
        return await window.runTerminalRenderingRegression();
        """
        web.callAsyncJavaScript(script, arguments: [:], in: nil, in: .page,
                               completionHandler: { result in
            guard case .success(let raw) = result,
                  let values = raw as? [String: Any] else {
                print("FAIL: \(result)")
                exit(1)
            }
            let checks = ["mediumTextReady", "iconsReady", "iconPixelsCorrect",
                          "textGridCorrect", "coldFontsRecovered", "iconAspectsCorrect", "cacheStable",
                          "gridFits", "noOuterInsets", "gutterMatchesBackground",
                          "sessionMenuFits"]
            for key in checks where values[key] as? Bool != true {
                print("FAIL: \(key): \(values)")
                exit(1)
            }
            guard values["created"] as? Int == 2,
                  values["closed"] as? Int == 0,
                  values["webglPanes"] as? Int == 2 else {
                print("FAIL: PTY/renderer lifecycle: \(values)")
                exit(1)
            }
            print("PASS: native WebKit icons, text metrics, late fonts, scaling and peer panes")
            exit(0)
        })
    }
}

let app = NSApplication.shared
let runner = TerminalRenderingRunner()
app.run()
