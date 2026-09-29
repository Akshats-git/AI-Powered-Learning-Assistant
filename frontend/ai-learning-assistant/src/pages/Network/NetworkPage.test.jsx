import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../services/networkService", async () => {
  const actual = await vi.importActual("../../services/networkService");
  return {
    ...actual,
    getNetworkStatus: vi.fn(),
    getWeakConcepts: vi.fn(),
    discover: vi.fn(),
    select: vi.fn(),
    init: vi.fn(),
    confirm: vi.fn(),
  };
});

import NetworkPage from "./NetworkPage";
import {
  getNetworkStatus,
  getWeakConcepts,
  discover,
  select,
  init,
  confirm,
} from "../../services/networkService";

const catalog = {
  bppId: "open-university.local",
  provider: { id: "open-university", descriptor: { name: "Open University" } },
  resources: [
    {
      id: "course-graphs-advanced",
      descriptor: { name: "Advanced graph theory", shortDesc: "Flow networks and matchings" },
      resourceAttributes: { kind: "course", level: "advanced", durationMinutes: 300, concepts: ["dijkstra"] },
    },
  ],
  offers: [
    {
      id: "offer-graphs-advanced",
      resourceIds: ["course-graphs-advanced"],
      considerations: [{ considerationAttributes: { priceCurrency: "INR", price: "999" } }],
    },
  ],
};

const configured = () => {
  getNetworkStatus.mockResolvedValue({ data: { configured: true } });
  getWeakConcepts.mockResolvedValue({ data: { concepts: [{ concept: "dijkstra", pKnown: 0.21 }] } });
  discover.mockResolvedValue({ data: { transactionId: "txn-1", catalogs: [catalog] } });
};

describe("NetworkPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("explains itself instead of searching when the deployment is not on a subnet", async () => {
    getNetworkStatus.mockResolvedValue({ data: { configured: false } });
    getWeakConcepts.mockResolvedValue({ data: { concepts: [] } });

    render(<NetworkPage />);

    expect(await screen.findByText(/not on a Beckn subnet/i)).toBeInTheDocument();
    expect(discover).not.toHaveBeenCalled();
  });

  it("offers the learner's weakest concepts and searches by concept when one is picked", async () => {
    configured();
    render(<NetworkPage />);

    const chip = await screen.findByRole("button", { name: /dijkstra/i });
    expect(chip).toHaveTextContent("21%");

    await userEvent.click(chip);

    await waitFor(() => expect(discover).toHaveBeenCalledWith({ concept: "dijkstra" }));
    expect(await screen.findByText("Advanced graph theory")).toBeInTheDocument();
    expect(screen.getByText("Open University")).toBeInTheDocument();
    expect(screen.getByText("₹999")).toBeInTheDocument();
  });

  it("searches free text from the search box", async () => {
    configured();
    render(<NetworkPage />);

    await userEvent.type(await screen.findByLabelText(/search the network/i), "graph theory");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => expect(discover).toHaveBeenCalledWith({ text: "graph theory" }));
  });

  it("walks select, init and confirm when enrolling, and shows the agreed contract", async () => {
    configured();
    select.mockResolvedValue({
      data: { contract: { consideration: [{ considerationAttributes: { priceCurrency: "INR", price: "999" } }] } },
    });
    init.mockResolvedValue({ data: { contract: {} } });
    confirm.mockResolvedValue({
      data: {
        contract: {
          id: "6f1c0b4e-52a1-4b6e-9d0f-2a1f3c4d5e6a",
          status: { code: "ACTIVE" },
          performance: [{ status: { code: "ENROLLED" } }],
        },
      },
    });

    render(<NetworkPage />);
    await userEvent.click(await screen.findByRole("button", { name: /dijkstra/i }));
    await userEvent.click(await screen.findByRole("button", { name: "Enrol" }));

    await waitFor(() => expect(confirm).toHaveBeenCalled());

    // All three contracting actions ran, in order, against the same transaction.
    expect(select).toHaveBeenCalledWith("open-university.local", "txn-1", expect.any(Object));
    expect(init).toHaveBeenCalledWith("open-university.local", "txn-1", expect.any(Object));

    expect(await screen.findByText(/Enrolled in Advanced graph theory/i)).toBeInTheDocument();
    expect(screen.getByText(/ACTIVE/)).toBeInTheDocument();
  });

  it("surfaces a failed enrolment instead of leaving the panel spinning", async () => {
    configured();
    select.mockRejectedValue({ response: { data: { message: "provider unreachable" } } });

    render(<NetworkPage />);
    await userEvent.click(await screen.findByRole("button", { name: /dijkstra/i }));
    await userEvent.click(await screen.findByRole("button", { name: "Enrol" }));

    expect(await screen.findByText("provider unreachable")).toBeInTheDocument();
  });

  it("says so when nothing on the network matches", async () => {
    configured();
    discover.mockResolvedValue({ data: { transactionId: "txn-2", catalogs: [] } });

    render(<NetworkPage />);
    await userEvent.click(await screen.findByRole("button", { name: /dijkstra/i }));

    expect(await screen.findByText(/No provider on the network answered/i)).toBeInTheDocument();
  });
});
