import { fireEvent, screen } from "@testing-library/react";
import { loggedIn, renderApp, useMockBackend } from "../test/harness";
import { en } from "../i18n/en";

// PT-18 quantity recognition, fourth slice: same button, same shared engine (vm/fieldRecognition.ts) as
// cargo/terms/ports. The one thing unique to this field: a range in the text is reported but never resolved to a
// single number automatically (client decision 2026-09-23, config/quantityMatch.ts's docstring).

useMockBackend();

const notes = () => screen.getByLabelText(en.fields.cargo_notes) as HTMLTextAreaElement;
const quantityField = () => screen.getByLabelText(en.fields.quantity) as HTMLInputElement;
const recogniseButton = () => screen.getByText(en.enquiry.recognise);
const offerText = (quantity: string, current: string) => en.quantity.quantityOffer.replace("{{quantity}}", quantity).replace("{{current}}", current);

describe("Quantity recognition", () => {
  beforeEach(() => loggedIn());

  test("a recognised quantity fills the empty field and is marked recognised", async () => {
    await renderApp("/workspace?blank");
    fireEvent.change(notes(), { target: { value: "大连到蔚山4400吨饲料" } });
    fireEvent.click(recogniseButton());
    expect(quantityField().value).toBe("4400");
    expect(await screen.findByText(en.quantity.quantityRecognised.replace("{{quantity}}", "4400"))).toBeInTheDocument();
  });

  test("no quantity present on an empty field shows a warning and leaves it untouched", async () => {
    await renderApp("/workspace?blank");
    fireEvent.change(notes(), { target: { value: "装港：珠海\n卸港：厦门" } });
    fireEvent.click(recogniseButton());
    expect(await screen.findByText(en.quantity.quantityNoMatch)).toBeInTheDocument();
    expect(quantityField().value).toBe("");
  });

  test("a field that already holds a different value is offered a replacement, never overwritten automatically", async () => {
    await renderApp("/workspace?blank");
    fireEvent.change(quantityField(), { target: { value: "3000" } });
    fireEvent.change(notes(), { target: { value: "大连到蔚山4400吨饲料" } });
    fireEvent.click(recogniseButton());
    expect(quantityField().value).toBe("3000");
    expect(await screen.findByText(offerText("4400", "3000"))).toBeInTheDocument();
  });

  test("clicking Replace on an offer applies it", async () => {
    await renderApp("/workspace?blank");
    fireEvent.change(quantityField(), { target: { value: "3000" } });
    fireEvent.change(notes(), { target: { value: "大连到蔚山4400吨饲料" } });
    fireEvent.click(recogniseButton());
    fireEvent.click(await screen.findByText(en.quantity.replace));
    expect(quantityField().value).toBe("4400");
    expect(screen.queryByText(offerText("4400", "3000"))).not.toBeInTheDocument();
  });

  test("blurring the field dismisses a recognised caption without an edit", async () => {
    await renderApp("/workspace?blank");
    fireEvent.change(notes(), { target: { value: "大连到蔚山4400吨饲料" } });
    fireEvent.click(recogniseButton());
    expect(await screen.findByText(en.quantity.quantityRecognised.replace("{{quantity}}", "4400"))).toBeInTheDocument();
    fireEvent.blur(quantityField());
    expect(screen.queryByText(en.quantity.quantityRecognised.replace("{{quantity}}", "4400"))).not.toBeInTheDocument();
    expect(quantityField().value).toBe("4400");
  });

  test("a range is reported and never applied, even on an empty field", async () => {
    await renderApp("/workspace?blank");
    fireEvent.change(notes(), { target: { value: "贡布-厦门，7000-8000吨大理石" } });
    fireEvent.click(recogniseButton());
    expect(quantityField().value).toBe("");
    expect(await screen.findByText(en.quantity.quantityRangeFound.replace("{{min}}", "7000").replace("{{max}}", "8000"))).toBeInTheDocument();
  });

  test("a field that already has a value, with no quantity in the new enquiry, is kept and said so", async () => {
    await renderApp("/workspace?blank");
    fireEvent.change(quantityField(), { target: { value: "4400" } });
    fireEvent.change(notes(), { target: { value: "装港：珠海\n卸港：厦门" } });
    fireEvent.click(recogniseButton());
    expect(quantityField().value).toBe("4400");
    expect(await screen.findByText(en.quantity.quantityKept.replace("{{quantity}}", "4400"))).toBeInTheDocument();
  });
});
