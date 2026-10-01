import { Alert, Button, Form, Input } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api/http";
import { useApi, useAuth } from "../app/contexts";
import logoGradient from "../assets/logo-mark-gradient.png";
import { useLogin, useRegister } from "../hooks/mutations";

interface Values {
  company_name: string;
  admin_email: string;
  password: string;
  password_confirm: string;
}

export function RegisterPage() {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const { dispatch } = useAuth();
  const register = useRegister(api);
  const login = useLogin(api);
  const [error, setError] = useState<string | null>(null);
  const busy = register.isPending || login.isPending;

  const onFinish = async (v: Values) => {
    setError(null);
    try {
      await register.mutateAsync(v);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("login.errors.generic"));
      return;
    }
    dispatch({ type: "registerSucceeded" });
    try {
      await login.mutateAsync({ email: v.admin_email, password: v.password });
      dispatch({ type: "loginSucceeded" });
    } catch {
      dispatch({ type: "loginFailed" });
      navigate("/login");
    }
  };

  return (
    <div className="auth-form">
      <img src={logoGradient} alt="" height={48} />
      <p className="auth-subtitle">{t("register.title")}</p>
      <Form layout="vertical" onFinish={onFinish} disabled={busy} requiredMark>
        <Form.Item name="company_name" label={t("register.company")} rules={[{ required: true, message: t("register.required") }]}>
          <Input />
        </Form.Item>
        <Form.Item name="admin_email" label={t("register.email")} rules={[{ required: true, message: t("register.required") }, { type: "email", message: t("register.invalidEmail") }]}>
          <Input autoComplete="username" />
        </Form.Item>
        <Form.Item name="password" label={t("register.password")} rules={[{ required: true, message: t("register.required") }, { min: 8, message: t("register.minLength") }]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          name="password_confirm"
          label={t("register.confirm")}
          dependencies={["password"]}
          rules={[
            { required: true, message: t("register.required") },
            ({ getFieldValue }) => ({
              validator: (_, value) => (!value || getFieldValue("password") === value ? Promise.resolve() : Promise.reject(new Error(t("register.mismatch")))),
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
        <Button type="primary" htmlType="submit" block loading={busy}>
          {t("register.submit")}
        </Button>
      </Form>
      <p className="auth-switch">
        {t("register.haveAccount")} <Link to="/login">{t("register.login")} →</Link>
      </p>
    </div>
  );
}
