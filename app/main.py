"""App entry point: a native window (WebKit via pywebview) on top of the local server.
Run with --browser to use a normal web browser instead."""

import os
import sys
import webbrowser
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import server  # noqa: E402

APP_NAME = "Bangla Transcriber"
ICON = Path(__file__).resolve().parent / "ui" / "icon.png"


def mac_branding():
    """Show our name and icon in the menu bar / Dock instead of 'Python'."""
    try:
        from AppKit import NSApplication, NSImage
        from Foundation import NSBundle

        info = NSBundle.mainBundle().localizedInfoDictionary() or NSBundle.mainBundle().infoDictionary()
        info["CFBundleName"] = APP_NAME
        if ICON.exists():
            NSApplication.sharedApplication().setApplicationIconImage_(
                NSImage.alloc().initWithContentsOfFile_(str(ICON)))
    except Exception:
        pass


def accept_first_click():
    """macOS normally swallows the first click on a window that is not in front (it only
    brings the window forward). Make the web view act on that click too."""
    try:
        import objc
        from webview.platforms.cocoa import BrowserView

        def acceptsFirstMouse_(self, event):
            return True

        objc.classAddMethods(BrowserView.WebKitHost, [
            objc.selector(acceptsFirstMouse_, selector=b"acceptsFirstMouse:", signature=b"Z@:@")])
    except Exception as e:
        print("could not enable first-click:", e)


def main():
    httpd, port = server.serve()
    url = f"http://127.0.0.1:{port}/"
    try:
        if "--browser" in sys.argv:
            raise ImportError
        import webview
    except ImportError:
        print(f"{APP_NAME} running at {url}  (Ctrl+C to quit)")
        webbrowser.open(url)
        try:
            import threading

            threading.Event().wait()
        except KeyboardInterrupt:
            pass
        return

    if sys.platform == "darwin":
        mac_branding()
        accept_first_click()
    window = webview.create_window(APP_NAME, url, width=1180, height=780, min_size=(900, 600),
                                   background_color="#16161a")

    FD = getattr(webview, "FileDialog", None)
    OPEN = FD.OPEN if FD else webview.OPEN_DIALOG
    FOLDER = FD.FOLDER if FD else webview.FOLDER_DIALOG

    def picker(kind):
        if kind == "folder":
            res = window.create_file_dialog(FOLDER)
        else:
            exts = ";".join(f"*{e}" for e in sorted(server.AUDIO_EXT))
            res = window.create_file_dialog(OPEN, allow_multiple=True,
                                            file_types=(f"Audio video or transcript JSON ({exts};*.json)", "All files (*.*)"))
        return list(res or [])

    server.STATE.picker = picker

    def on_loaded():
        # Drag & drop from Finder: pywebview exposes the full path of dropped files.
        try:
            from webview.dom import DOMEventHandler

            def on_drop(e):
                files = (e.get("dataTransfer") or {}).get("files") or []
                server.STATE.add([f["pywebviewFullPath"] for f in files if f.get("pywebviewFullPath")])

            window.dom.document.events.drop += DOMEventHandler(on_drop, True, True)
        except Exception as ex:
            print("drag & drop unavailable:", ex)

    window.events.loaded += on_loaded
    webview.start()
    httpd.shutdown()


if __name__ == "__main__":
    main()
