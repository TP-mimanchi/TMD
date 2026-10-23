// A release smoke check: require the real frontend-ready signal and window metadata.
// Never inspect window titles or pixels.
// Usage: verify-macos-window /path/to/TMD.app /path/to/diagnostics
import AppKit
import CoreGraphics
import Darwin
import Foundation

enum SmokeFailure: Error, CustomStringConvertible {
    case message(String)
    var description: String {
        switch self { case .message(let message): return message }
    }
}

func log(_ message: String) {
    print("[\(ISO8601DateFormatter().string(from: Date()))] \(message)")
    fflush(stdout)
}

func windowBounds(_ window: [String: Any]) -> CGRect? {
    guard let bounds = window[kCGWindowBounds as String] as? [String: Any] else { return nil }
    return CGRect(dictionaryRepresentation: bounds as CFDictionary)
}

func ownedWindows(pid: pid_t, onScreenOnly: Bool) throws -> [[String: Any]] {
    let options: CGWindowListOption = onScreenOnly
        ? [.optionOnScreenOnly, .excludeDesktopElements] : [.optionAll, .excludeDesktopElements]
    guard let windows = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
        throw SmokeFailure.message("WindowServer did not return window metadata; a graphical login session is required.")
    }
    return windows.filter { ($0[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == pid }
}

func describe(_ window: [String: Any]) -> String {
    // Deliberately omit kCGWindowName: titles are privacy restricted on macOS.
    let fields = [kCGWindowNumber, kCGWindowOwnerPID, kCGWindowLayer,
                  kCGWindowIsOnscreen, kCGWindowAlpha, kCGWindowBounds]
    return fields.map { "\($0)=\(String(describing: window[$0 as String]))" }.joined(separator: " ")
}

func verify(appURL: URL, diagnosticsURL: URL) throws {
    guard let bundle = Bundle(url: appURL), let executable = bundle.executableURL,
          FileManager.default.isExecutableFile(atPath: executable.path) else {
        throw SmokeFailure.message("No executable found in app bundle: \(appURL.path)")
    }
    let screens = NSScreen.screens
    let displayBounds = screens.compactMap { screen -> CGRect? in
        guard let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber else { return nil }
        return CGDisplayBounds(number.uint32Value)
    }
    log("App: \(appURL.path); executable: \(executable.path)")
    log("Displays: \(displayBounds); session: \(String(describing: CGSessionCopyCurrentDictionary()))")
    guard !displayBounds.isEmpty else {
        throw SmokeFailure.message("No active display. This smoke check requires a macOS runner with WindowServer and a graphical login session.")
    }

    try FileManager.default.createDirectory(at: diagnosticsURL, withIntermediateDirectories: true)
    let stdoutURL = diagnosticsURL.appendingPathComponent("app-stdout.log")
    let stderrURL = diagnosticsURL.appendingPathComponent("app-stderr.log")
    FileManager.default.createFile(atPath: stdoutURL.path, contents: nil)
    FileManager.default.createFile(atPath: stderrURL.path, contents: nil)
    let stdoutHandle = try FileHandle(forWritingTo: stdoutURL)
    let stderrHandle = try FileHandle(forWritingTo: stderrURL)
    defer { try? stdoutHandle.close(); try? stderrHandle.close() }

    let process = Process()
    process.executableURL = executable
    process.currentDirectoryURL = appURL.deletingLastPathComponent()
    process.standardOutput = stdoutHandle
    process.standardError = stderrHandle
    try process.run()
    log("Launched app PID \(process.processIdentifier)")
    defer {
        // Never use killall/pkill: only clean up the child launched by this check.
        if process.isRunning {
            process.terminate()
            let stopDeadline = Date().addingTimeInterval(5)
            while process.isRunning && Date() < stopDeadline { Thread.sleep(forTimeInterval: 0.1) }
            if process.isRunning {
                log("App did not stop after SIGTERM; sending SIGKILL to owned PID \(process.processIdentifier)")
                kill(process.processIdentifier, SIGKILL)
            }
            process.waitUntilExit()
        }
        log("App exited with status \(process.terminationStatus)")
    }

    let deadline = Date().addingTimeInterval(30)
    var visibleSince: [UInt32: Date] = [:]
    var frontendReady = false
    var hasStableWindow = false
    while Date() < deadline {
        guard process.isRunning else {
            throw SmokeFailure.message("App exited before completing the window and frontend-ready checks (status \(process.terminationStatus)); inspect app stdout/stderr.")
        }
        if !frontendReady {
            // Startup logs should be small. Bound reads so a noisy failing launch
            // cannot cause the verifier to repeatedly load an unbounded log.
            let attributes = try FileManager.default.attributesOfItem(atPath: stderrURL.path)
            guard let size = attributes[.size] as? NSNumber, size.uint64Value <= 1_048_576 else {
                throw SmokeFailure.message("App stderr exceeded the 1 MiB startup-log limit before frontend-ready; inspect app-stderr.log.")
            }
            let stderr = try Data(contentsOf: stderrURL, options: .mappedIfSafe)
            frontendReady = String(decoding: stderr, as: UTF8.self)
                .split(whereSeparator: { $0.isNewline })
                .contains("[TMD] frontend-ready main")
            if frontendReady { log("Observed production frontend-ready signal for main window") }
        }
        let now = Date()
        hasStableWindow = false
        let windows = try ownedWindows(pid: process.processIdentifier, onScreenOnly: true)
        var currentWindows: [UInt32: Date] = [:]
        for window in windows {
            guard (window[kCGWindowLayer as String] as? NSNumber)?.intValue == 0,
                  (window[kCGWindowIsOnscreen as String] as? NSNumber)?.boolValue == true,
                  let alpha = window[kCGWindowAlpha as String] as? NSNumber, alpha.doubleValue > 0.01,
                  let bounds = windowBounds(window), bounds.width >= 200, bounds.height >= 120,
                  displayBounds.contains(where: {
                      let intersection = $0.intersection(bounds)
                      return intersection.width >= 100 && intersection.height >= 80
                  }),
                  let windowID = (window[kCGWindowNumber as String] as? NSNumber)?.uint32Value else { continue }
            let since = visibleSince[windowID] ?? now
            currentWindows[windowID] = since
            // Reject brief splash windows and windows followed immediately by a crash.
            if now.timeIntervalSince(since) >= 2 {
                hasStableWindow = true
                if frontendReady {
                    log("PASS: frontend is ready and app owns a normal on-screen window visible for at least 2 seconds: \(describe(window))")
                    return
                }
            }
        }
        visibleSince = currentWindows
        Thread.sleep(forTimeInterval: 0.25)
    }

    let windows = try ownedWindows(pid: process.processIdentifier, onScreenOnly: false)
    log("Owned windows at timeout (\(windows.count)):")
    for window in windows { log(describe(window)) }
    if let application = NSRunningApplication(processIdentifier: process.processIdentifier) {
        log("App state: hidden=\(application.isHidden), active=\(application.isActive), activationPolicy=\(application.activationPolicy.rawValue)")
    }
    log("Readiness at timeout: stable on-screen window=\(hasStableWindow), frontend-ready main=\(frontendReady)")
    var missing: [String] = []
    if !hasStableWindow { missing.append("a qualifying normal on-screen window stable for 2 seconds") }
    if !frontendReady { missing.append("the production [TMD] frontend-ready main signal (the page may be stuck on its boot splash)") }
    throw SmokeFailure.message("App stayed running but did not complete startup within 30 seconds; missing: \(missing.joined(separator: "; ")). Inspect app stdout/stderr and the runner graphical session.")
}

do {
    guard CommandLine.arguments.count == 3 else {
        throw SmokeFailure.message("Usage: verify-macos-window <app.app> <diagnostics-directory>")
    }
    try verify(appURL: URL(fileURLWithPath: CommandLine.arguments[1]),
               diagnosticsURL: URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true))
} catch {
    log("FAIL: \(error)")
    exit(1)
}
