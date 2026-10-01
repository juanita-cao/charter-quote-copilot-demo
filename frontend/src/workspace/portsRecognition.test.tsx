import { fireEvent, screen, within } from "@testing-library/react";
import { loggedIn, renderApp, useMockBackend } from "../test/harness";
import { en } from "../i18n/en";

// PT-18 port recognition, third slice (design_backend.md §20, design_frontend.md §15): same "Recognise fields"
// button as cargo/terms. Unlike those two, an existing non-empty voyage_ports is left untouched entirely (no
// per-port offer/Replace yet — the field is a list, not a scalar).

useMockBackend();

const notes = () => screen.getByLabelText(en.fields.cargo_notes) as HTMLTextAreaElement;
const recogniseButton = () => screen.getByText(en.enquiry.recognise);

async function start() {
  loggedIn();
  await renderApp("/workspace?blank");
  fireEvent.click(screen.getByText("Voyage Schedule")); // the sequence lives in this collapsed group
}

describe("Port recognition", () => {
  test("a confident 2-port route (labelled 装港/卸港) fills voyage_ports with load/discharge tags", async () => {
    await start();
    fireEvent.change(notes(), { target: { value: "装港：珠海\n卸港：厦门\n受载期:10月初都行" } });
    fireEvent.click(recogniseButton());
    expect((screen.getByLabelText("Port 1") as HTMLInputElement).value).toBe("Zhuhai");
    expect((screen.getByLabelText("Port 2") as HTMLInputElement).value).toBe("Xiamen");
    expect(within(screen.getByLabelText("Role for port 1")).getByText("Load").closest(".ant-segmented-item")).toHaveClass("ant-segmented-item-selected");
    expect(within(screen.getByLabelText("Role for port 2")).getByText("Discharge").closest(".ant-segmented-item")).toHaveClass(
      "ant-segmented-item-selected",
    );
    expect(
      await screen.findByText(en.ports.portsRecognised.replace("{{load}}", "Zhuhai").replace("{{discharge}}", "Xiamen")),
    ).toBeInTheDocument();
  });

  test("ports found but the order isn't confident: fills untagged waypoint rows, never guesses a role", async () => {
    await start();
    fireEvent.change(notes(), { target: { value: "大连到秦皇岛到蔚山 8800吨饲料" } });
    fireEvent.click(recogniseButton());
    expect((screen.getByLabelText("Port 1") as HTMLInputElement).value).toBe("Dalian");
    expect((screen.getByLabelText("Port 2") as HTMLInputElement).value).toBe("Qinhuangdao Pt");
    expect((screen.getByLabelText("Port 3") as HTMLInputElement).value).toBe("Ulsan");
    expect(within(screen.getByLabelText("Role for port 1")).getByText("Waypoint").closest(".ant-segmented-item")).toHaveClass(
      "ant-segmented-item-selected",
    );
    expect(
      await screen.findByText(en.ports.portsFoundUnordered.replace("{{ports}}", "Dalian, Qinhuangdao Pt, Ulsan")),
    ).toBeInTheDocument();
  });

  test("no port recognised leaves the list empty and shows a warning", async () => {
    await start();
    fireEvent.change(notes(), { target: { value: "这段话里完全没有提到任何港口名称" } });
    fireEvent.click(recogniseButton());
    expect(screen.queryByLabelText("Port 1")).not.toBeInTheDocument();
    expect(await screen.findByText(en.ports.portsNoMatch)).toBeInTheDocument();
  });

  test("voyage_ports already has a row and a fresh enquiry has no port at all: kept and said so, not silent", async () => {
    await start();
    fireEvent.click(screen.getByText("Add port"));
    fireEvent.change(screen.getByLabelText("Port 1"), { target: { value: "Singapore" } }); // default role is Waypoint, untagged
    fireEvent.change(notes(), { target: { value: "这段话里完全没有提到任何港口名称" } });
    fireEvent.click(recogniseButton());
    expect((screen.getByLabelText("Port 1") as HTMLInputElement).value).toBe("Singapore");
    expect(await screen.findByText(en.ports.portsKept.replace("{{sequence}}", "Singapore (Waypoint)"))).toBeInTheDocument();
  });

  test("voyage_ports already has a row and a fresh proposal differs: offered, never applied automatically (found 2026-09-23)", async () => {
    await start();
    fireEvent.click(screen.getByText("Add port"));
    fireEvent.change(screen.getByLabelText("Port 1"), { target: { value: "Singapore" } });
    fireEvent.change(notes(), { target: { value: "装港：珠海\n卸港：厦门" } });
    fireEvent.click(recogniseButton());
    expect((screen.getByLabelText("Port 1") as HTMLInputElement).value).toBe("Singapore"); // unchanged — the click alone must never write
    expect(screen.queryByLabelText("Port 2")).not.toBeInTheDocument();
    expect(await screen.findByText(en.ports.portsOffer.replace("{{sequence}}", "Zhuhai (Load) → Xiamen (Discharge)"))).toBeInTheDocument();
  });

  test("clicking Replace on a ports offer replaces the whole list", async () => {
    await start();
    fireEvent.click(screen.getByText("Add port"));
    fireEvent.change(screen.getByLabelText("Port 1"), { target: { value: "Singapore" } });
    fireEvent.change(notes(), { target: { value: "装港：珠海\n卸港：厦门" } });
    fireEvent.click(recogniseButton());
    fireEvent.click(await screen.findByText(en.ports.replace));
    expect((screen.getByLabelText("Port 1") as HTMLInputElement).value).toBe("Zhuhai");
    expect((screen.getByLabelText("Port 2") as HTMLInputElement).value).toBe("Xiamen");
    expect(screen.queryByText(en.ports.portsOffer.replace("{{sequence}}", "Zhuhai (Load) → Xiamen (Discharge)"))).not.toBeInTheDocument();
  });

  test("a second recognise click finding the exact same sequence already in the list offers nothing", async () => {
    await start();
    fireEvent.change(notes(), { target: { value: "装港：珠海\n卸港：厦门" } });
    fireEvent.click(recogniseButton());
    expect(await screen.findByText(en.ports.portsRecognised.replace("{{load}}", "Zhuhai").replace("{{discharge}}", "Xiamen"))).toBeInTheDocument();
    fireEvent.click(recogniseButton());
    expect(screen.queryByText(en.ports.portsOffer.replace("{{sequence}}", "Zhuhai (Load) → Xiamen (Discharge)"))).not.toBeInTheDocument();
    expect(screen.queryByText(en.ports.portsRecognised.replace("{{load}}", "Zhuhai").replace("{{discharge}}", "Xiamen"))).not.toBeInTheDocument();
  });

  test("recognising cargo/terms/ports together in one click, each independently", async () => {
    await start();
    fireEvent.change(notes(), { target: { value: "装港：珠海\n卸港：厦门\n5000吨吨袋氯化钙\nFIO terms" } });
    fireEvent.click(recogniseButton());
    expect((screen.getByLabelText("Port 1") as HTMLInputElement).value).toBe("Zhuhai");
    expect((screen.getByLabelText("Port 2") as HTMLInputElement).value).toBe("Xiamen");
    expect(screen.getByLabelText(en.fields.cargo_description)).toHaveValue("氯化钙");
    expect(screen.getByLabelText(en.fields.contract_terms)).toHaveValue("FIO");
  });
});
