import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SyncStatusBadge, SyncStatusProvider, useSyncStatus } from "@/components/sync/SyncStatusProvider";

describe("SyncStatusProvider", () => {
  it("shows pending, synced, and failed sync states", async () => {
    const success = deferred<string>();
    const failure = deferred<string>();

    function Harness() {
      const { trackSync } = useSyncStatus();

      return (
        <>
          <SyncStatusBadge />
          <button onClick={() => void trackSync(success.promise)} type="button">
            Save
          </button>
          <button onClick={() => void trackSync(failure.promise).catch(() => undefined)} type="button">
            Fail
          </button>
        </>
      );
    }

    render(
      <SyncStatusProvider>
        <Harness />
      </SyncStatusProvider>
    );

    expect(screen.getByRole("status", { name: "Data sync status" })).toHaveTextContent("Synced");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("status", { name: "Data sync status" })).toHaveTextContent("Saving...");

    success.resolve("ok");
    expect(await screen.findByText(/Synced/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Fail" }));
    expect(screen.getByRole("status", { name: "Data sync status" })).toHaveTextContent("Saving...");

    failure.reject(new Error("Disk write failed"));
    expect(await screen.findByText("Sync failed")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Data sync status" })).toHaveAttribute("title", "Disk write failed");
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}
