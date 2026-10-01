import { fireEvent, screen, waitFor } from "@testing-library/react";
import { loggedIn, renderApp, useMockBackend } from "../test/harness";
import { HELP_ARTICLES } from "./articles";

useMockBackend();
const T = { timeout: 8000 };

async function openHelp(language: "en" | "zh" = "en") {
  loggedIn();
  await renderApp("/guide", language);
  await screen.findByText(language === "zh" ? "常见问题" : "FAQ list", undefined, T);
}
const search = (text: string) => {
  fireEvent.change(screen.getByLabelText(/^(Search for articles|搜索文章)$/), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: /^(Search|搜\s?索)$/ }));
};
const rows = () => Array.from(document.querySelectorAll("tbody tr.ant-table-row")) as HTMLElement[];

describe("Help Center (was Guide, PT-16)", () => {
  test("the page is titled Help Center and lists every article under 'FAQ list' with the total", async () => {
    await openHelp();
    expect(screen.getByRole("heading", { name: "Help Center" })).toBeInTheDocument();
    expect(screen.getByText("Search for articles")).toBeInTheDocument();
    expect(rows()).toHaveLength(HELP_ARTICLES.length);
    expect(screen.getByText(`Total: ${HELP_ARTICLES.length}`)).toBeInTheDocument();
    expect(screen.getByText("What is TCE?")).toBeInTheDocument();
  });

  test("the sidebar entry is called Help Center, and the header help icon opens the page", async () => {
    loggedIn();
    await renderApp("/workspace");
    expect(screen.getByRole("link", { name: /Help Center/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Help" }));
    await screen.findByText("FAQ list", undefined, T);
    expect(screen.getByTestId("where")).toHaveTextContent("/guide");
  });

  test("clicking a question opens its answer, and clicking again closes it", async () => {
    await openHelp();
    const answerStart = /Time charter equivalent/;
    expect(screen.queryByText(answerStart)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("What is TCE?"));
    expect(await screen.findByText(answerStart)).toBeInTheDocument();
    fireEvent.click(screen.getByText("What is TCE?"));
    await waitFor(() => {
      const el = screen.queryByText(answerStart);
      if (el) expect(el).not.toBeVisible();
    }, T);
  });

  test("Search filters the list by the words in a question or in its answer", async () => {
    await openHelp();
    search("precision");
    await waitFor(() => expect(rows().length).toBeLessThan(HELP_ARTICLES.length), T);
    expect(screen.getByText("What is the difference between display precision and full precision?")).toBeInTheDocument();
    search("break-even"); // only in an answer
    await waitFor(() => expect(rows()).toHaveLength(1), T);
    expect(screen.getByText("What does Reverse Quote do?")).toBeInTheDocument();
  });

  test("Enter in the search box searches, and the match ignores case", async () => {
    await openHelp();
    fireEvent.change(screen.getByLabelText("Search for articles"), { target: { value: "DRAFT" } });
    fireEvent.keyDown(screen.getByLabelText("Search for articles"), { key: "Enter", code: "Enter", keyCode: 13, charCode: 13 });
    await waitFor(() => expect(rows().length).toBeLessThan(HELP_ARTICLES.length), T);
    expect(screen.getByText("What is the difference between Save Quote and Save Draft?")).toBeInTheDocument();
  });

  test("no match shows a message and a way back to the full list", async () => {
    await openHelp();
    search("zzzzqqq");
    expect(await screen.findByText("No articles match your search", undefined, T)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show all articles" }));
    await waitFor(() => expect(rows()).toHaveLength(HELP_ARTICLES.length), T);
  });

  test("a blank search shows everything again", async () => {
    await openHelp();
    search("draft");
    await waitFor(() => expect(rows().length).toBeLessThan(HELP_ARTICLES.length), T);
    search("");
    await waitFor(() => expect(rows()).toHaveLength(HELP_ARTICLES.length), T);
  });

  test("every article has a question and a non-empty answer in both languages", () => {
    for (const a of HELP_ARTICLES) {
      for (const lang of ["en", "zh"] as const) {
        expect(a.question[lang].trim().length).toBeGreaterThan(0);
        expect(a.answer[lang].length).toBeGreaterThan(0);
        expect(a.answer[lang].every((p) => p.trim().length > 0)).toBe(true);
      }
    }
    expect(new Set(HELP_ARTICLES.map((a) => a.id)).size).toBe(HELP_ARTICLES.length);
  });

  test("the whole page follows the language", async () => {
    await openHelp("zh");
    expect(screen.getByRole("heading", { name: "帮助中心" })).toBeInTheDocument();
    expect(screen.getByText("什么是 TCE？")).toBeInTheDocument();
    search("精度");
    await waitFor(() => expect(rows().length).toBeLessThan(HELP_ARTICLES.length), T);
    expect(screen.queryByText("What is TCE?")).not.toBeInTheDocument();
  });
});
