import { fireEvent, screen } from "@testing-library/react";
import { loggedIn, renderApp, useMockBackend } from "../test/harness";
import { en } from "../i18n/en";

// PT-18 laycan recognition, sixth slice: same button, same shared engine (vm/fieldRecognition.ts) as
// cargo/terms/ports/quantity. `laycan_start`/`laycan_end` are treated as one pair (design_frontend.md §18) — the
// caption/offer is shown once, under "Laycan to".

useMockBackend();

const notes = () => screen.getByLabelText(en.fields.cargo_notes) as HTMLTextAreaElement;
const laycanStartField = () => screen.getByLabelText(en.fields.laycan_start) as HTMLInputElement;
const laycanEndField = () => screen.getByLabelText(en.fields.laycan_end) as HTMLInputElement;
const recogniseButton = () => screen.getByText(en.enquiry.recognise);
const offerText = (start: string, end: string, currentStart: string, currentEnd: string) =>
  en.laycan.laycanOffer
    .replace("{{start}}", start)
    .replace("{{end}}", end)
    .replace("{{currentStart}}", currentStart)
    .replace("{{currentEnd}}", currentEnd);

describe("Laycan recognition", () => {
  beforeEach(() => loggedIn());

  test("a recognised range fills both empty fields and is marked recognised", async () => {
    await renderApp("/workspace?blank");
    fireEvent.change(notes(), { target: { value: "LAYCAN: 5-10TH, APR, 2025" } });
    fireEvent.click(recogniseButton());
    expect(laycanStartField().value).toBe("2025-04-05");
    expect(laycanEndField().value).toBe("2025-04-10");
    expect(
      await screen.findByText(en.laycan.laycanRecognised.replace("{{start}}", "2025-04-05").replace("{{end}}", "2025-04-10")),
    ).toBeInTheDocument();
  });

  test("fields that already hold a different range are offered a replacement, applied only on click", async () => {
    await renderApp("/workspace?blank");
    fireEvent.change(laycanStartField(), { target: { value: "2026-01-01" } });
    fireEvent.change(laycanEndField(), { target: { value: "2026-01-05" } });
    fireEvent.change(notes(), { target: { value: "LAYCAN: 5-10TH, APR, 2025" } });
    fireEvent.click(recogniseButton());
    expect(laycanStartField().value).toBe("2026-01-01");
    expect(await screen.findByText(offerText("2025-04-05", "2025-04-10", "2026-01-01", "2026-01-05"))).toBeInTheDocument();
    fireEvent.click(screen.getByText(en.laycan.replace));
    expect(laycanStartField().value).toBe("2025-04-05");
    expect(laycanEndField().value).toBe("2025-04-10");
  });

  test("fields that already have a range, with no laycan in the new enquiry, are kept and said so", async () => {
    await renderApp("/workspace?blank");
    fireEvent.change(laycanStartField(), { target: { value: "2026-01-01" } });
    fireEvent.change(laycanEndField(), { target: { value: "2026-01-05" } });
    fireEvent.change(notes(), { target: { value: "装港：珠海\n卸港：厦门" } });
    fireEvent.click(recogniseButton());
    expect(laycanStartField().value).toBe("2026-01-01");
    expect(
      await screen.findByText(en.laycan.laycanKept.replace("{{start}}", "2026-01-01").replace("{{end}}", "2026-01-05")),
    ).toBeInTheDocument();
  });
});
