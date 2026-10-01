import { Alert, Button, Form, Input } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ApiError } from "../api/http";
import { useApi, useAuth } from "../app/contexts";
import logoGradient from "../assets/logo-mark-gradient.png";
import { useLogin } from "../hooks/mutations";

export function LoginPage() {
  const { t } = useTranslation();
  const api = useApi();
  const { state, dispatch } = useAuth();
  const login = useLogin(api);
  const [error, setError] = useState<string | null>(null);

  const onFinish = async (v: { email: string; password: string }) => {
    setError(null);
    try {
      await login.mutateAsync(v);
      dispatch({ type: "loginSucceeded" });
    } catch (e) {
      dispatch({ type: "loginFailed" });
      const status = e instanceof ApiError ? e.status : undefined;
      setError(status === 401 ? t("login.errors.invalid") : status === 429 ? t("login.errors.locked") : t("login.errors.generic"));
    }
  };

  return (
    <div className="auth-form">
      <img src={logoGradient} alt="" height={48} />
      <h1>{t("app.name")}</h1>
      <p className="auth-subtitle">{t("login.title")}</p>
      {state.sessionExpired && <Alert type="info" showIcon message={t("login.sessionExpired")} style={{ marginBottom: 16 }} />}
      <Form layout="vertical" onFinish={onFinish} disabled={login.isPending} requiredMark={false}>
        <Form.Item name="email" label={t("login.email")} rules={[{ required: true, message: t("register.required") }, { type: "email", message: t("register.invalidEmail") }]}>
          <Input autoComplete="username" />
        </Form.Item>
        <Form.Item
          name="password"
          label={t("login.password")}
          rules={[{ required: true, message: t("register.required") }]}
          validateStatus={error ? "error" : undefined}
          help={error ?? undefined}
        >
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={login.isPending}>
          {t("login.submit")}
        </Button>
      </Form>
      <p className="auth-switch">
        {t("login.noAccount")} <Link to="/register">{t("login.register")} →</Link>
      </p>
    </div>
  );
}
