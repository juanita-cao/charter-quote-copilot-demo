import { Alert } from "antd";
import { Component, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

function Fallback() {
  const { t } = useTranslation();
  return <Alert type="error" showIcon message={t("workspace.sectionError")} />;
}

// A response that violates the contract makes an F-VM-* throw; only the affected panel fails (Artifact 8).
export class SectionBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("Section failed to render", error);
  }
  render() {
    return this.state.failed ? <Fallback /> : this.props.children;
  }
}
