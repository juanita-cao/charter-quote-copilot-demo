import { SearchOutlined } from "@ant-design/icons";
import { Button, Input, Table } from "antd";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { HELP_ARTICLES, type HelpArticle, type Lang } from "./articles";

// Help Center (was Guide, PT-16): static, bilingual, no backend. Search matches the words of a question or its answer.
export function HelpPage() {
  const { t, i18n } = useTranslation();
  const lang: Lang = i18n.language === "zh" ? "zh" : "en";
  const [typed, setTyped] = useState("");
  const [submitted, setSubmitted] = useState("");

  const articles = useMemo(() => {
    const q = submitted.trim().toLowerCase();
    if (q === "") return HELP_ARTICLES;
    return HELP_ARTICLES.filter((a) => `${a.question[lang]} ${a.answer[lang].join(" ")}`.toLowerCase().includes(q));
  }, [submitted, lang]);

  const runSearch = () => setSubmitted(typed);
  const showAll = () => {
    setTyped("");
    setSubmitted("");
  };

  return (
    <div className="help-page">
      <h2>{t("help.title")}</h2>

      <section className="help-card">
        <h3>{t("help.searchTitle")}</h3>
        <div className="help-search">
          <Input
            aria-label={t("help.searchTitle")}
            placeholder={t("help.placeholder")}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onPressEnter={runSearch}
          />
          <Button type="primary" icon={<SearchOutlined aria-hidden />} onClick={runSearch}>
            {t("help.search")}
          </Button>
        </div>
      </section>

      <section className="help-card">
        <Table<HelpArticle>
          size="middle"
          rowKey="id"
          dataSource={articles}
          locale={{
            emptyText: (
              <div className="help-empty">
                <span>{t("help.noMatch")}</span>
                <Button size="small" onClick={showAll}>
                  {t("help.showAll")}
                </Button>
              </div>
            ),
          }}
          pagination={{ pageSize: 20, showSizeChanger: false, showTotal: () => t("help.total", { n: articles.length }) }}
          expandable={{
            expandRowByClick: true,
            showExpandColumn: false,
            expandedRowRender: (a) => (
              <div className="help-answer">
                {a.answer[lang].map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            ),
          }}
          columns={[{ title: t("help.faqList"), key: "question", render: (_: unknown, a) => a.question[lang] }]}
        />
      </section>
    </div>
  );
}
