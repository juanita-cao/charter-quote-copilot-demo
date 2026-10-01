import { fireEvent, screen } from "@testing-library/react";
import { loggedIn, renderApp, useMockBackend } from "../test/harness";
import { en } from "../i18n/en";

// PT-18 cargo recognition, first slice (design_frontend.md §13): the "Recognise fields" button in the enquiry box
// is the only trigger — no auto-fire on paste/change. A match fills cargo_description only when it is empty.
// [AMENDMENT 2026-09-22] When the field already holds something different, the match is *offered* (a "Replace"
// action), never applied automatically and never silently refused — replacing an earlier in-memory "unconfirmed
// guess" guard that broke across a page reload (see vm/cargo.ts's docstring).

useMockBackend();

const notes = () => screen.getByLabelText(en.fields.cargo_notes) as HTMLTextAreaElement;
const cargoDescription = () => screen.getByLabelText(en.fields.cargo_description) as HTMLInputElement;
const recogniseButton = () => screen.getByText(en.enquiry.recognise);
const offerText = (cargo: string, current: string) => en.cargo.cargoOffer.replace("{{cargo}}", cargo).replace("{{current}}", current);

describe("Cargo recognition", () => {
  beforeEach(() => loggedIn());

  test("clicking Recognise fields with no enquiry text pasted shows a warning, fills nothing", async () => {
    await renderApp("/workspace?blank");
    fireEvent.click(recogniseButton());
    expect(await screen.findByText(en.cargo.cargoNoEnquiryText)).toBeInTheDocument();
    expect(cargoDescription().value).toBe("");
  });

  test("a recognised cargo term fills the empty cargo_description field and is marked recognised", async () => {
    await renderApp("/workspace?blank");
    fireEvent.change(notes(), { target: { value: "大连到群山4400吨饲料，6月7号前ETA" } });
    fireEvent.click(recogniseButton());
    expect(cargoDescription().value).toBe("饲料");
    expect(await screen.findByText(en.cargo.cargoRecognised.replace("{{cargo}}", "饲料"))).toBeInTheDocument();
  });

  test("no dictionary match on an empty field shows a warning and leaves it untouched", async () => {
    await renderApp("/workspace?blank");
    fireEvent.change(notes(), { target: { value: "这段话里完全没有提到任何货物名称" } });
    fireEvent.click(recogniseButton());
    expect(await screen.findByText(en.cargo.cargoNoMatch)).toBeInTheDocument();
    expect(cargoDescription().value).toBe("");
  });

  test("editing cargo_description after a match clears the recognised caption", async () => {
    await renderApp("/workspace?blank");
    fireEvent.change(notes(), { target: { value: "散装硫酸铵" } });
    fireEvent.click(recogniseButton());
    expect(await screen.findByText(en.cargo.cargoRecognised.replace("{{cargo}}", "硫酸铵"))).toBeInTheDocument();
    fireEvent.change(cargoDescription(), { target: { value: "硫酸铵 - confirmed" } });
    expect(screen.queryByText(en.cargo.cargoRecognised.replace("{{cargo}}", "硫酸铵"))).not.toBeInTheDocument();
  });

  test("a correctly-recognised value needs no edit to dismiss — blurring the field clears the caption (found 2026-09-22: a correct match left no way to clear it)", async () => {
    await renderApp("/workspace?blank");
    fireEvent.change(notes(), { target: { value: "5000吨吨袋氯化钙" } });
    fireEvent.click(recogniseButton());
    expect(await screen.findByText(en.cargo.cargoRecognised.replace("{{cargo}}", "氯化钙"))).toBeInTheDocument();
    expect(cargoDescription().value).toBe("氯化钙");
    fireEvent.blur(cargoDescription());
    expect(screen.queryByText(en.cargo.cargoRecognised.replace("{{cargo}}", "氯化钙"))).not.toBeInTheDocument();
    expect(cargoDescription().value).toBe("氯化钙"); // blur clears only the caption, never the value itself
  });

  test("a field that already holds a different value is offered a replacement, never overwritten automatically", async () => {
    await renderApp("/workspace?blank");
    fireEvent.change(cargoDescription(), { target: { value: "氯化钙" } });
    fireEvent.change(notes(), { target: { value: "大连到和歌山 8月底2000吨硅铁" } });
    fireEvent.click(recogniseButton());
    expect(cargoDescription().value).toBe("氯化钙"); // unchanged — the click alone must never write
    expect(await screen.findByText(offerText("硅铁", "氯化钙"))).toBeInTheDocument();
  });

  test("clicking Replace on an offer applies it", async () => {
    await renderApp("/workspace?blank");
    fireEvent.change(cargoDescription(), { target: { value: "氯化钙" } });
    fireEvent.change(notes(), { target: { value: "大连到和歌山 8月底2000吨硅铁" } });
    fireEvent.click(recogniseButton());
    fireEvent.click(await screen.findByText(en.cargo.replace));
    expect(cargoDescription().value).toBe("硅铁");
    expect(screen.queryByText(offerText("硅铁", "氯化钙"))).not.toBeInTheDocument();
  });

  test("a value already confirmed via blur still gets an offer, not a silent block, for a genuinely different later match", async () => {
    // this is the exact bug found 2026-09-22: the earlier design treated "confirmed by blur" as permanently
    // protected, which also meant a value merely *restored from a reloaded draft* looked the same and blocked a
    // fresh, wanted match. The stateless rule fixes both at once — it never distinguishes the two.
    await renderApp("/workspace?blank");
    fireEvent.change(notes(), { target: { value: "5000吨吨袋氯化钙" } });
    fireEvent.click(recogniseButton());
    fireEvent.blur(cargoDescription());
    fireEvent.change(notes(), { target: { value: "大连到和歌山 8月底2000吨硅铁" } });
    fireEvent.click(recogniseButton());
    expect(cargoDescription().value).toBe("氯化钙"); // not silently overwritten
    expect(await screen.findByText(offerText("硅铁", "氯化钙"))).toBeInTheDocument(); // but offered, not blocked
  });

  test("a new enquiry with no match, on a field that already has a value, keeps it and says so rather than staying silent (found 2026-09-23)", async () => {
    await renderApp("/workspace?blank");
    fireEvent.change(cargoDescription(), { target: { value: "氯化钙" } });
    fireEvent.change(notes(), { target: { value: "这段话里完全没有提到任何货物名称" } });
    fireEvent.click(recogniseButton());
    expect(cargoDescription().value).toBe("氯化钙");
    expect(screen.queryByText(en.cargo.cargoNoMatch)).not.toBeInTheDocument();
    expect(await screen.findByText(en.cargo.cargoKept.replace("{{cargo}}", "氯化钙"))).toBeInTheDocument();
  });
});
