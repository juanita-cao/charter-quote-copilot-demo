import { fireEvent, screen } from "@testing-library/react";
import { loggedIn, renderApp, useMockBackend } from "../test/harness";
import { en } from "../i18n/en";

// PT-18 contract-terms recognition, second slice (design_frontend.md §14): same button, same stateless
// offer-not-overwrite rule as cargo recognition — see cargoRecognition.test.tsx for the fuller scenario set this
// mirrors, and vm/cargo.ts's docstring for why the rule is stateless.

useMockBackend();

const notes = () => screen.getByLabelText(en.fields.cargo_notes) as HTMLTextAreaElement;
const termsField = () => screen.getByLabelText(en.fields.contract_terms) as HTMLInputElement;
const recogniseButton = () => screen.getByText(en.enquiry.recognise);
const offerText = (terms: string, current: string) => en.terms.termsOffer.replace("{{terms}}", terms).replace("{{current}}", current);

describe("Contract-terms recognition", () => {
  beforeEach(() => loggedIn());

  test("a recognised term fills the empty field and is marked recognised", async () => {
    await renderApp("/workspace?blank");
    fireEvent.change(notes(), { target: { value: "FRT: INVITE OWS BSS 1/1 FILO" } });
    fireEvent.click(recogniseButton());
    expect(termsField().value).toBe("FILO");
    expect(await screen.findByText(en.terms.termsRecognised.replace("{{terms}}", "FILO"))).toBeInTheDocument();
  });

  test("no term present on an empty field shows a warning and leaves it untouched", async () => {
    await renderApp("/workspace?blank");
    fireEvent.change(notes(), { target: { value: "5000吨吨袋氯化钙，大连到釜山" } });
    fireEvent.click(recogniseButton());
    expect(await screen.findByText(en.terms.termsNoMatch)).toBeInTheDocument();
    expect(termsField().value).toBe("");
  });

  test("blurring the field dismisses the caption without an edit", async () => {
    await renderApp("/workspace?blank");
    fireEvent.change(notes(), { target: { value: "terms are FIO" } });
    fireEvent.click(recogniseButton());
    expect(await screen.findByText(en.terms.termsRecognised.replace("{{terms}}", "FIO"))).toBeInTheDocument();
    fireEvent.blur(termsField());
    expect(screen.queryByText(en.terms.termsRecognised.replace("{{terms}}", "FIO"))).not.toBeInTheDocument();
    expect(termsField().value).toBe("FIO");
  });

  test("a field that already holds a different value is offered a replacement, never overwritten automatically", async () => {
    await renderApp("/workspace?blank");
    fireEvent.change(termsField(), { target: { value: "FIO" } });
    fireEvent.change(notes(), { target: { value: "terms are FLT" } });
    fireEvent.click(recogniseButton());
    expect(termsField().value).toBe("FIO");
    expect(await screen.findByText(offerText("FLT", "FIO"))).toBeInTheDocument();
  });

  test("clicking Replace on an offer applies it", async () => {
    await renderApp("/workspace?blank");
    fireEvent.change(termsField(), { target: { value: "FIO" } });
    fireEvent.change(notes(), { target: { value: "terms are FLT" } });
    fireEvent.click(recogniseButton());
    fireEvent.click(await screen.findByText(en.terms.replace));
    expect(termsField().value).toBe("FLT");
    expect(screen.queryByText(offerText("FLT", "FIO"))).not.toBeInTheDocument();
  });

  test("one click recognises cargo and terms together, each independently", async () => {
    await renderApp("/workspace?blank");
    fireEvent.change(notes(), { target: { value: "5000吨吨袋氯化钙，FILO terms" } });
    fireEvent.click(recogniseButton());
    expect(termsField().value).toBe("FILO");
    expect(screen.getByLabelText(en.fields.cargo_description)).toHaveValue("氯化钙");
  });

  test("a second, unrelated enquiry with no term at all keeps the first enquiry's value and says so, rather than leaving it silently stale (found 2026-09-23, real client screenshot)", async () => {
    await renderApp("/workspace?blank");
    fireEvent.change(notes(), { target: { value: "5000吨吨袋氯化钙，FIO terms" } });
    fireEvent.click(recogniseButton());
    expect(termsField().value).toBe("FIO");
    fireEvent.change(notes(), { target: { value: "10000吨 尿素吨袋 SF1.4 天津到林查班" } }); // no contract terms mentioned at all
    fireEvent.click(recogniseButton());
    expect(termsField().value).toBe("FIO"); // unchanged — never silently cleared either
    expect(await screen.findByText(en.terms.termsKept.replace("{{terms}}", "FIO"))).toBeInTheDocument();
  });

  test("an offer for one field does not affect the other — each field's offer/apply is independent", async () => {
    await renderApp("/workspace?blank");
    fireEvent.change(termsField(), { target: { value: "FIO" } });
    fireEvent.change(notes(), { target: { value: "5000吨吨袋氯化钙，terms are FLT" } });
    fireEvent.click(recogniseButton());
    // cargo was empty -> filled directly; terms already had FIO -> offered, not applied
    expect(screen.getByLabelText(en.fields.cargo_description)).toHaveValue("氯化钙");
    expect(termsField().value).toBe("FIO");
    expect(await screen.findByText(offerText("FLT", "FIO"))).toBeInTheDocument();
  });
});
