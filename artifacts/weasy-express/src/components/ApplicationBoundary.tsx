import { Component, type ReactNode } from "react";
import i18n from "@/lib/i18n";

export class ApplicationBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main role="alert" style={{ margin: "10vh auto", maxWidth: 500, padding: 24, textAlign: "center", fontFamily: "sans-serif" }}>
      <h1>{i18n.t("portalUpdates.loadError")}</h1>
      <button type="button" onClick={() => window.location.reload()} style={{ background: "#E10600", color: "#fff", padding: "12px 24px", borderRadius: 12, border: 0, cursor: "pointer" }}>{i18n.t("portalUpdates.retry")}</button>
    </main>;
  }
}
