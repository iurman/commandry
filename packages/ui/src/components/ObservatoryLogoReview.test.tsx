// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ObservatoryLogoReview } from "./ObservatoryLogoReview";

const resource = {
  id: "abcdefab-0000-4000-8000-000000000001",
  name: "ResuPals",
  kind: "repository",
};
const digest = "d".repeat(64);
const commitSha = "c".repeat(40);
const envelope = {
  schemaVersion: 1,
  scopeDigest: "scope",
  projectionRevision: "revision",
  completeness: "complete",
  kind: "logo",
};
const provenance = {
  actorId: "user:owner",
  recordedAt: "2026-10-18T02:00:00.000Z",
  evidenceRefs: ["owner:inspector-preview"],
};
const record = (version: number, active: boolean) => ({
  kind: "logo",
  id: resource.id,
  resourceId: resource.id,
  version,
  active,
  digest,
  mediaType: "image/png",
  width: 128,
  height: 128,
  source: {
    kind: "upload",
    fileName: "resupals.png",
    originalMediaType: "image/png",
    originalByteLength: 12,
    originalDigest: "e".repeat(64),
  },
  provenance,
});
const previewOf = (source: Record<string, unknown>) => ({
  schemaVersion: 1,
  resourceId: resource.id,
  image: {
    digest,
    mediaType: "image/png",
    width: 128,
    height: 128,
    dataBase64: "iVBORw0KGgo=",
  },
  source,
});
function client(items: unknown[][] = [[]]) {
  let index = 0;
  return {
    loadLogo: vi.fn(async () => ({
      ...envelope,
      items: items[Math.min(index++, items.length - 1)],
    })),
    preview: vi.fn(),
    review: vi.fn(),
  };
}
const fill = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
afterEach(cleanup);

describe("Observatory logo review", () => {
  it("previews an upload and approves exactly the previewed digest", async () => {
    const api = client([[], [record(1, true)]]);
    api.preview.mockResolvedValue(
      previewOf({
        kind: "upload",
        fileName: "resupals.png",
        originalMediaType: "image/png",
        originalByteLength: 4,
        originalDigest: "e".repeat(64),
      }),
    );
    api.review.mockResolvedValue({
      id: resource.id,
      version: 1,
      auditId: "abcdefab-0000-4000-8000-0000000000aa",
    });
    const onReviewed = vi.fn();
    render(
      <ObservatoryLogoReview
        resource={resource}
        client={api}
        logoUrl={(id, value) => `/logos/${id}/${value}`}
        onReviewed={onReviewed}
      />,
    );
    await screen.findByText(/No logo is approved/);
    expect(
      screen.getByRole("button", { name: "Approve this logo" }),
    ).toBeDisabled();
    const file = new File([new Uint8Array([1, 2, 3, 4])], "resupals.png", {
      type: "image/png",
    });
    fireEvent.change(screen.getByLabelText(/Logo file/), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview logo" }));
    await screen.findByAltText("Preview of the logo for ResuPals");
    expect(api.preview).toHaveBeenCalledWith({
      resourceId: resource.id,
      input: {
        kind: "upload",
        fileName: "resupals.png",
        dataBase64: "AQIDBA==",
      },
    });
    expect(
      screen.getByAltText("Preview of the logo for ResuPals"),
    ).toHaveAttribute("src", "data:image/png;base64,iVBORw0KGgo=");
    fireEvent.click(screen.getByRole("button", { name: "Approve this logo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "evidence reference and a review note",
    );
    expect(api.review).not.toHaveBeenCalled();
    fill(/Evidence references/, "owner:brand-guide\n\n owner:preview ");
    fill("Review note", "Official mark");
    fireEvent.click(screen.getByRole("button", { name: "Approve this logo" }));
    await waitFor(() => expect(onReviewed).toHaveBeenCalledTimes(1));
    expect(api.review).toHaveBeenCalledWith({
      expectedVersion: 0,
      resourceId: resource.id,
      active: true,
      expectedDigest: digest,
      input: {
        kind: "upload",
        fileName: "resupals.png",
        dataBase64: "AQIDBA==",
      },
      review: {
        evidenceRefs: ["owner:brand-guide", "owner:preview"],
        note: "Official mark",
      },
    });
    expect(
      await screen.findByAltText("Approved logo for ResuPals"),
    ).toHaveAttribute("src", `/logos/${resource.id}/${digest}`);
    expect(screen.getByText(/Approved, version 1/)).toBeInTheDocument();
  });

  it("approves a repository file at the commit the preview resolved", async () => {
    const api = client([[], [record(1, true)]]);
    api.preview.mockResolvedValue(
      previewOf({
        kind: "repository_file",
        repository: "iurman/resupals",
        path: "public/favicon.svg",
        commitSha,
        blobSha: "b".repeat(40),
        originalMediaType: "image/svg+xml",
        originalByteLength: 900,
        originalDigest: "e".repeat(64),
      }),
    );
    api.review.mockResolvedValue({ id: resource.id, version: 1, auditId: "x" });
    render(
      <ObservatoryLogoReview
        resource={resource}
        client={api}
        onReviewed={vi.fn()}
      />,
    );
    await screen.findByText(/No logo is approved/);
    fireEvent.click(screen.getByLabelText("File in the GitHub repository"));
    fill(/Repository \(owner\/name\)/, " iurman/resupals ");
    fill(/Path in the repository/, "/public/favicon.svg");
    fireEvent.click(screen.getByRole("button", { name: "Preview logo" }));
    await screen.findByText(new RegExp(`at commit ${commitSha}`));
    expect(api.preview).toHaveBeenCalledWith({
      resourceId: resource.id,
      input: {
        kind: "repository_file",
        repository: "iurman/resupals",
        path: "public/favicon.svg",
        ref: null,
      },
    });
    fill(/Evidence references/, "github:iurman/resupals");
    fill("Review note", "Repository favicon");
    fireEvent.click(screen.getByRole("button", { name: "Approve this logo" }));
    await waitFor(() => expect(api.review).toHaveBeenCalled());
    expect(api.review.mock.calls[0]![0]).toMatchObject({
      expectedDigest: digest,
      input: {
        kind: "repository_file",
        repository: "iurman/resupals",
        path: "public/favicon.svg",
        commitSha,
      },
    });
  });

  it("explains safe failure codes and keeps the draft after a conflict", async () => {
    const api = client([[]]);
    api.preview.mockRejectedValueOnce(
      Object.assign(new Error("x"), { code: "LOGO_SOURCE_UNAUTHORIZED" }),
    );
    render(
      <ObservatoryLogoReview
        resource={resource}
        client={api}
        onReviewed={vi.fn()}
      />,
    );
    await screen.findByText(/No logo is approved/);
    fireEvent.click(screen.getByLabelText("File in the GitHub repository"));
    fill(/Repository \(owner\/name\)/, "iurman/aviune");
    fill(/Path in the repository/, "logo.svg");
    fireEvent.click(screen.getByRole("button", { name: "Preview logo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "server's GitHub token",
    );
    api.preview.mockResolvedValueOnce(
      previewOf({
        kind: "upload",
        fileName: "a.png",
        originalMediaType: "image/png",
        originalByteLength: 4,
        originalDigest: "e".repeat(64),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Preview logo" }));
    await screen.findByAltText("Preview of the logo for ResuPals");
    api.review.mockRejectedValueOnce(
      Object.assign(new Error("x"), { code: "VERSION_CONFLICT" }),
    );
    fill(/Evidence references/, "owner:preview");
    fill("Review note", "Approve");
    fireEvent.click(screen.getByRole("button", { name: "Approve this logo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Preview again");
    expect(screen.getByLabelText("Review note")).toHaveValue("Approve");
    expect(
      screen.getByAltText("Preview of the logo for ResuPals"),
    ).toBeInTheDocument();
    api.preview.mockRejectedValueOnce(new Error("network"));
    fireEvent.click(screen.getByRole("button", { name: "Preview logo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The preview could not be produced.",
    );
  });

  it("retires an approved logo without an input or digest", async () => {
    const api = client([[record(3, true)], [record(4, false)]]);
    api.review.mockResolvedValue({ id: resource.id, version: 4, auditId: "x" });
    const onReviewed = vi.fn();
    render(
      <ObservatoryLogoReview
        resource={resource}
        client={api}
        onReviewed={onReviewed}
      />,
    );
    await screen.findByText(/Approved, version 3/);
    fill(/Evidence references/, "owner:rebrand");
    fill("Review note", "Retired brand");
    fireEvent.click(screen.getByRole("button", { name: "Retire logo" }));
    await waitFor(() => expect(onReviewed).toHaveBeenCalled());
    expect(api.review).toHaveBeenCalledWith({
      expectedVersion: 3,
      resourceId: resource.id,
      active: false,
      expectedDigest: null,
      input: null,
      review: { evidenceRefs: ["owner:rebrand"], note: "Retired brand" },
    });
    expect(await screen.findByText(/Retired, version 4/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retire logo" })).toBeNull();
  });

  it("refuses an oversized upload before sending it", async () => {
    const api = client([[]]);
    render(
      <ObservatoryLogoReview
        resource={resource}
        client={api}
        onReviewed={vi.fn()}
      />,
    );
    await screen.findByText(/No logo is approved/);
    const large = new File([new Uint8Array(524289)], "big.png", {
      type: "image/png",
    });
    fireEvent.change(screen.getByLabelText(/Logo file/), {
      target: { files: [large] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview logo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("512 KiB");
    expect(api.preview).not.toHaveBeenCalled();
  });
});

describe("Observatory logo review without a readable record", () => {
  it("never claims no logo or approves at version zero when the record cannot load", async () => {
    const api = client([[]]);
    api.loadLogo.mockRejectedValueOnce(new Error("offline"));
    api.preview.mockResolvedValue(
      previewOf({
        kind: "upload",
        fileName: "a.png",
        originalMediaType: "image/png",
        originalByteLength: 4,
        originalDigest: "e".repeat(64),
      }),
    );
    render(
      <ObservatoryLogoReview
        resource={resource}
        client={api}
        onReviewed={vi.fn()}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "logo record is unavailable",
    );
    expect(screen.queryByText(/No logo is approved/)).toBeNull();
    expect(screen.queryByText(/Loading the reviewed logo record/)).toBeNull();
    fireEvent.change(screen.getByLabelText(/Logo file/), {
      target: { files: [new File([new Uint8Array([1])], "a.png")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview logo" }));
    await screen.findByAltText("Preview of the logo for ResuPals");
    expect(
      screen.getByRole("button", { name: "Approve this logo" }),
    ).toBeDisabled();
    // Previewing does not hide the unreadable record or its reload action.
    expect(screen.getByText(/logo record is unavailable/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reload logo record" }));
    await screen.findByText(/No logo is approved/);
    expect(api.review).not.toHaveBeenCalled();
  });
});
